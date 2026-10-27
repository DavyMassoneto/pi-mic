import { rms, rmsLevel, SAMPLE_RATE } from "./pcm.ts";
import { periodicity } from "./periodicity.ts";

const INITIAL_FLOOR = 150;
const MIN_VOICE_RMS = 300;
const FLOOR_MARGIN = 3;
const MIN_PERIODICITY = 0.45;

export interface FrameAnalysis {
  level: number;
  voiced: boolean;
}

export class VoiceDetector {
  readonly #rate: number;
  #floor = INITIAL_FLOOR;

  constructor(rate = SAMPLE_RATE) {
    this.#rate = rate;
  }

  frame(frame: Int16Array): FrameAnalysis {
    const energy = rms(frame);
    this.#floor =
      energy < this.#floor
        ? this.#floor * 0.7 + energy * 0.3
        : this.#floor + (energy - this.#floor) * 0.002;
    const loud = energy > Math.max(MIN_VOICE_RMS, this.#floor * FLOOR_MARGIN);
    const voiced = loud && periodicity(frame, this.#rate) > MIN_PERIODICITY;
    return { level: rmsLevel(frame), voiced };
  }
}
