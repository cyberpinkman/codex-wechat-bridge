import fs from "node:fs/promises";
import path from "node:path";
import { loadWeixinAccount } from "./weixin-account.mjs";
import { getWeixinUpdates, sendWeixinText } from "./weixin-api.mjs";
import { sendMessageToCodexThread } from "./codex-thread-adapter.mjs";

function extractBody(message) {
  const items = Array.isArray(message?.item_list) ? message.item_list : [];
  for (const item of items) {
    if (item?.type === 1 && item?.text_item?.text) {
      return String(item.text_item.text).trim();
    }
    if (item?.type === 3 && item?.voice_item?.text) {
      return String(item.voice_item.text).trim();
    }
  }
  return "";
}

function shouldHandleMessage(message) {
  if (!message) {
    return false;
  }
  if (message.message_type !== 1) {
    return false;
  }
  return Boolean(extractBody(message));
}

function isAuthorizedSender(message, account, weixin) {
  const senderId = typeof message?.from_user_id === "string" ? message.from_user_id.trim() : "";
  const allowedSenders = new Set(
    (Array.isArray(weixin?.allowFrom) ? weixin.allowFrom : []).filter(Boolean)
  );

  if (weixin?.allowOwner !== false && account.userId) {
    allowedSenders.add(account.userId);
  }

  if (allowedSenders.size === 0) {
    return false;
  }

  return allowedSenders.has(senderId);
}

async function readSyncCursor(syncFile) {
  try {
    const raw = await fs.readFile(syncFile, "utf8");
    const data = JSON.parse(raw);
    return typeof data.get_updates_buf === "string" ? data.get_updates_buf : "";
  } catch {
    return "";
  }
}

async function writeSyncCursor(syncFile, getUpdatesBuf) {
  await fs.mkdir(path.dirname(syncFile), { recursive: true });
  await fs.writeFile(syncFile, JSON.stringify({ get_updates_buf: getUpdatesBuf }, null, 2), "utf8");
}

export async function startWeixinRelay({
  codex,
  weixin,
  log = console.log
}) {
  if (!weixin?.enabled) {
    return { stop() {} };
  }

  const account = await loadWeixinAccount({
    stateDir: weixin.stateDir,
    accountId: weixin.accountId
  });

  let stopped = false;
  let cursor = await readSyncCursor(weixin.syncFile);

  async function loop() {
    while (!stopped) {
      try {
        const updates = await getWeixinUpdates({
          baseUrl: account.baseUrl,
          token: account.token,
          getUpdatesBuf: cursor,
          timeoutMs: weixin.pollTimeoutMs ?? 35000
        });

        if (typeof updates.get_updates_buf === "string" && updates.get_updates_buf) {
          cursor = updates.get_updates_buf;
          await writeSyncCursor(weixin.syncFile, cursor);
        }

        const messages = Array.isArray(updates.msgs) ? updates.msgs : [];
        for (const message of messages) {
          if (!shouldHandleMessage(message)) {
            continue;
          }

          if (!isAuthorizedSender(message, account, weixin)) {
            log("[weixin-relay] ignored unauthorized sender");
            continue;
          }

          const body = extractBody(message);
          log(`[weixin-relay] inbound accepted bodyLength=${body.length}`);

          const result = await sendMessageToCodexThread({
            codexHome: codex.codexHome,
            cwd: codex.cwd,
            sessionId: codex.sessionId,
            message: body,
            timeoutMs: codex.timeoutMs,
            dangerousBypass: codex.dangerousBypass,
            maxQueueDepth: codex.maxQueueDepth
          });

          await sendWeixinText({
            baseUrl: account.baseUrl,
            token: account.token,
            toUserId: message.from_user_id,
            contextToken: message.context_token,
            text: result.reply
          });

          log(`[weixin-relay] reply sent replyLength=${result.reply.length}`);
        }
      } catch (error) {
        log(`[weixin-relay] error: ${error instanceof Error ? error.message : String(error)}`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  loop();

  return {
    stop() {
      stopped = true;
    }
  };
}
