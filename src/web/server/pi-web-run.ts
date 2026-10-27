import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { readJsonFile } from "./json-file.ts";

interface PiWebRun {
  port?: number;
  hostname?: string;
}

export function detectTarget(agentDir: string): string | undefined {
  const dir = join(agentDir, "pi-web-run");
  if (!existsSync(dir)) return undefined;
  const newestFirst = readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => join(dir, file))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  const run = newestFirst[0] ? readJsonFile<PiWebRun>(newestFirst[0]) : undefined;
  return run?.port ? `http://${run.hostname || "127.0.0.1"}:${run.port}` : undefined;
}
