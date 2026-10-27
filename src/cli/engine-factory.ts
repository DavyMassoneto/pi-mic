import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type MicConfig, realtimeKey } from "../config/mic-config.ts";
import type { EngineEvents, TranscriptionEngine } from "../core/transcription/engine.ts";
import { SegmentedTranscriber } from "../core/transcription/segmented-transcriber.ts";
import { openGatedDeepgram } from "../providers/deepgram/gated-engine.ts";
import { transcribe } from "../providers/openai-compatible/transcribe.ts";
import { resolveEndpoint } from "./endpoint.ts";

const INTERIM_EVERY_MS = 600;

async function createRealtimeEngine(
  config: MicConfig,
  sampleRate: number,
  events: EngineEvents,
): Promise<TranscriptionEngine> {
  const apiKey = realtimeKey(config);
  if (!apiKey || !config.realtime) throw new Error("realtime needs a Deepgram key; run /mic setup");
  const engine = openGatedDeepgram(
    {
      apiKey,
      sampleRate,
      url: config.realtime.url,
      model: config.realtime.model,
      language: config.language,
      keyterms: config.keyterms,
      onUpdate: events.onUpdate,
      onError: events.onError,
    },
    events.onLevel,
  );
  await engine.ready();
  return engine;
}

async function createSegmentedEngine(
  ctx: ExtensionContext,
  config: MicConfig,
  sampleRate: number,
  events: EngineEvents,
): Promise<TranscriptionEngine> {
  const endpoint = await resolveEndpoint(ctx, config);
  return new SegmentedTranscriber({
    interimEveryMs: INTERIM_EVERY_MS,
    sampleRate,
    transcribe: (wav) =>
      transcribe({
        ...endpoint,
        model: config.model,
        language: config.language,
        audio: wav,
        mimeType: "audio/wav",
        fileName: "speech.wav",
      }),
    ...events,
  });
}

export function createEngine(
  ctx: ExtensionContext,
  config: MicConfig,
  sampleRate: number,
  events: EngineEvents,
): Promise<TranscriptionEngine> {
  return config.realtime
    ? createRealtimeEngine(config, sampleRate, events)
    : createSegmentedEngine(ctx, config, sampleRate, events);
}
