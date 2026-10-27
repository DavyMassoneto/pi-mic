import { join } from "node:path";
import type { MicConfig } from "../../config/mic-config.ts";
import type { Endpoint } from "../../providers/openai-compatible/transcribe.ts";
import { readJsonFile } from "./json-file.ts";

interface ModelsFile {
  providers?: Record<string, { apiKey?: unknown; baseUrl?: string }>;
}

type AuthFile = Record<string, { key?: string } | undefined>;

export interface TranscriptionTarget extends Endpoint {
  model: string;
  language?: string;
}

export function resolveProviderEndpoint(
  agentDir: string,
  config: MicConfig,
  env: NodeJS.ProcessEnv,
): TranscriptionTarget {
  const provider = config.provider;
  if (!provider) throw new Error("no provider set in pi-mic.json; run /mic setup in pi");
  const models =
    readJsonFile<ModelsFile>(join(agentDir, "models.json"))?.providers?.[provider] ?? {};
  const auth = readJsonFile<AuthFile>(join(agentDir, "auth.json"))?.[provider];
  let apiKey = auth?.key;
  if (!apiKey && typeof models.apiKey === "string") {
    apiKey = env[models.apiKey] || models.apiKey;
  }
  const baseUrl = config.baseUrl || models.baseUrl;
  if (!apiKey) throw new Error(`no API key for provider "${provider}"`);
  if (!baseUrl) throw new Error(`no baseUrl for provider "${provider}"`);
  return { apiKey, baseUrl, model: config.model, language: config.language };
}
