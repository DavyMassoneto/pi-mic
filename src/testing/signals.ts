import { SAMPLE_RATE } from "../core/audio/pcm.ts";

export type SignalKind = "voice" | "pause";

export function signal(parts: [kind: SignalKind, ms: number][], rate = SAMPLE_RATE): Int16Array {
  const total = parts.reduce((sum, [, ms]) => sum + (ms * rate) / 1000, 0);
  const out = new Int16Array(total);
  let offset = 0;
  for (const [kind, ms] of parts) {
    const count = (ms * rate) / 1000;
    for (let i = 0; i < count; i++, offset++) {
      out[offset] =
        kind === "voice"
          ? Math.round(8000 * Math.sin((2 * Math.PI * 220 * i) / rate))
          : Math.round((Math.random() - 0.5) * 60);
    }
  }
  return out;
}

export function feed(target: { push(pcm: Int16Array): void }, pcm: Int16Array, step = 1600): void {
  for (let i = 0; i < pcm.length; i += step) target.push(pcm.subarray(i, i + step));
}
