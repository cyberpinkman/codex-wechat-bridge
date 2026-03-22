import crypto from "node:crypto";

function ensureTrailingSlash(url) {
  return url.endsWith("/") ? url : `${url}/`;
}

function randomWechatUin() {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), "utf8").toString("base64");
}

function buildHeaders({ token, body }) {
  return {
    "Content-Type": "application/json",
    AuthorizationType: "ilink_bot_token",
    Authorization: `Bearer ${token}`,
    "Content-Length": String(Buffer.byteLength(body, "utf8")),
    "X-WECHAT-UIN": randomWechatUin()
  };
}

async function postJson({ baseUrl, endpoint, token, body, timeoutMs }) {
  const url = new URL(endpoint, ensureTrailingSlash(baseUrl)).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: buildHeaders({
        token,
        body: JSON.stringify(body)
      }),
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${endpoint} ${response.status}: ${text}`);
    }
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timer);
  }
}

export async function getWeixinUpdates({ baseUrl, token, getUpdatesBuf = "", timeoutMs = 35000 }) {
  return postJson({
    baseUrl,
    endpoint: "ilink/bot/getupdates",
    token,
    timeoutMs,
    body: {
      get_updates_buf: getUpdatesBuf,
      base_info: {}
    }
  });
}

export async function sendWeixinText({ baseUrl, token, toUserId, contextToken, text, timeoutMs = 15000 }) {
  return postJson({
    baseUrl,
    endpoint: "ilink/bot/sendmessage",
    token,
    timeoutMs,
    body: {
      msg: {
        from_user_id: "",
        to_user_id: toUserId,
        client_id: `bridge-${Date.now()}`,
        message_type: 2,
        message_state: 2,
        context_token: contextToken,
        item_list: [
          {
            type: 1,
            text_item: {
              text
            }
          }
        ]
      },
      base_info: {}
    }
  });
}
