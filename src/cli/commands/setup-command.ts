import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, type RealtimeConfig, saveConfig } from "../../config/mic-config.ts";

const REALTIME_MODE = "Real time (Deepgram streaming)";
const PER_PHRASE_MODE = "Per phrase (the provider above)";
const KEY_PLACEHOLDER = "••••";
const DEFAULT_REALTIME_MODEL = "nova-3";

async function askRealtime(
  ctx: ExtensionContext,
  current: RealtimeConfig | undefined,
): Promise<RealtimeConfig> {
  const key = await ctx.ui.input(
    "Deepgram API key (empty = keep current)",
    current?.apiKey ? KEY_PLACEHOLDER : "",
  );
  const apiKey = key && key !== KEY_PLACEHOLDER ? key.trim() : current?.apiKey;
  return {
    provider: "deepgram",
    model: current?.model ?? DEFAULT_REALTIME_MODEL,
    url: current?.url,
    apiKey,
  };
}

export async function setupMic(ctx: ExtensionContext, agentDir: string): Promise<void> {
  const providers = [...new Set(ctx.modelRegistry.getAll().map((model) => model.provider))];
  const config = loadConfig(agentDir);
  const provider = await ctx.ui.select("Provider that serves /audio/transcriptions", providers);
  if (provider === undefined) return;
  const model = await ctx.ui.input("Transcription model", config.model);
  const language = await ctx.ui.input("Language (empty = auto)", config.language ?? "");
  const mode = await ctx.ui.select("Mode", [REALTIME_MODE, PER_PHRASE_MODE]);
  let realtime = config.realtime;
  if (mode === REALTIME_MODE) realtime = await askRealtime(ctx, realtime);
  else if (mode !== undefined) realtime = undefined;
  saveConfig(agentDir, {
    ...config,
    provider,
    model: model?.trim() || config.model,
    language: language?.trim() || undefined,
    realtime,
  });
  ctx.ui.notify(
    `pi-mic: ${realtime ? "real time via Deepgram" : `per phrase via ${provider}`}`,
    "info",
  );
}
