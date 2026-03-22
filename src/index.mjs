#!/usr/bin/env node
import path from "node:path";
import { findSessionTranscriptPath, resolveLatestSessionId } from "./codex-session.mjs";
import { sendMessageToCodexThread } from "./codex-thread-adapter.mjs";
import { loadConfig, resolveSettings } from "./config.mjs";

function parseArgs(argv) {
  const [command = "help", ...rest] = argv;
  const options = { _: [] };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = rest[index + 1];
      if (!next || next.startsWith("--")) {
        options[key] = true;
      } else {
        options[key] = next;
        index += 1;
      }
    } else {
      options._.push(token);
    }
  }
  return { command, options };
}

function printHelp() {
  console.log(`codex-wechat-bridge

Commands:
  latest                         Print the latest Codex session id
  locate [--session-id <id>]     Print the transcript path for a session
  send --message <text>          Send a message into a Codex session and print the reply

Options:
  --session-id <id>              Explicit Codex session id
  --codex-home <path>            Codex home directory (default: ~/.codex)
  --cwd <path>                   Working directory for codex exec resume
  --host <host>                  Host for HTTP server mode
  --port <port>                  Port for HTTP server mode
  --message <text>               Message to send
  --json                         Print structured JSON output
`);
}

async function main() {
  const projectRoot = path.dirname(new URL(import.meta.url).pathname);
  const rootDir = path.dirname(projectRoot);
  const { command, options } = parseArgs(process.argv.slice(2));
  const config = await loadConfig(rootDir);
  const settings = resolveSettings(rootDir, options, config);

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "latest") {
    const sessionId = settings.sessionId ?? (await resolveLatestSessionId(settings.codexHome));
    if (options.json) {
      console.log(JSON.stringify({ sessionId }, null, 2));
    } else {
      console.log(sessionId);
    }
    return;
  }

  if (command === "locate") {
    const sessionId = settings.sessionId ?? (await resolveLatestSessionId(settings.codexHome));
    const transcriptPath = await findSessionTranscriptPath(settings.codexHome, sessionId);
    if (options.json) {
      console.log(JSON.stringify({ sessionId, transcriptPath }, null, 2));
    } else {
      console.log(transcriptPath);
    }
    return;
  }

  if (command === "send") {
    const message = options.message ?? options._.join(" ");
    if (!message) {
      throw new Error("Missing --message for send command");
    }

    const result = await sendMessageToCodexThread({
      codexHome: settings.codexHome,
      cwd: settings.cwd,
      sessionId: settings.sessionId,
      message
    });

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            sessionId: result.sessionId,
            transcriptPath: result.transcriptPath,
            exitCode: result.exitCode,
            reply: result.reply,
            stderrPreview: result.stderr.split("\n").filter(Boolean).slice(0, 8)
          },
          null,
          2
        )
      );
    } else {
      console.log(result.reply);
    }
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
