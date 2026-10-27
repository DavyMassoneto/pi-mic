import { concatPcm } from "./pcm.ts";

const FRAME_MS = 20;

export function frameLength(rate: number): number {
  return Math.round((rate * FRAME_MS) / 1000);
}

export class PcmFramer {
  readonly length: number;
  #rest = new Int16Array(0);

  constructor(rate: number) {
    this.length = frameLength(rate);
  }

  push(chunk: Int16Array, each: (frame: Int16Array) => void): void {
    const all = concatPcm([this.#rest, chunk]);
    let offset = 0;
    for (; offset + this.length <= all.length; offset += this.length) {
      each(all.slice(offset, offset + this.length));
    }
    this.#rest = all.slice(offset);
  }

  takeRest(): Int16Array {
    const rest = this.#rest;
    this.#rest = new Int16Array(0);
    return rest;
  }
}
