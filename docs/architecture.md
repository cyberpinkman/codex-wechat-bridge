# MVP Architecture

## Goal

Bridge a message from an external channel into the current Codex thread, then return the final assistant reply.

## Current adapter path

```text
External message
  -> bridge process
  -> local HTTP server
  -> codex exec resume <session-id> <prompt>
  -> Codex continues the existing session
  -> bridge reads final reply from -o output file
  -> external channel receives reply
```

## Why not drive the desktop UI directly

Driving the visible desktop app would be much more brittle than using the built-in session continuation path already present in the local `codex` CLI.

## Why not parse terminal output

The bridge captures the last assistant message through Codex's `-o` option. That is much easier to stabilize than parsing full terminal output.

## Main files

- `src/index.mjs`: CLI entry
- `src/server.mjs`: local HTTP bridge
- `src/config.mjs`: config loading and defaults
- `src/codex-session.mjs`: session discovery helpers
- `src/codex-thread-adapter.mjs`: Codex session send/receive adapter
- `src/weixin-relay.mjs`: Weixin long-poll relay loop
