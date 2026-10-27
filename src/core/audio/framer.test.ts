import assert from "node:assert/strict";
import { test } from "node:test";
import { frameLength, PcmFramer } from "./framer.ts";

test("frameLength is 20 ms of samples", () => {
  assert.equal(frameLength(16000), 320);
  assert.equal(frameLength(48000), 960);
});

test("PcmFramer emits whole frames and carries the remainder over", () => {
  const framer = new PcmFramer(16000);
  const frames: Int16Array[] = [];
  framer.push(new Int16Array(500), (frame) => frames.push(frame));
  assert.equal(frames.length, 1);
  framer.push(new Int16Array(500), (frame) => frames.push(frame));
  assert.equal(frames.length, 3);
  assert.ok(frames.every((frame) => frame.length === 320));
  assert.equal(framer.takeRest().length, 40);
  assert.equal(framer.takeRest().length, 0);
});
