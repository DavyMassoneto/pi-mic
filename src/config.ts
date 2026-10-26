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
