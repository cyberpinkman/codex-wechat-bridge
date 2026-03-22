import fs from "node:fs/promises";
import path from "node:path";

export async function loadWeixinAccount({ stateDir, accountId }) {
  const filePath = path.join(stateDir, "openclaw-weixin", "accounts", `${accountId}.json`);
  const raw = await fs.readFile(filePath, "utf8");
  const data = JSON.parse(raw);
  if (!data?.token) {
    throw new Error(`Missing weixin token in ${filePath}`);
  }
  return {
    accountId,
    filePath,
    token: data.token,
    baseUrl: data.baseUrl ?? "https://ilinkai.weixin.qq.com",
    userId: data.userId ?? null
  };
}
