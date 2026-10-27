import { NoiseGate } from "../../core/audio/noise-gate.ts";
import type { TranscriptionEngine } from "../../core/transcription/engine.ts";
import type { DeepgramOptions } from "./options.ts";
import { openDeepgramStream } from "./stream-session.ts";

export interface GatedDeepgramEngine extends TranscriptionEngine {
  ready(): Promise<void>;
}

export function openGatedDeepgram(
  options: DeepgramOptions,
  onLevel?: (level: number) => void,
): GatedDeepgramEngine {
  const stream = openDeepgramStream(options);
  const gate = new NoiseGate((pcm) => stream.send(pcm), onLevel, options.sampleRate);
  return {
    push: (pcm) => gate.push(pcm),
    ready: () => stream.ready(),
    async stop() {
      gate.flush();
      return stream.finish();
    },
    cancel: () => stream.cancel(),
  };
}
