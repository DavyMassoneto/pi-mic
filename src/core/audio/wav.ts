import { SAMPLE_RATE } from "./pcm.ts";

const HEADER_BYTES = 44;
const BYTES_PER_SAMPLE = 2;

function writeAscii(out: Uint8Array, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) out[offset + i] = text.charCodeAt(i);
}

export function encodeWav(pcm: Int16Array, rate = SAMPLE_RATE): Uint8Array<ArrayBuffer> {
  const dataBytes = pcm.length * BYTES_PER_SAMPLE;
  const out = new Uint8Array(HEADER_BYTES + dataBytes);
  const view = new DataView(out.buffer);
  writeAscii(out, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(out, 8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * BYTES_PER_SAMPLE, true);
  view.setUint16(32, BYTES_PER_SAMPLE, true);
  view.setUint16(34, 16, true);
  writeAscii(out, 36, "data");
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < pcm.length; i++) {
    view.setInt16(HEADER_BYTES + i * BYTES_PER_SAMPLE, pcm[i], true);
  }
  return out;
}

export function silentWav(ms: number): Uint8Array<ArrayBuffer> {
  return encodeWav(new Int16Array(Math.round((SAMPLE_RATE * ms) / 1000)), SAMPLE_RATE);
}
