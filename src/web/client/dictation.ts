import { rmsLevel } from "../../core/audio/pcm.ts";
import { createInsertion, type Insertion } from "../../core/text/insertion.ts";
import type { EngineEvents, TranscriptionEngine } from "../../core/transcription/engine.ts";
import { SegmentedTranscriber } from "../../core/transcription/segmented-transcriber.ts";
import { combine } from "../../core/transcription/transcript.ts";
import { type Composer, setTextareaValue } from "./composer.ts";
import { type ButtonState, messages } from "./messages.ts";
import type { MicButtonView } from "./mic-button-view.ts";
import { type Microphone, openMicrophone, requestMicrophoneStream } from "./microphone.ts";
import { openRealtimeEngine } from "./realtime-engine.ts";
import { fetchClientConfig, transcribeWav } from "./server-api.ts";

const TAIL_MS = 500;
const INTERIM_EVERY_MS = 600;

interface Session {
  engine: TranscriptionEngine;
  microphone: Microphone;
  insertion: (text: string) => Insertion;
  original: string;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class Dictation {
  readonly #composer: Composer;
  readonly #view: MicButtonView;
  #state: ButtonState = "idle";
  #session: Session | null = null;

  constructor(composer: Composer, view: MicButtonView) {
    this.#composer = composer;
    this.#view = view;
  }

  state(): ButtonState {
    return this.#state;
  }

  isBusy(): boolean {
    return this.#state !== "idle";
  }

  toggle(): void {
    if (this.#state === "idle") void this.#start();
    else if (this.#state === "rec") void this.#stop();
  }

  cancel(): void {
    const session = this.#session;
    if (!session) return;
    session.engine.cancel();
    session.microphone.release();
    const textarea = this.#composer.textarea();
    if (textarea) setTextareaValue(textarea, session.original);
    this.#finish(session, null);
  }

  render(): void {
    this.#view.render(this.#state, this.#composer.send());
  }

  #setState(state: ButtonState): void {
    this.#state = state;
    this.render();
  }

  async #start(): Promise<void> {
    const textarea = this.#composer.textarea();
    if (!textarea) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      return this.#view.flash(messages.insecure);
    }
    let stream: MediaStream;
    try {
      stream = await requestMicrophoneStream();
    } catch (err) {
      return this.#view.flash(`${messages.blocked}: ${(err as Error).message}`);
    }
    const microphone = await openMicrophone(stream);
    const original = textarea.value;
    const insertion = createInsertion(
      original,
      textarea.selectionStart ?? original.length,
      textarea.selectionEnd ?? original.length,
    );
    let engine: TranscriptionEngine;
    try {
      engine = await this.#openEngine(microphone.sampleRate, this.#engineEvents(insertion));
    } catch (err) {
      microphone.release();
      return this.#view.flash(`${messages.failed}: ${(err as Error).message}`);
    }
    microphone.listen((pcm) => {
      engine.push(pcm);
      if (this.#state === "rec") this.#view.glow(rmsLevel(pcm));
    });
    this.#session = { engine, microphone, insertion, original };
    this.#composer.lock(true);
    this.#setState("rec");
  }

  #engineEvents(insertion: (text: string) => Insertion) {
    return {
      onUpdate: (committed: string, pending: string) => {
        const textarea = this.#composer.textarea();
        if (textarea) setTextareaValue(textarea, insertion(combine(committed, pending)).value);
      },
      onError: (err: Error) => this.#view.flash(`${messages.failed}: ${err.message}`),
    };
  }

  async #openEngine(
    sampleRate: number,
    events: EngineEvents & { onError: (err: Error) => void },
  ): Promise<TranscriptionEngine> {
    const config = await fetchClientConfig();
    if (config.realtime) return openRealtimeEngine(events, sampleRate);
    return new SegmentedTranscriber({
      interimEveryMs: INTERIM_EVERY_MS,
      sampleRate,
      transcribe: transcribeWav,
      ...events,
    });
  }

  async #stop(): Promise<void> {
    const session = this.#session;
    if (!session) return;
    this.#setState("busy");
    await delay(TAIL_MS);
    session.microphone.release();
    const text = await session.engine.stop();
    this.#finish(session, text);
  }

  #finish(session: Session, text: string | null): void {
    if (this.#session !== session) return;
    this.#session = null;
    this.#composer.lock(false);
    this.#setState("idle");
    const textarea = this.#composer.textarea();
    if (!textarea) return;
    if (text === null) {
      textarea.focus();
      return;
    }
    const { value, caret } = session.insertion(text);
    setTextareaValue(textarea, value);
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
    if (!text) this.#view.flash(messages.nothing);
  }
}
