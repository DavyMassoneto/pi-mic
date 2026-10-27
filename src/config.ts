import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export interface MicConfig {
  /** Provider de models.json/auth.json cuja chave e baseUrl são usados. */
  provider?: string;
  /** Sobrescreve a baseUrl do provider (deve terminar em /v1 ou equivalente). */
  baseUrl?: string;
  /** Modelo de transcrição do gateway. */
  model: string;
  /** Idioma (ex.: "pt", "en", "multi"). Vazio = detecção do gateway. */
  language?: string;
  /** Nome do dispositivo de entrada (Windows). Vazio = padrão do sistema. */
  device?: string;
  /** Tempo real pelo streaming do Deepgram. Sem isto, transcreve trecho a trecho via `provider`. */
  realtime?: RealtimeConfig;
}

export interface RealtimeConfig {
  provider: "deepgram";
  /** Modelo do Deepgram (ex.: "nova-3"). */
  model?: string;
  /** Endpoint WebSocket (Deepgram self-hosted); padrão wss://api.deepgram.com/v1/listen. */
  url?: string;
  /** Chave do Deepgram; a variável DEEPGRAM_API_KEY tem precedência. */
  apiKey?: string;
}

export function realtimeKey(config: MicConfig): string | undefined {
  return process.env.DEEPGRAM_API_KEY || config.realtime?.apiKey || undefined;
}

export const DEFAULT_MODEL = "deepgram/nova-3";

export function configPath(): string {
  return join(getAgentDir(), "pi-mic.json");
}

export function loadConfig(): MicConfig {
  const path = configPath();
  if (!existsSync(path)) return { model: DEFAULT_MODEL };
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<MicConfig>;
  return { ...raw, model: raw.model || DEFAULT_MODEL };
}

export function saveConfig(config: MicConfig): void {
  writeFileSync(configPath(), `${JSON.stringify(config, null, 2)}\n`);
}
