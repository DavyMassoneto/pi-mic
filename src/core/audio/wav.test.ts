import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeWav, silentWav } from "./wav.ts";

function legacySilentWav(ms: number): Uint8Array {
  const dataLen = Math.round((16000 * ms) / 1000) * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(16000, 24);
  buf.writeUInt32LE(32000, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataLen, 40);
  return buf;
}

test("silentWav produces the same bytes as the previous implementation", () => {
  for (const ms of [0, 10, 500, 1234]) {
    assert.deepEqual(Buffer.from(silentWav(ms)), Buffer.from(legacySilentWav(ms)));
  }
});

test("silentWav has a 16 kHz mono RIFF header", () => {
  const wav = Buffer.from(silentWav(500));
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.toString("ascii", 8, 12), "WAVE");
  assert.equal(wav.readUInt32LE(24), 16000);
  assert.equal(wav.readUInt32LE(40), 16000);
  assert.equal(wav.length, 44 + 16000);
});

test("encodeWav writes the native sample rate and the samples", () => {
  const wav = encodeWav(new Int16Array([1, -2]), 48000);
  const view = new DataView(wav.buffer);
  assert.equal(new TextDecoder().decode(wav.subarray(0, 4)), "RIFF");
  assert.equal(view.getUint32(24, true), 48000);
  assert.equal(view.getInt16(44, true), 1);
  assert.equal(view.getInt16(46, true), -2);
});
