import fs from "node:fs/promises";
import path from "node:path";

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonLines(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export async function resolveLatestSessionId(codexHome) {
  const indexPath = path.join(codexHome, "session_index.jsonl");
  const rows = await readJsonLines(indexPath);
  const last = rows.at(-1);
  if (!last?.id) {
    throw new Error(`No session id found in ${indexPath}`);
  }
  return last.id;
}

export async function findSessionTranscriptPath(codexHome, sessionId) {
  const sessionsDir = path.join(codexHome, "sessions");

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        const nested = await walk(entryPath);
        if (nested) {
          return nested;
        }
      } else if (entry.isFile() && entry.name.includes(sessionId) && entry.name.endsWith(".jsonl")) {
        return entryPath;
      }
    }
    return null;
  }

  if (!(await pathExists(sessionsDir))) {
    throw new Error(`Codex sessions directory not found: ${sessionsDir}`);
  }

  const transcriptPath = await walk(sessionsDir);
  if (!transcriptPath) {
    throw new Error(`Could not locate transcript for session ${sessionId}`);
  }
  return transcriptPath;
}
