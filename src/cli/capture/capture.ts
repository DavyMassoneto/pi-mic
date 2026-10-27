import { startFakeCapture } from "./fake-capture.ts";
import type { Capture, PcmListener } from "./types.ts";
import { startUnixCapture } from "./unix-capture.ts";
import { startWindowsCapture } from "./windows-capture.ts";

export type { Capture } from "./types.ts";

export function startCapture(
  deviceIndex: number | undefined,
  onChunk: PcmListener,
): Promise<Capture> {
  const fakeInput = process.env.PI_MIC_FAKE_INPUT;
  if (fakeInput) return startFakeCapture(fakeInput, onChunk);
  return process.platform === "win32"
    ? startWindowsCapture(deviceIndex, onChunk)
    : startUnixCapture(onChunk);
}
