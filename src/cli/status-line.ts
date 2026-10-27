import { SHORTCUT } from "./constants.ts";

export type DictationKind = "idle" | "starting" | "recording" | "transcribing";

const METER = " ▁▂▃▄▅▆▇█";
const METER_STEPS = 8;

export function statusLabel(kind: DictationKind, level = 0): string | undefined {
  switch (kind) {
    case "idle":
      return undefined;
    case "starting":
      return "🎙 starting…";
    case "recording":
      return `🔴 ${METER[Math.round(level * METER_STEPS)]} listening — ${SHORTCUT} stops, esc cancels`;
    case "transcribing":
      return "🎙 finishing transcription…";
  }
}
