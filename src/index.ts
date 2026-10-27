import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { matchesKey } from "@earendil-works/pi-tui";
import { openRealtime } from "../web/deepgram.js";
import { LiveTranscriber, NoiseGate } from "../web/live-core.js";
import { loadConfig, type MicConfig, realtimeKey, saveConfig } from "./config.ts";
import { type Capture, listInputDevices, startCapture } from "./recorder.ts";
import { appendText, silentWav, transcribe } from "./transcribe.ts";

const STATUS = "pi-mic";
const SHORTCUT = "alt+m";

/** Transcrição em andamento: tempo real (Deepgram) ou trecho a trecho (qualquer provider). */
interface Engine {
  push(pcm: Int16Array): void;
  stop(): Promise<string>;
  cancel(): void;
}

interface EngineEvents {
  onUpdate: (committed: string, pending: string) => void;
  onLevel: (level: number) => void;
  onError: (err: Error) => void;
}

async function createEngine(
  ctx: ExtensionContext,
  config: MicConfig,
  ev: EngineEvents,
): Promise<Engine> {
  if (config.realtime) {
    const apiKey = realtimeKey(config);
    if (!apiKey) throw new Error("realtime needs a Deepgram key; run /mic setup");
    const rt = openRealtime({
      apiKey,
      url: config.realtime.url,
      model: config.realtime.model,
      language: config.language,
      onUpdate: ev.onUpdate,
      onError: ev.onError,
    });
    await rt.ready();
    const gate = new NoiseGate((pcm) => rt.send(pcm), ev.onLevel);
    return {
      push: (pcm) => gate.push(pcm),
      async stop() {
        gate.flush();
        return rt.finish();
      },
      cancel: () => rt.cancel(),
    };
  }
  const endpoint = await resolveEndpoint(ctx, config);
  return new LiveTranscriber({
    interimEveryMs: 600,
    transcribe: (wav) =>
      transcribe({
        ...endpoint,
        model: config.model,
        language: config.language,
        audio: wav,
        mimeType: "audio/wav",
        fileName: "speech.wav",
      }),
    ...ev,
  });
}

interface Live {
  live: Engine;
  capture: Capture;
  /** Texto do editor antes de gravar; a transcrição é acrescentada a ele. */
  base: string;
  unlock: () => void;
}

type State =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "recording"; rec: Live }
  | { kind: "transcribing"; rec: Live };

async function resolveEndpoint(ctx: ExtensionContext, config: MicConfig) {
  if (!config.provider) throw new Error("no provider set; run /mic setup");
  const apiKey = await ctx.modelRegistry.getApiKeyForProvider(config.provider);
  if (!apiKey) throw new Error(`no API key for provider "${config.provider}"`);
  const baseUrl =
    config.baseUrl ??
    ctx.modelRegistry.getAll().find((m) => m.provider === config.provider)?.baseUrl;
  if (!baseUrl) throw new Error(`no baseUrl for provider "${config.provider}"`);
  return { apiKey, baseUrl };
}

async function deviceIndex(config: MicConfig): Promise<number | undefined> {
  if (!config.device) return undefined;
  const names = await listInputDevices();
  const i = names.indexOf(config.device);
  if (i < 0) throw new Error(`input device "${config.device}" not found; run /mic device`);
  return i;
}

const METER = " ▁▂▃▄▅▆▇█";

export default function (pi: ExtensionAPI) {
  let state: State = { kind: "idle" };

  const status = (ctx: ExtensionContext, level = 0) => {
    const label = {
      idle: undefined,
      starting: "🎙 starting…",
      recording: `🔴 ${METER[Math.round(level * 8)]} listening — ${SHORTCUT} stops, esc cancels`,
      transcribing: "🎙 finishing transcription…",
    }[state.kind];
    ctx.ui.setStatus(STATUS, label);
  };

  const setState = (ctx: ExtensionContext, next: State) => {
    state = next;
    status(ctx);
  };

  function finish(ctx: ExtensionContext, rec: Live, text: string | null) {
    rec.unlock();
    ctx.ui.setEditorText(text === null ? rec.base : appendText(rec.base, text));
    setState(ctx, { kind: "idle" });
  }

  async function start(ctx: ExtensionContext): Promise<void> {
    setState(ctx, { kind: "starting" });
    try {
      const config = loadConfig();
      const base = ctx.ui.getEditorText();
      let lastMeter = 0;
      const live = await createEngine(ctx, config, {
        onUpdate: (committed, pending) => {
          if (state.kind !== "recording" && state.kind !== "transcribing") return;
          ctx.ui.setEditorText(appendText(base, [committed, pending].filter(Boolean).join(" ")));
        },
        onLevel: (level) => {
          const now = Date.now();
          if (state.kind === "recording" && now - lastMeter > 100) {
            lastMeter = now;
            status(ctx, level);
          }
        },
        onError: (err) => ctx.ui.notify(`pi-mic: ${err.message}`, "error"),
      });
      let capture: Capture;
      try {
        capture = await startCapture(await deviceIndex(config), (pcm) => live.push(pcm));
      } catch (err) {
        live.cancel();
        throw err;
      }
      // Editor travado: só Alt+M (parar) e Esc (cancelar) passam.
      const unlock = ctx.ui.onTerminalInput((data) => {
        if (matchesKey(data, SHORTCUT)) void toggle(ctx);
        else if (matchesKey(data, "escape")) cancel(ctx);
        return { consume: true };
      });
      setState(ctx, { kind: "recording", rec: { live, capture, base, unlock } });
    } catch (err) {
      setState(ctx, { kind: "idle" });
      ctx.ui.notify(`pi-mic: ${(err as Error).message}`, "error");
    }
  }

  async function stop(ctx: ExtensionContext, rec: Live): Promise<void> {
    setState(ctx, { kind: "transcribing", rec });
    try {
      await rec.capture.stop();
      const text = await rec.live.stop();
      if (!text)
        ctx.ui.notify(
          "pi-mic: no speech detected (wrong input device? try /mic device)",
          "warning",
        );
      finish(ctx, rec, text);
    } catch (err) {
      ctx.ui.notify(`pi-mic: ${(err as Error).message}`, "error");
      finish(ctx, rec, null);
    }
  }

  function cancel(ctx: ExtensionContext): void {
    if (state.kind !== "recording" && state.kind !== "transcribing") return;
    const { rec } = state;
    rec.live.cancel();
    rec.capture.cancel();
    finish(ctx, rec, null);
  }

  async function toggle(ctx: ExtensionContext): Promise<void> {
    if (ctx.mode !== "tui" || !ctx.hasUI) {
      ctx.ui.notify(
        "pi-mic records only in the terminal UI (use the pi-web mic button)",
        "warning",
      );
      return;
    }
    if (state.kind === "idle") return start(ctx);
    if (state.kind === "recording") return stop(ctx, state.rec);
  }

  async function pickDevice(ctx: ExtensionContext): Promise<void> {
    const names = await listInputDevices();
    if (names.length === 0) {
      ctx.ui.notify("pi-mic: device selection is only available on Windows", "info");
      return;
    }
    const DEFAULT = "(system default)";
    const choice = await ctx.ui.select("Microphone", [DEFAULT, ...names]);
    if (choice === undefined) return;
    const config = loadConfig();
    config.device = choice === DEFAULT ? undefined : choice;
    saveConfig(config);
    ctx.ui.notify(`pi-mic: input device = ${choice}`, "info");
  }

  async function setup(ctx: ExtensionContext): Promise<void> {
    const providers = [...new Set(ctx.modelRegistry.getAll().map((m) => m.provider))];
    const config = loadConfig();
    const provider = await ctx.ui.select("Provider that serves /audio/transcriptions", providers);
    if (provider === undefined) return;
    const model = await ctx.ui.input("Transcription model", config.model);
    const language = await ctx.ui.input("Language (empty = auto)", config.language ?? "");
    const REALTIME = "Real time (Deepgram streaming)";
    const mode = await ctx.ui.select("Mode", [REALTIME, "Per phrase (the provider above)"]);
    let realtime = config.realtime;
    if (mode === REALTIME) {
      const key = await ctx.ui.input(
        "Deepgram API key (empty = keep current)",
        realtime?.apiKey ? "••••" : "",
      );
      const apiKey = key && key !== "••••" ? key.trim() : realtime?.apiKey;
      realtime = {
        provider: "deepgram",
        model: realtime?.model ?? "nova-3",
        url: realtime?.url,
        apiKey,
      };
    } else if (mode !== undefined) realtime = undefined;
    saveConfig({
      ...config,
      provider,
      model: model?.trim() || config.model,
      language: language?.trim() || undefined,
      realtime,
    });
    ctx.ui.notify(
      `pi-mic: ${realtime ? "real time via Deepgram" : `per phrase via ${provider}`}`,
      "info",
    );
  }

  async function check(ctx: ExtensionContext): Promise<void> {
    const config = loadConfig();
    try {
      if (config.realtime) {
        const live = await createEngine(ctx, config, {
          onUpdate: () => {},
          onLevel: () => {},
          onError: () => {},
        });
        live.push(new Int16Array(8000));
        await live.stop();
        ctx.ui.notify("pi-mic: OK — real time via Deepgram streaming", "info");
        return;
      }
      const endpoint = await resolveEndpoint(ctx, config);
      await transcribe({
        ...endpoint,
        model: config.model,
        language: config.language,
        audio: silentWav(500),
        mimeType: "audio/wav",
        fileName: "check.wav",
      });
      ctx.ui.notify(`pi-mic: OK — ${config.provider} ${endpoint.baseUrl} ${config.model}`, "info");
    } catch (err) {
      ctx.ui.notify(`pi-mic: ${(err as Error).message}`, "error");
    }
  }

  pi.registerShortcut(SHORTCUT, {
    description: "Voice input: start/stop recording and insert the transcription",
    handler: toggle,
  });

  pi.registerCommand("mic", {
    description:
      "Voice input. /mic toggles recording; /mic device picks the microphone; /mic setup; /mic check",
    getArgumentCompletions: (prefix: string) =>
      ["device", "setup", "check"]
        .filter((s) => s.startsWith(prefix))
        .map((s) => ({ value: s, label: s })),
    handler: async (args, ctx) => {
      const sub = args.trim();
      if (sub === "device") return pickDevice(ctx);
      if (sub === "setup") return setup(ctx);
      if (sub === "check") return check(ctx);
      return toggle(ctx);
    },
  });

  pi.on("session_shutdown", () => {
    if (state.kind === "recording" || state.kind === "transcribing") {
      state.rec.live.cancel();
      state.rec.capture.cancel();
      state.rec.unlock();
    }
    state = { kind: "idle" };
  });
}
