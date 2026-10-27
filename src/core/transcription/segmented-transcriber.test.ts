import assert from "node:assert/strict";
import { test } from "node:test";
import { feed, signal } from "../../testing/signals.ts";
import { SAMPLE_RATE } from "../audio/pcm.ts";
import { SegmentedTranscriber } from "./segmented-transcriber.ts";

const seconds = (wav: Uint8Array) => (wav.length - 44) / 2 / SAMPLE_RATE;

test("splits segments on pauses and commits in order despite out-of-order replies", async () => {
  const durations: number[] = [];
  let calls = 0;
  const transcriber = new SegmentedTranscriber({
    interimEveryMs: 100_000,
    transcribe: async (wav) => {
      const id = ++calls;
      durations.push(seconds(wav));
      await new Promise((resolve) => setTimeout(resolve, id === 1 ? 60 : 5));
      return { text: `segment${id}` };
    },
    onUpdate: () => {},
  });
  feed(
    transcriber,
    signal([
      ["pause", 400],
      ["voice", 1000],
      ["pause", 900],
      ["voice", 800],
      ["pause", 300],
    ]),
  );
  assert.equal(await transcriber.stop(), "segment1 segment2");
  assert.equal(durations.length, 2);
  assert.ok(durations[0] > 1 && durations[0] < 2.2, `first segment lasted ${durations[0]} s`);
});

test("shows interim text while the segment grows", async () => {
  const updates: [string, string][] = [];
  let calls = 0;
  const transcriber = new SegmentedTranscriber({
    interimEveryMs: 400,
    transcribe: async (wav) => {
      calls++;
      return { text: `interim ${seconds(wav).toFixed(1)}` };
    },
    onUpdate: (committed, pending) => updates.push([committed, pending]),
  });
  const pcm = signal([
    ["pause", 400],
    ["voice", 2000],
  ]);
  for (let i = 0; i < pcm.length; i += 1600) {
    transcriber.push(pcm.subarray(i, i + 1600));
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert.ok(
    updates.some(([committed, pending]) => committed === "" && pending.startsWith("interim")),
    "an interim update arrived before stopping",
  );
  assert.match(await transcriber.stop(), /^interim \d/);
  assert.ok(calls >= 3);
});

test("ignores short noise and returns empty text without speech", async () => {
  let calls = 0;
  const transcriber = new SegmentedTranscriber({
    transcribe: async () => {
      calls++;
      return { text: "x" };
    },
    onUpdate: () => {},
  });
  feed(
    transcriber,
    signal([
      ["pause", 500],
      ["voice", 60],
      ["pause", 1000],
    ]),
  );
  assert.equal(await transcriber.stop(), "");
  assert.equal(calls, 0);
});

test("cancel discards everything", () => {
  const transcriber = new SegmentedTranscriber({
    transcribe: async () => ({ text: "x" }),
    onUpdate: () => {},
  });
  feed(
    transcriber,
    signal([
      ["pause", 300],
      ["voice", 500],
    ]),
  );
  transcriber.cancel();
  feed(transcriber, signal([["voice", 500]]));
  assert.equal(transcriber.text().pending, "");
});

test("speech from the very first frame is not lost", async () => {
  let sentSeconds = 0;
  const transcriber = new SegmentedTranscriber({
    transcribe: async (wav) => {
      sentSeconds = seconds(wav);
      return { text: "hello" };
    },
    onUpdate: () => {},
  });
  feed(
    transcriber,
    signal([
      ["voice", 900],
      ["pause", 800],
    ]),
  );
  assert.equal(await transcriber.stop(), "hello");
  assert.ok(sentSeconds >= 0.9, `segment sent with ${sentSeconds} s`);
});

test("at 48 kHz it detects voice and sends the segment at the native rate", async () => {
  const rate = 48000;
  const pcm = new Int16Array(rate * 2);
  for (let i = 0; i < rate; i++) {
    pcm[i] = Math.round(8000 * Math.sin((2 * Math.PI * 220 * i) / rate));
  }
  let headerRate = 0;
  const transcriber = new SegmentedTranscriber({
    sampleRate: rate,
    transcribe: async (wav) => {
      headerRate = new DataView(wav.buffer).getUint32(24, true);
      return { text: "ok" };
    },
    onUpdate: () => {},
  });
  feed(transcriber, pcm, 4800);
  assert.equal(await transcriber.stop(), "ok");
  assert.equal(headerRate, rate);
});

test("reports transcription errors and treats the segment as empty", async () => {
  const errors: string[] = [];
  const transcriber = new SegmentedTranscriber({
    transcribe: async () => {
      throw new Error("boom");
    },
    onUpdate: () => {},
    onError: (err) => errors.push(err.message),
  });
  feed(transcriber, signal([["voice", 900]]));
  assert.equal(await transcriber.stop(), "");
  assert.ok(errors.length >= 1);
  assert.ok(errors.every((message) => message === "boom"));
});
