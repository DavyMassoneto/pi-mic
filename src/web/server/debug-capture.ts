import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { concatPcm } from "../../core/audio/pcm.ts";
import { encodeWav } from "../../core/audio/wav.ts";

interface DebugEvent {
  ms: number;
  type: string;
  [key: string]: unknown;
}

export class DebugCapture {
  readonly #dir: string;
  readonly #rate: number;
  readonly #startedAt = Date.now();
  readonly #audio: Int16Array[] = [];
  readonly #events: DebugEvent[] = [];

  constructor(agentDir: string, rate: number) {
    this.#dir = join(agentDir, "pi-mic-debug");
    this.#rate = rate;
  }

  addAudio(pcm: Int16Array): void {
    this.#audio.push(pcm);
  }

  addEvent(event: { type: string; [key: string]: unknown }): void {
    this.#events.push({ ms: Date.now() - this.#startedAt, ...event });
  }

  save(): void {
    mkdirSync(this.#dir, { recursive: true });
    const name = new Date().toISOString().replace(/[:.]/g, "-");
    writeFileSync(join(this.#dir, `${name}.wav`), encodeWav(concatPcm(this.#audio), this.#rate));
    writeFileSync(
      join(this.#dir, `${name}.json`),
      JSON.stringify({ rate: this.#rate, events: this.#events }, null, 2),
    );
  }
}
