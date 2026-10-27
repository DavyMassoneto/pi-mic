import assert from "node:assert/strict";
import { test } from "node:test";
import { PcmRelay } from "./pcm-relay.ts";

test("PcmRelay replays early chunks in order and then forwards live ones", () => {
  const relay = new PcmRelay();
  const seen: number[] = [];
  relay.push(new Int16Array([1]));
  relay.push(new Int16Array([2]));
  relay.attach({ push: (pcm) => seen.push(pcm[0]) });
  relay.push(new Int16Array([3]));
  assert.deepEqual(seen, [1, 2, 3]);
});
