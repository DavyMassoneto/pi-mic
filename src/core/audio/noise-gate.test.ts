import assert from "node:assert/strict";
import { test } from "node:test";
import { signal } from "../../testing/signals.ts";
import { NoiseGate } from "./noise-gate.ts";
import { concatPcm } from "./pcm.ts";

const peak = (pcm: Int16Array) => pcm.reduce((max, value) => Math.max(max, Math.abs(value)), 0);

test("NoiseGate silences clicks without pitch and lets delayed voice through", () => {
  const out: Int16Array[] = [];
  const gate = new NoiseGate((pcm) => out.push(pcm));
  const clicks = new Int16Array(16000);
  for (let t = 800; t < clicks.length - 400; t += 2400) {
    for (let i = 0; i < 300; i++) clicks[t + i] = Math.round((Math.random() * 2 - 1) * 12000);
  }
  gate.push(clicks);
  gate.push(signal([["voice", 1000]]));
  gate.flush();
  const all = concatPcm(out);
  assert.equal(all.length, 32000);
  assert.equal(peak(all.subarray(0, 16000 - 4800)), 0, "clicks far from voice are silenced");
  assert.ok(peak(all.subarray(16000)) > 7000, "voice is preserved");
});
