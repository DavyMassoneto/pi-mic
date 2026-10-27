import type { TranscriptionEngine } from "../core/transcription/engine.ts";

export class PcmRelay {
  readonly #early: Int16Array[] = [];
  #target: ((pcm: Int16Array) => void) | undefined;

  push(pcm: Int16Array): void {
    if (this.#target) this.#target(pcm);
    else this.#early.push(pcm);
  }

  attach(engine: Pick<TranscriptionEngine, "push">): void {
    for (const pcm of this.#early.splice(0)) engine.push(pcm);
    this.#target = (pcm) => engine.push(pcm);
  }
}
