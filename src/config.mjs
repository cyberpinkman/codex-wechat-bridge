import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function loadConfig(projectRoot) {
  const configPath = path.join(projectRoot, "bridge.config.json");
  try {
    const raw = await fs.readFile(configPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function resolveSettings(projectRoot, options, config) {
  return {
    codexHome: options["codex-home"] ?? config.codexHome ?? path.join(os.homedir(), ".codex"),
    cwd: options.cwd ?? config.cwd ?? process.cwd(),
    sessionId: options["session-id"] ?? config.sessionId,
    port: Number(options.port ?? config.port ?? process.env.PORT ?? 4318),
    host: options.host ?? config.host ?? process.env.HOST ?? "127.0.0.1",
    http: {
      authToken: config.http?.authToken ?? process.env.BRIDGE_AUTH_TOKEN ?? null,
      allowSessionOverride: Boolean(config.http?.allowSessionOverride),
      maxBodyBytes: Number(config.http?.maxBodyBytes ?? 16 * 1024)
    },
    codex: {
      timeoutMs: Number(config.codex?.timeoutMs ?? 120_000),
      maxQueueDepth: Number(config.codex?.maxQueueDepth ?? 4),
      dangerousBypass: Boolean(config.codex?.dangerousBypass)
    },
    weixin: {
      enabled: Boolean(config.weixin?.enabled),
      accountId: config.weixin?.accountId,
      syncFile: config.weixin?.syncFile ?? path.join(projectRoot, "tmp", "weixin-sync.json"),
      pollTimeoutMs: Number(config.weixin?.pollTimeoutMs ?? 35000),
      stateDir: config.weixin?.stateDir ?? path.join(os.homedir(), ".openclaw"),
      allowFrom: Array.isArray(config.weixin?.allowFrom)
        ? config.weixin.allowFrom.filter((value) => typeof value === "string" && value.trim())
        : [],
      allowOwner: config.weixin?.allowOwner !== false
    }
  };
}
