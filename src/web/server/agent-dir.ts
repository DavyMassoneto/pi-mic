import { homedir } from "node:os";
import { join } from "node:path";

export function resolveAgentDir(env: NodeJS.ProcessEnv): string {
  return env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}
