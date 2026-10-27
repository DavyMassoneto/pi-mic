import assert from "node:assert/strict";
import { test } from "node:test";
import { concatPcm, floatToInt16, rmsLevel } from "./pcm.ts";

test("floatToInt16 keeps the sample count and scales to full range", () => {
  const pcm = floatToInt16(new Float32Array(48000).fill(0.5));
  assert.equal(pcm.length, 48000);
  assert.equal(pcm[0], 16383);
  assert.equal(floatToInt16(new Float32Array([-2, 2]))[0], -32768);
});

test("concatPcm joins chunks in order", () => {
  const joined = concatPcm([new Int16Array([1, 2]), new Int16Array([]), new Int16Array([3])]);
  assert.deepEqual([...joined], [1, 2, 3]);
});

test("rmsLevel is zero for silence and capped at one", () => {
  assert.equal(rmsLevel(new Int16Array(10)), 0);
  assert.equal(rmsLevel(new Int16Array(10).fill(30000)), 1);
  assert.equal(rmsLevel(new Int16Array(0)), 0);
});
