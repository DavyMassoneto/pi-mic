import { readFileSync } from "node:fs";
import { pcmReader } from "./pcm-reader.ts";
import type { Capture, PcmListener } from "./types.ts";

const TICK_MS = 100;
const WAV_HEADER_BYTES = 44;
const SAMPLE_RATE_OFFSET = 24;

export function startFakeCapture(path: string, onChunk: PcmListener): Promise<Capture> {
  const file = readFileSync(path);
  const rate = file.readUInt32LE(SAMPLE_RATE_OFFSET);
  const data = file.subarray(WAV_HEADER_BYTES);
  const step = (rate / 10) * 2;
  const read = pcmReader(onChunk);
  let offset = 0;
  const timer = setInterval(() => {
    if (offset >= data.length) offset = 0;
    read(data.subarray(offset, offset + step));
    offset += step;
  }, TICK_MS);
  const halt = () => clearInterval(timer);
  return Promise.resolve({ rate, stop: async () => halt(), cancel: halt });
}
