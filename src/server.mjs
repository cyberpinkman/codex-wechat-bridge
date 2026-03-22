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

function getHeaderValue(request, headerName) {
  const value = request.headers[headerName];
  return Array.isArray(value) ? value[0] : value;
}

function readBearerToken(request) {
  const authorization = getHeaderValue(request, "authorization");
  if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }
  const bridgeToken = getHeaderValue(request, "x-bridge-token");
  return typeof bridgeToken === "string" ? bridgeToken.trim() : "";
}

function requireAuthToken(request, expectedToken) {
  if (!expectedToken) {
    return false;
  }
  return readBearerToken(request) === expectedToken;
}

async function readJsonBody(request, maxBodyBytes) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maxBodyBytes) {
      throw new Error("request body too large");
    }
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("invalid json body");
  }
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
      sessionId: settings.sessionId,
      timeoutMs: settings.codex.timeoutMs,
      dangerousBypass: settings.codex.dangerousBypass,
      maxQueueDepth: settings.codex.maxQueueDepth
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
          httpAuthConfigured: Boolean(settings.http.authToken),
          weixinEnabled: settings.weixin.enabled
        });
        return;
      }

      if (request.method === "POST" && request.url === "/bridge/send") {
        if (!requireAuthToken(request, settings.http.authToken)) {
          sendJson(response, 401, {
            ok: false,
            error: "unauthorized"
          });
          return;
        }

        const body = await readJsonBody(request, settings.http.maxBodyBytes);
        const message = typeof body.message === "string" ? body.message.trim() : "";
        if (!message) {
          sendJson(response, 400, {
            ok: false,
            error: "message is required"
          });
          return;
        }

        if (
          body.sessionId &&
          !settings.http.allowSessionOverride &&
          body.sessionId !== settings.sessionId
        ) {
          sendJson(response, 403, {
            ok: false,
            error: "session override is disabled"
          });
          return;
        }

        const result = await sendMessageToCodexThread({
          codexHome: settings.codexHome,
          cwd: settings.cwd,
          sessionId: typeof body.sessionId === "string" && body.sessionId.trim() ? body.sessionId.trim() : settings.sessionId,
          message,
          timeoutMs: settings.codex.timeoutMs,
          dangerousBypass: settings.codex.dangerousBypass,
          maxQueueDepth: settings.codex.maxQueueDepth
        });

        sendJson(response, 200, {
          ok: true,
          reply: result.reply,
          exitCode: result.exitCode
        });
        return;
      }

      sendJson(response, 404, {
        ok: false,
        error: "not found"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode =
        message === "request body too large"
          ? 413
          : message === "invalid json body"
            ? 400
            : 500;
      sendJson(response, statusCode, {
        ok: false,
        error: message
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
          httpAuthConfigured: Boolean(settings.http.authToken),
          sessionOverrideEnabled: settings.http.allowSessionOverride,
          codexDangerousBypass: settings.codex.dangerousBypass,
          weixinEnabled: settings.weixin.enabled,
          weixinOwnerLockEnabled: settings.weixin.allowOwner || settings.weixin.allowFrom.length > 0
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
