# Codex WeChat Bridge

An experimental bridge project for sending messages into an existing Codex session and reading the reply back out.

This project is intentionally separate from OpenClaw and IncenseClaw.

## What works today

- Resolve the latest Codex session id from `~/.codex/session_index.jsonl`
- Locate the transcript file for a specific session
- Send a message into an existing Codex thread with `codex exec resume`
- Capture the final assistant reply via `-o <file>`

## Why this approach

For a "true bridge" MVP, the cleanest entry point on this machine is not the desktop UI itself. It is the Codex CLI's ability to continue an existing session:

`codex exec resume <session-id> <prompt>`

That gives us a programmatic way to:

1. keep using the current thread context
2. inject a new message
3. capture the assistant's final reply

## Quick start

Optional config:

1. Copy `bridge.config.json.example` to `bridge.config.json`
2. Set your target `sessionId`
3. Set absolute local paths for `codexHome`, `cwd`, and the Weixin state/config fields

Examples:

```bash
cd /path/to/codex-wechat-bridge
npm run latest
npm run locate -- --session-id YOUR-CODEX-SESSION-ID
npm run send -- --session-id YOUR-CODEX-SESSION-ID --message "reply with hello only"
```

Structured output:

```bash
node ./src/index.mjs send \
  --session-id YOUR-CODEX-SESSION-ID \
  --message "reply with hello only" \
  --json
```

## Run the local HTTP bridge

```bash
cd /path/to/codex-wechat-bridge
npm run serve
```

Health check:

```bash
curl http://127.0.0.1:4318/health
```

Send a message into the configured Codex thread:

```bash
curl -X POST http://127.0.0.1:4318/bridge/send \
  -H 'content-type: application/json' \
  -d '{"sessionId":"YOUR-CODEX-SESSION-ID","message":"reply with hello only"}'
```

## Known rough edges

- You may see local Codex warnings depending on your machine's install state.
- The bridge currently relies on the local `codex exec resume` behavior and transcript discovery.

## Next step for WeChat integration

The next layer is to let the WeChat side call this local HTTP service:

- inbound webhook/message from WeChat side
- POST to `/bridge/send`
- send the returned `reply` back to WeChat

This HTTP piece is now implemented in the MVP.

## Weixin relay mode

If `bridge.config.json` contains a `weixin.enabled: true` section, `npm run serve` will also:

- load the saved Weixin account token from `<OPENCLAW_STATE_DIR>/openclaw-weixin/accounts/<accountId>.json`
- long-poll `getupdates`
- forward inbound text to the configured Codex session
- send the final Codex reply back through `sendmessage`

Important:

- Do not let OpenClaw's own Weixin monitor and this bridge consume the same account at the same time.
- For the cleanest test, stop the OpenClaw gateway first, then run this bridge.

## Required local fields

These fields are intentionally left as placeholders and must be filled in by each user:

- `sessionId`: the Codex thread you want to bridge into
- `codexHome`: usually your local `.codex` directory
- `cwd`: the working directory Codex should use when resuming
- `weixin.accountId`: the saved Weixin account id created by the plugin login flow
- `weixin.syncFile`: a local path where this bridge stores its own polling cursor
- `weixin.stateDir`: your local OpenClaw state directory if you want relay mode
