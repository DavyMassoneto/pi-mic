import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, type MicConfig, saveConfig } from "./config.ts";
import { listInputDevices, type Recording, startRecording } from "./recorder.ts";
import { appendText, silentWav, transcribe } from "./transcribe.ts";

const STATUS = "pi-mic";
const SHORTCUT = "alt+m";

type State =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "recording"; rec: Recording }
  | { kind: "transcribing" };

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

function insertText(ctx: ExtensionContext, text: string): void {
  ctx.ui.setEditorText(appendText(ctx.ui.getEditorText(), text));
}

export default function (pi: ExtensionAPI) {
  let state: State = { kind: "idle" };

  const setState = (ctx: ExtensionContext, next: State) => {
    state = next;
    const label = {
      idle: undefined,
      starting: "🎙 starting…",
      recording: `🔴 REC — ${SHORTCUT} to stop`,
      transcribing: "🎙 transcribing…",
    }[next.kind];
    ctx.ui.setStatus(STATUS, label);
  };

  async function toggle(ctx: ExtensionContext): Promise<void> {
    if (ctx.mode !== "tui" || !ctx.hasUI) {
      ctx.ui.notify(
        "pi-mic records only in the terminal UI (use the pi-web mic button)",
        "warning",
      );
      return;
    }
    if (state.kind === "starting" || state.kind === "transcribing") return;

    if (state.kind === "idle") {
      setState(ctx, { kind: "starting" });
      try {
        const rec = await startRecording(await deviceIndex(loadConfig()));
        setState(ctx, { kind: "recording", rec });
      } catch (err) {
        setState(ctx, { kind: "idle" });
        ctx.ui.notify(`pi-mic: ${(err as Error).message}`, "error");
      }
      return;
    }

    const { rec } = state;
    setState(ctx, { kind: "transcribing" });
    try {
      const config = loadConfig();
      const audio = await rec.stop();
      const endpoint = await resolveEndpoint(ctx, config);
      const result = await transcribe({
        ...endpoint,
        model: config.model,
        language: config.language,
        audio,
        mimeType: "audio/wav",
        fileName: "speech.wav",
      });
      if (result.noSpeech) {
        ctx.ui.notify(
          "pi-mic: no speech detected (wrong input device? try /mic device)",
          "warning",
        );
      } else {
        insertText(ctx, result.text);
      }
    } catch (err) {
      ctx.ui.notify(`pi-mic: ${(err as Error).message}`, "error");
    } finally {
      setState(ctx, { kind: "idle" });
    }
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
    saveConfig({
      ...config,
      provider,
      model: model?.trim() || config.model,
      language: language?.trim() || undefined,
    });
    ctx.ui.notify(`pi-mic: using ${provider} / ${model?.trim() || config.model}`, "info");
  }

  async function check(ctx: ExtensionContext): Promise<void> {
    const config = loadConfig();
    try {
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
    if (state.kind === "recording") state.rec.cancel();
    state = { kind: "idle" };
  });
}
