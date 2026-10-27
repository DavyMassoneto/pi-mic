import { PcmFramer } from "../audio/framer.ts";
import { concatPcm, SAMPLE_RATE } from "../audio/pcm.ts";
import { VoiceDetector } from "../audio/voice-detector.ts";
import { encodeWav } from "../audio/wav.ts";
import type { EngineEvents, SpeechResult, TranscriptionEngine } from "./engine.ts";
import { joinParts } from "./transcript.ts";

const FRAME_MS = 20;
const MIN_VOICED_FRAMES = 10;
const MAX_LEADING_FRAMES = 50;
const DEFAULT_SILENCE_MS = 700;
const DEFAULT_MAX_SEGMENT_MS = 12000;
const DEFAULT_INTERIM_EVERY_MS = 800;

export interface SegmentedOptions extends EngineEvents {
  transcribe: (wav: Uint8Array<ArrayBuffer>) => Promise<SpeechResult>;
  sampleRate?: number;
  silenceMs?: number;
  maxSegmentMs?: number;
  interimEveryMs?: number;
}

interface OpenSegment {
  frames: Int16Array[];
  voiced: number;
  quiet: number;
  interimAt: number;
  interim: string;
  closed: boolean;
}

interface ClosedSegment {
  interim: string;
  final?: string;
  done: Promise<void>;
}

const openSegment = (): OpenSegment => ({
  frames: [],
  voiced: 0,
  quiet: 0,
  interimAt: 0,
  interim: "",
  closed: false,
});

const toFrames = (ms: number): number => Math.round(ms / FRAME_MS);

export class SegmentedTranscriber implements TranscriptionEngine {
  readonly #options: SegmentedOptions;
  readonly #rate: number;
  readonly #framer: PcmFramer;
  readonly #detector: VoiceDetector;
  readonly #silenceFrames: number;
  readonly #maxFrames: number;
  readonly #interimFrames: number;
  #segment = openSegment();
  #closed: ClosedSegment[] = [];
  #interimInFlight = false;
  #cancelled = false;

  constructor(options: SegmentedOptions) {
    this.#options = options;
    this.#rate = options.sampleRate ?? SAMPLE_RATE;
    this.#framer = new PcmFramer(this.#rate);
    this.#detector = new VoiceDetector(this.#rate);
    this.#silenceFrames = toFrames(options.silenceMs ?? DEFAULT_SILENCE_MS);
    this.#maxFrames = toFrames(options.maxSegmentMs ?? DEFAULT_MAX_SEGMENT_MS);
    this.#interimFrames = toFrames(options.interimEveryMs ?? DEFAULT_INTERIM_EVERY_MS);
  }

  push(chunk: Int16Array): void {
    if (this.#cancelled) return;
    this.#framer.push(chunk, (frame) => this.#onFrame(frame));
  }

  text(): { committed: string; pending: string } {
    const committed: string[] = [];
    let index = 0;
    for (; index < this.#closed.length && this.#closed[index].final !== undefined; index++) {
      committed.push(this.#closed[index].final ?? "");
    }
    const pending = this.#closed.slice(index).map((entry) => entry.final ?? entry.interim);
    pending.push(this.#segment.interim);
    return { committed: joinParts(committed), pending: joinParts(pending) };
  }

  async stop(): Promise<string> {
    this.#closeSegment();
    await Promise.all(this.#closed.map((entry) => entry.done));
    return this.text().committed;
  }

  cancel(): void {
    this.#cancelled = true;
    this.#segment = openSegment();
  }

  #onFrame(frame: Int16Array): void {
    const { level, voiced } = this.#detector.frame(frame);
    this.#options.onLevel?.(level);
    const segment = this.#segment;
    segment.frames.push(frame);
    if (voiced) {
      segment.voiced++;
      segment.quiet = 0;
    } else segment.quiet++;

    if (segment.voiced < MIN_VOICED_FRAMES) {
      this.#trimLeading(segment);
      return;
    }
    if (segment.quiet >= this.#silenceFrames || segment.frames.length >= this.#maxFrames) {
      this.#closeSegment();
    } else if (segment.frames.length - segment.interimAt >= this.#interimFrames) {
      this.#requestInterim(segment);
    }
  }

  #trimLeading(segment: OpenSegment): void {
    if (segment.frames.length > MAX_LEADING_FRAMES) {
      segment.frames.splice(0, segment.frames.length - MAX_LEADING_FRAMES);
    }
    if (segment.quiet >= this.#silenceFrames) segment.voiced = 0;
  }

  #requestInterim(segment: OpenSegment): void {
    if (this.#interimInFlight) return;
    this.#interimInFlight = true;
    segment.interimAt = segment.frames.length;
    this.#recognize(segment.frames)
      .then((result) => {
        if (!segment.closed && result.text) {
          segment.interim = result.text;
          this.#emit();
        }
      })
      .finally(() => {
        this.#interimInFlight = false;
      });
  }

  #closeSegment(): void {
    const segment = this.#segment;
    this.#segment = openSegment();
    segment.closed = true;
    const rest = this.#framer.takeRest();
    if (rest.length) segment.frames.push(rest);
    if (segment.voiced < MIN_VOICED_FRAMES) return;
    const entry: ClosedSegment = { interim: segment.interim, done: Promise.resolve() };
    entry.done = this.#recognize(segment.frames).then((result) => {
      entry.final = result.noSpeech ? "" : result.text;
      this.#emit();
    });
    this.#closed.push(entry);
  }

  async #recognize(frames: readonly Int16Array[]): Promise<SpeechResult> {
    try {
      return await this.#options.transcribe(encodeWav(concatPcm(frames), this.#rate));
    } catch (err) {
      this.#options.onError?.(err as Error);
      return { text: "", noSpeech: true };
    }
  }

  #emit(): void {
    if (this.#cancelled) return;
    const { committed, pending } = this.text();
    this.#options.onUpdate(committed, pending);
  }
}
