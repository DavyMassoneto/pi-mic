import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface RealtimeConfig {
  provider: "deepgram";
  model?: string;
  url?: string;
  apiKey?: string;
}

export interface MicConfig {
  provider?: string;
  baseUrl?: string;
  model: string;
  language?: string;
  device?: string;
  realtime?: RealtimeConfig;
  keyterms?: string[];
  debug?: boolean;
}

export const DEFAULT_MODEL = "deepgram/nova-3";

export function configPath(agentDir: string): string {
  return join(agentDir, "pi-mic.json");
}

export function realtimeKey(
  config: MicConfig,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return env.DEEPGRAM_API_KEY || config.realtime?.apiKey || undefined;
}

export function loadConfig(agentDir: string): MicConfig {
  const path = configPath(agentDir);
  if (!existsSync(path)) return { model: DEFAULT_MODEL };
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<MicConfig>;
  return { ...raw, model: raw.model || DEFAULT_MODEL };
}

export function saveConfig(agentDir: string, config: MicConfig): void {
  writeFileSync(configPath(agentDir), `${JSON.stringify(config, null, 2)}\n`);
}
