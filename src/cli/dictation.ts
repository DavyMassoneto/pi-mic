import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig } from "../config/mic-config.ts";
import { appendText } from "../core/text/insertion.ts";
import type { TranscriptionEngine } from "../core/transcription/engine.ts";
import { combine } from "../core/transcription/transcript.ts";
import { type Capture, startCapture } from "./capture/capture.ts";
import { NOTIFY_PREFIX, STATUS_KEY, TAIL_MS } from "./constants.ts";
import { lockEditor } from "./editor-lock.ts";
import { deviceIndex } from "./endpoint.ts";
import { createEngine } from "./engine-factory.ts";
import { PcmRelay } from "./pcm-relay.ts";
import { type DictationKind, statusLabel } from "./status-line.ts";

const LEVEL_REFRESH_MS = 100;

interface Recording {
  engine: TranscriptionEngine;
  capture: Capture;
  base: string;
  unlock: () => void;
}

type State =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "recording"; rec: Recording }
  | { kind: "transcribing"; rec: Recording };

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class Dictation {
  readonly #agentDir: string;
  #state: State = { kind: "idle" };

  constructor(agentDir: string) {
    this.#agentDir = agentDir;
  }

  async toggle(ctx: ExtensionContext): Promise<void> {
    if (ctx.mode !== "tui" || !ctx.hasUI) {
      ctx.ui.notify(
        `${NOTIFY_PREFIX} records only in the terminal UI (use the pi-web mic button)`,
        "warning",
      );
      return;
    }
    if (this.#state.kind === "idle") return this.#start(ctx);
    if (this.#state.kind === "recording") return this.#stop(ctx, this.#state.rec);
  }

  cancel(ctx: ExtensionContext): void {
    if (this.#state.kind !== "recording" && this.#state.kind !== "transcribing") return;
    const { rec } = this.#state;
    rec.engine.cancel();
    rec.capture.cancel();
    this.#finish(ctx, rec, null);
  }

  dispose(): void {
    if (this.#state.kind === "recording" || this.#state.kind === "transcribing") {
      this.#state.rec.engine.cancel();
      this.#state.rec.capture.cancel();
      this.#state.rec.unlock();
    }
    this.#state = { kind: "idle" };
  }

  #showStatus(ctx: ExtensionContext, level = 0): void {
    const kind: DictationKind = this.#state.kind;
    ctx.ui.setStatus(STATUS_KEY, statusLabel(kind, level));
  }

  #setState(ctx: ExtensionContext, next: State): void {
    this.#state = next;
    this.#showStatus(ctx);
  }

  #isLive(): boolean {
    return this.#state.kind === "recording" || this.#state.kind === "transcribing";
  }

  async #start(ctx: ExtensionContext): Promise<void> {
    this.#setState(ctx, { kind: "starting" });
    try {
      const rec = await this.#openRecording(ctx);
      this.#setState(ctx, { kind: "recording", rec });
    } catch (err) {
      this.#setState(ctx, { kind: "idle" });
      ctx.ui.notify(`${NOTIFY_PREFIX}: ${(err as Error).message}`, "error");
    }
  }

  async #openRecording(ctx: ExtensionContext): Promise<Recording> {
    const config = loadConfig(this.#agentDir);
    const base = ctx.ui.getEditorText();
    const relay = new PcmRelay();
    const capture = await startCapture(await deviceIndex(config), (pcm) => relay.push(pcm));
    let engine: TranscriptionEngine;
    try {
      engine = await createEngine(ctx, config, capture.rate, this.#engineEvents(ctx, base));
    } catch (err) {
      capture.cancel();
      throw err;
    }
    relay.attach(engine);
    const unlock = lockEditor(ctx.ui, {
      onToggle: () => void this.toggle(ctx),
      onCancel: () => this.cancel(ctx),
    });
    return { engine, capture, base, unlock };
  }

  #engineEvents(ctx: ExtensionContext, base: string) {
    let lastMeter = 0;
    return {
      onUpdate: (committed: string, pending: string) => {
        if (!this.#isLive()) return;
        ctx.ui.setEditorText(appendText(base, combine(committed, pending)));
      },
      onLevel: (level: number) => {
        const now = Date.now();
        if (this.#state.kind === "recording" && now - lastMeter > LEVEL_REFRESH_MS) {
          lastMeter = now;
          this.#showStatus(ctx, level);
        }
      },
      onError: (err: Error) => ctx.ui.notify(`${NOTIFY_PREFIX}: ${err.message}`, "error"),
    };
  }

  async #stop(ctx: ExtensionContext, rec: Recording): Promise<void> {
    this.#setState(ctx, { kind: "transcribing", rec });
    try {
      await delay(TAIL_MS);
      await rec.capture.stop();
      const text = await rec.engine.stop();
      if (!text) {
        ctx.ui.notify(
          `${NOTIFY_PREFIX}: no speech detected (wrong input device? try /mic device)`,
          "warning",
        );
      }
      this.#finish(ctx, rec, text);
    } catch (err) {
      ctx.ui.notify(`${NOTIFY_PREFIX}: ${(err as Error).message}`, "error");
      this.#finish(ctx, rec, null);
    }
  }

  #finish(ctx: ExtensionContext, rec: Recording, text: string | null): void {
    rec.unlock();
    ctx.ui.setEditorText(text === null ? rec.base : appendText(rec.base, text));
    this.#setState(ctx, { kind: "idle" });
  }
}
