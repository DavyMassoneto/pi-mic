import { PcmFramer } from "./framer.ts";
import { concatPcm, SAMPLE_RATE } from "./pcm.ts";
import { VoiceDetector } from "./voice-detector.ts";

const DELAY_FRAMES = 15;
const HOLD_FRAMES = 35;
const NEVER_VOICED = -1_000_000;

export class NoiseGate {
  readonly #out: (pcm: Int16Array) => void;
  readonly #onLevel?: (level: number) => void;
  readonly #framer: PcmFramer;
  readonly #detector: VoiceDetector;
  #queue: Int16Array[] = [];
  #nextIndex = 0;
  #lastVoiced = NEVER_VOICED;

  constructor(
    out: (pcm: Int16Array) => void,
    onLevel?: (level: number) => void,
    rate = SAMPLE_RATE,
  ) {
    this.#out = out;
    this.#onLevel = onLevel;
    this.#framer = new PcmFramer(rate);
    this.#detector = new VoiceDetector(rate);
  }

  push(chunk: Int16Array): void {
    this.#framer.push(chunk, (frame) => this.#enqueue(frame));
    if (this.#queue.length > DELAY_FRAMES) this.#release(this.#queue.length - DELAY_FRAMES);
  }

  flush(): void {
    const rest = this.#framer.takeRest();
    if (rest.length) {
      const tail = new Int16Array(this.#framer.length);
      tail.set(rest);
      this.#queue.push(tail);
      this.#nextIndex++;
    }
    if (this.#queue.length) this.#release(this.#queue.length);
  }

  #enqueue(frame: Int16Array): void {
    const { level, voiced } = this.#detector.frame(frame);
    this.#onLevel?.(level);
    if (voiced) this.#lastVoiced = this.#nextIndex;
    this.#queue.push(frame);
    this.#nextIndex++;
  }

  #release(count: number): void {
    const firstIndex = this.#nextIndex - this.#queue.length;
    const batch = this.#queue.splice(0, count);
    const gated = batch.map((frame, k) =>
      this.#lastVoiced >= firstIndex + k - HOLD_FRAMES ? frame : new Int16Array(frame.length),
    );
    this.#out(concatPcm(gated));
  }
}
