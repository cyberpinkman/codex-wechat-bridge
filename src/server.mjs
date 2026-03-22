import http from "node:http";
import path from "node:path";
import { loadConfig, resolveSettings } from "./config.mjs";
import { sendMessageToCodexThread } from "./codex-thread-adapter.mjs";
import { startWeixinRelay } from "./weixin-relay.mjs";

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload, null, 2));
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
}

async function main() {
  const projectRoot = path.dirname(new URL(import.meta.url).pathname);
  const rootDir = path.dirname(projectRoot);
  const config = await loadConfig(rootDir);
  const settings = resolveSettings(rootDir, {}, config);
  const relay = await startWeixinRelay({
    codex: {
      codexHome: settings.codexHome,
      cwd: settings.cwd,
      sessionId: settings.sessionId
    },
    weixin: settings.weixin,
    log: (message) => console.log(message)
  });

  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health") {
        sendJson(response, 200, {
          ok: true,
          service: "codex-wechat-bridge",
          sessionId: settings.sessionId ?? process.env.CODEX_THREAD_ID ?? null
        });
        return;
      }

      if (request.method === "POST" && request.url === "/bridge/send") {
        const body = await readJsonBody(request);
        const message = typeof body.message === "string" ? body.message.trim() : "";
        if (!message) {
          sendJson(response, 400, {
            ok: false,
            error: "message is required"
          });
          return;
        }

        const result = await sendMessageToCodexThread({
          codexHome: settings.codexHome,
          cwd: settings.cwd,
          sessionId: typeof body.sessionId === "string" && body.sessionId.trim() ? body.sessionId.trim() : settings.sessionId,
          message
        });

        sendJson(response, 200, {
          ok: true,
          sessionId: result.sessionId,
          reply: result.reply,
          transcriptPath: result.transcriptPath,
          exitCode: result.exitCode,
          stderrPreview: result.stderr.split("\n").filter(Boolean).slice(0, 8)
        });
        return;
      }

      sendJson(response, 404, {
        ok: false,
        error: "not found"
      });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  server.listen(settings.port, settings.host, () => {
    console.log(
      JSON.stringify(
        {
          ok: true,
          host: settings.host,
          port: settings.port,
          sessionId: settings.sessionId ?? process.env.CODEX_THREAD_ID ?? null,
          weixinEnabled: settings.weixin.enabled,
          weixinAccountId: settings.weixin.accountId ?? null
        },
        null,
        2
      )
    );
  });

  process.on("SIGINT", () => {
    relay.stop();
    server.close(() => process.exit(0));
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
