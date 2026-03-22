import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { findSessionTranscriptPath, resolveLatestSessionId } from "./codex-session.mjs";

let queuedRuns = 0;
let activeRun = Promise.resolve();

function onceExit(child) {
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function mkBridgeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "codex-wechat-bridge-"));
}

export async function resolveSessionId({ codexHome, explicitSessionId }) {
  if (explicitSessionId) {
    return explicitSessionId;
  }
  if (process.env.CODEX_THREAD_ID) {
    return process.env.CODEX_THREAD_ID;
  }
  return resolveLatestSessionId(codexHome);
}

export async function sendMessageToCodexThread({
  codexHome,
  cwd,
  sessionId,
  message,
  timeoutMs = 120_000,
  dangerousBypass = false,
  maxQueueDepth = 4
}) {
  if (queuedRuns >= maxQueueDepth) {
    throw new Error("bridge queue is full");
  }

  queuedRuns += 1;
  const runTask = async () => {
    const effectiveSessionId = await resolveSessionId({ codexHome, explicitSessionId: sessionId });
    const transcriptPath = await findSessionTranscriptPath(codexHome, effectiveSessionId);
    const tmpDir = await mkBridgeTempDir();
    const outputPath = path.join(tmpDir, "last-message.txt");

    const args = [
      "exec",
      "resume",
      effectiveSessionId,
      "--skip-git-repo-check",
      "-o",
      outputPath
    ];
    if (dangerousBypass) {
      args.push("--dangerously-bypass-approvals-and-sandbox");
    }
    args.push(message);

    const child = spawn("codex", args, {
      cwd,
      env: {
        ...process.env,
        CODEX_HOME: codexHome
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeoutMs);

    try {
      const exitCode = await onceExit(child);
      const reply = await fs.readFile(outputPath, "utf8");
      return {
        sessionId: effectiveSessionId,
        transcriptPath,
        reply: reply.trim(),
        exitCode,
        stdout,
        stderr
      };
    } finally {
      clearTimeout(timeout);
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  };

  const queuedTask = activeRun.then(runTask, runTask);
  activeRun = queuedTask.then(() => {}, () => {});

  try {
    return await queuedTask;
  } finally {
    queuedRuns -= 1;
  }
}
