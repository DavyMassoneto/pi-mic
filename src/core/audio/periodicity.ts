import { SAMPLE_RATE } from "./pcm.ts";

const ANALYSIS_RATE = 16000;
const LOWEST_PITCH_HZ = 80;
const HIGHEST_PITCH_HZ = 400;

function subsample(frame: Int16Array, step: number): Float32Array {
  const count = Math.floor(frame.length / step);
  const samples = new Float32Array(count);
  let mean = 0;
  for (let i = 0; i < count; i++) mean += frame[i * step];
  mean /= count || 1;
  for (let i = 0; i < count; i++) samples[i] = frame[i * step] - mean;
  return samples;
}

function energy(samples: Float32Array): number {
  let total = 0;
  for (const sample of samples) total += sample * sample;
  return total;
}

function correlationAt(samples: Float32Array, lag: number): number {
  let cross = 0;
  let energyHead = 0;
  let energyTail = 0;
  for (let i = 0; i + lag < samples.length; i++) {
    cross += samples[i] * samples[i + lag];
    energyHead += samples[i] * samples[i];
    energyTail += samples[i + lag] * samples[i + lag];
  }
  return cross / Math.sqrt(energyHead * energyTail || 1);
}

export function periodicity(frame: Int16Array, rate = SAMPLE_RATE): number {
  const step = Math.max(1, Math.round(rate / ANALYSIS_RATE));
  const effectiveRate = rate / step;
  const samples = subsample(frame, step);
  if (energy(samples) === 0) return 0;
  let best = 0;
  const firstLag = Math.floor(effectiveRate / HIGHEST_PITCH_HZ);
  const lastLag = Math.ceil(effectiveRate / LOWEST_PITCH_HZ);
  for (let lag = firstLag; lag <= lastLag; lag++) {
    best = Math.max(best, correlationAt(samples, lag));
  }
  return best;
}
