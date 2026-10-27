import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, type MicConfig } from "../../config/mic-config.ts";
import { silentWav } from "../../core/audio/wav.ts";
import { transcribe } from "../../providers/openai-compatible/transcribe.ts";
import { resolveEndpoint } from "../endpoint.ts";
import { createEngine } from "../engine-factory.ts";

const CHECK_SAMPLE_RATE = 16000;
const CHECK_AUDIO_MS = 500;

async function checkRealtime(ctx: ExtensionContext, config: MicConfig): Promise<void> {
  const engine = await createEngine(ctx, config, CHECK_SAMPLE_RATE, {
    onUpdate: () => {},
    onLevel: () => {},
    onError: () => {},
  });
  engine.push(new Int16Array(CHECK_SAMPLE_RATE / 2));
  await engine.stop();
  ctx.ui.notify("pi-mic: OK — real time via Deepgram streaming", "info");
}

async function checkProvider(ctx: ExtensionContext, config: MicConfig): Promise<void> {
  const endpoint = await resolveEndpoint(ctx, config);
  await transcribe({
    ...endpoint,
    model: config.model,
    language: config.language,
    audio: silentWav(CHECK_AUDIO_MS),
    mimeType: "audio/wav",
    fileName: "check.wav",
  });
  ctx.ui.notify(`pi-mic: OK — ${config.provider} ${endpoint.baseUrl} ${config.model}`, "info");
}

export async function checkSetup(ctx: ExtensionContext, agentDir: string): Promise<void> {
  const config = loadConfig(agentDir);
  try {
    if (config.realtime) await checkRealtime(ctx, config);
    else await checkProvider(ctx, config);
  } catch (err) {
    ctx.ui.notify(`pi-mic: ${(err as Error).message}`, "error");
  }
}
