# Codex WeChat Bridge

An experimental bridge project for sending messages into an existing Codex session and reading the reply back out.

This project is intentionally separate from OpenClaw and IncenseClaw.

## What this project does

- Continue an existing Codex thread by session id
- Expose a small local HTTP API for sending messages into that thread
- Optionally long-poll a Weixin account and relay inbound text to Codex
- Send Codex's final reply back to Weixin

## Why this approach

For a "true bridge" MVP, the cleanest entry point on this machine is not the desktop UI itself. It is the Codex CLI's ability to continue an existing session:

`codex exec resume <session-id> <prompt>`

That gives us a programmatic way to:

1. keep using the current thread context
2. inject a new message
3. capture the assistant's final reply

## Requirements

- Node.js 22+
- A local `codex` CLI install
- A local Codex desktop/CLI environment with resumable sessions
- Optional: an OpenClaw Weixin login if you want relay mode

## Quick start

1. Clone the repo
2. Copy `bridge.config.json.example` to `bridge.config.json`
3. Fill in your own local values
4. Run the CLI or HTTP server

```bash
git clone https://github.com/cyberpinkman/codex-wechat-bridge.git
cd codex-wechat-bridge
cp bridge.config.json.example bridge.config.json
```

## Minimal usage

Useful commands:

```bash
cd /path/to/codex-wechat-bridge
npm run latest
npm run locate -- --session-id YOUR-CODEX-SESSION-ID
npm run send -- --session-id YOUR-CODEX-SESSION-ID --message "reply with hello only"
```

Structured JSON output:

```bash
node ./src/index.mjs send \
  --session-id YOUR-CODEX-SESSION-ID \
  --message "reply with hello only" \
  --json
```

## HTTP bridge

Start the local bridge:

```bash
cd /path/to/codex-wechat-bridge
npm run serve
```

Then test it:

```bash
curl http://127.0.0.1:4318/health
```

```bash
curl -X POST http://127.0.0.1:4318/bridge/send \
  -H 'authorization: Bearer SET-A-LONG-RANDOM-TOKEN' \
  -H 'content-type: application/json' \
  -d '{"message":"reply with hello only"}'
```

## Configuration reference

Example config fields:

```json
{
  "sessionId": "YOUR-CODEX-SESSION-ID",
  "codexHome": "/absolute/path/to/.codex",
  "cwd": "/absolute/path/for/codex/workdir",
  "host": "127.0.0.1",
  "port": 4318,
  "http": {
    "authToken": "SET-A-LONG-RANDOM-TOKEN",
    "allowSessionOverride": false,
    "maxBodyBytes": 16384
  },
  "codex": {
    "timeoutMs": 120000,
    "maxQueueDepth": 4,
    "dangerousBypass": false
  },
  "weixin": {
    "enabled": true,
    "accountId": "YOUR-WEIXIN-ACCOUNT-ID",
    "syncFile": "/absolute/path/to/codex-wechat-bridge/tmp/weixin-sync.json",
    "pollTimeoutMs": 35000,
    "stateDir": "/absolute/path/to/.openclaw",
    "allowOwner": true,
    "allowFrom": []
  }
}
```

Field meanings:

- `sessionId`: Codex thread id to resume into
- `codexHome`: local Codex home directory, usually `~/.codex`
- `cwd`: working directory used by `codex exec resume`
- `host`: HTTP bind host for this bridge
- `port`: HTTP bind port for this bridge
- `http.authToken`: required token for `POST /bridge/send`
- `http.allowSessionOverride`: when `false`, callers cannot choose a different session id
- `http.maxBodyBytes`: maximum accepted HTTP request body size
- `codex.timeoutMs`: max time allowed for one `codex exec resume` call
- `codex.maxQueueDepth`: max queued bridge requests before rejecting
- `codex.dangerousBypass`: when `true`, re-enable `--dangerously-bypass-approvals-and-sandbox`
- `weixin.enabled`: enable the built-in Weixin relay loop
- `weixin.accountId`: local Weixin account id created by the plugin login flow
- `weixin.syncFile`: local file used by this project to store its own Weixin polling cursor
- `weixin.pollTimeoutMs`: long-poll timeout for `getupdates`
- `weixin.stateDir`: local OpenClaw state directory, usually `~/.openclaw`
- `weixin.allowOwner`: when `true`, only the linked owner account is allowed by default
- `weixin.allowFrom`: optional extra Weixin user ids allowed to control the relay

## How to find your local values

### Find the Codex session id

Use:

```bash
cd /path/to/codex-wechat-bridge
npm run latest
```

Or inspect:

```bash
cat ~/.codex/session_index.jsonl
```

### Find your Weixin account id

After logging in with the OpenClaw Weixin plugin, inspect:

```bash
cat ~/.openclaw/openclaw-weixin/accounts.json
```

That file contains the account ids you can use as `weixin.accountId`.

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
  -H 'authorization: Bearer SET-A-LONG-RANDOM-TOKEN' \
  -H 'content-type: application/json' \
  -d '{"message":"reply with hello only"}'
```

## Weixin relay mode

If `bridge.config.json` contains a `weixin.enabled: true` section, `npm run serve` will also:

- load the saved Weixin account token from `<OPENCLAW_STATE_DIR>/openclaw-weixin/accounts/<accountId>.json`
- long-poll `getupdates`
- forward inbound text to the configured Codex session
- send the final Codex reply back through `sendmessage`

Important:

- Do not let OpenClaw's own Weixin monitor and this bridge consume the same account at the same time.
- For the cleanest test, stop the OpenClaw gateway first, then run this bridge.
- This relay currently focuses on text messages for the MVP.
- By default, only the linked owner account is allowed to control the relay unless you expand `weixin.allowFrom`.

## Operating notes

- The bridge does not store your Weixin token in the repo.
- Your real `bridge.config.json` is intentionally ignored by git.
- Your local machine paths, account ids, and session ids must be supplied by each user.
- The HTTP bridge expects an auth token for message injection.
- Cross-thread HTTP overrides are disabled by default.
- If you want to preserve the previous "Codex can execute without approvals" behavior on your own machine, set `codex.dangerousBypass` to `true` in your ignored local `bridge.config.json`.

## Known rough edges

- You may see local Codex warnings depending on your machine's install state.
- The bridge currently relies on the local `codex exec resume` behavior and transcript discovery.
- The Weixin relay is intentionally minimal and not production-hardened.
- If you need Codex to execute commands without approvals, you must explicitly opt in via `codex.dangerousBypass`.

## Architecture

See [docs/architecture.md](./docs/architecture.md).
