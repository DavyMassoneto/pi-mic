import assert from "node:assert/strict";
import { test } from "node:test";
import { statusLabel } from "./status-line.ts";

test("statusLabel is empty when idle", () => {
  assert.equal(statusLabel("idle"), undefined);
});

test("statusLabel describes the starting and transcribing phases", () => {
  assert.equal(statusLabel("starting"), "🎙 starting…");
  assert.equal(statusLabel("transcribing"), "🎙 finishing transcription…");
});

test("statusLabel shows the meter bar for the recording level", () => {
  assert.equal(statusLabel("recording", 0), "🔴   listening — alt+m stops, esc cancels");
  assert.equal(statusLabel("recording", 1), "🔴 █ listening — alt+m stops, esc cancels");
  assert.match(statusLabel("recording", 0.5) ?? "", /^🔴 ▄ listening/);
});
