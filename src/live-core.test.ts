import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeWav, LiveTranscriber, NoiseGate, SAMPLE_RATE, toPcm16k } from "../web/live-core.js";

/** Tom de 220 Hz (fala) ou ruído baixo (silêncio), em ms. */
function audio(parts: [kind: "voz" | "pausa", ms: number][]): Int16Array {
  const total = parts.reduce((n, [, ms]) => n + (ms * SAMPLE_RATE) / 1000, 0);
  const out = new Int16Array(total);
  let o = 0;
  for (const [kind, ms] of parts) {
    const n = (ms * SAMPLE_RATE) / 1000;
    for (let i = 0; i < n; i++, o++)
      out[o] =
        kind === "voz"
          ? Math.round(8000 * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE))
          : Math.round((Math.random() - 0.5) * 60);
  }
  return out;
}

const seconds = (wav: Uint8Array) => (wav.length - 44) / 2 / SAMPLE_RATE;

function feed(live: LiveTranscriber, pcm: Int16Array) {
  for (let i = 0; i < pcm.length; i += 1600) live.push(pcm.subarray(i, i + 1600));
}

test("separa trechos pelas pausas e confirma na ordem, mesmo com respostas fora de ordem", async () => {
  const calls: number[] = [];
  let n = 0;
  const live = new LiveTranscriber({
    interimEveryMs: 100_000, // sem parciais neste teste
    transcribe: async (wav) => {
      const id = ++n;
      calls.push(seconds(wav));
      await new Promise((r) => setTimeout(r, id === 1 ? 60 : 5)); // o 1º responde por último
      return { text: `trecho${id}` };
    },
    onUpdate: () => {},
  });
  feed(
    live,
    audio([
      ["pausa", 400],
      ["voz", 1000],
      ["pausa", 900],
      ["voz", 800],
      ["pausa", 300],
    ]),
  );
  assert.equal(await live.stop(), "trecho1 trecho2");
  assert.equal(calls.length, 2);
  assert.ok(calls[0] > 1 && calls[0] < 2.2, `1º trecho com ${calls[0]} s`);
});

test("mostra texto parcial enquanto o trecho cresce", async () => {
  const updates: [string, string][] = [];
  let calls = 0;
  const live = new LiveTranscriber({
    interimEveryMs: 400,
    transcribe: async (wav) => {
      calls++;
      return { text: `parcial ${seconds(wav).toFixed(1)}` };
    },
    onUpdate: (c, p) => updates.push([c, p]),
  });
  const pcm = audio([
    ["pausa", 400],
    ["voz", 2000],
  ]);
  for (let i = 0; i < pcm.length; i += 1600) {
    live.push(pcm.subarray(i, i + 1600));
    await new Promise((r) => setTimeout(r, 1));
  }
  assert.ok(
    updates.some(([c, p]) => c === "" && p.startsWith("parcial")),
    "houve parcial antes de parar",
  );
  const final = await live.stop();
  assert.match(final, /^parcial \d/);
  assert.ok(calls >= 3);
});

test("ignora ruído curto e devolve vazio sem fala", async () => {
  let calls = 0;
  const live = new LiveTranscriber({
    transcribe: async () => {
      calls++;
      return { text: "x" };
    },
    onUpdate: () => {},
  });
  feed(
    live,
    audio([
      ["pausa", 500],
      ["voz", 60],
      ["pausa", 1000],
    ]),
  );
  assert.equal(await live.stop(), "");
  assert.equal(calls, 0);
});

test("cancel descarta tudo", async () => {
  const live = new LiveTranscriber({ transcribe: async () => ({ text: "x" }), onUpdate: () => {} });
  feed(
    live,
    audio([
      ["pausa", 300],
      ["voz", 500],
    ]),
  );
  live.cancel();
  feed(live, audio([["voz", 500]]));
  assert.equal(live.text().pending, "");
});

test("fala desde o primeiro quadro não se perde (sem calibrar no silêncio)", async () => {
  let sent = 0;
  const live = new LiveTranscriber({
    transcribe: async (wav) => {
      sent = seconds(wav);
      return { text: "olá" };
    },
    onUpdate: () => {},
  });
  feed(
    live,
    audio([
      ["voz", 900],
      ["pausa", 800],
    ]),
  );
  assert.equal(await live.stop(), "olá");
  assert.ok(sent >= 0.9, `trecho enviado com ${sent} s`);
});

test("NoiseGate zera cliques sem tom e deixa a voz passar com atraso", () => {
  const out: Int16Array[] = [];
  const gate = new NoiseGate((pcm: Int16Array) => out.push(pcm));
  const clicks = new Int16Array(16000);
  for (let t = 800; t < clicks.length - 400; t += 2400)
    for (let i = 0; i < 300; i++) clicks[t + i] = Math.round((Math.random() * 2 - 1) * 12000);
  gate.push(clicks);
  gate.push(audio([["voz", 1000]]));
  gate.flush();
  const all = new Int16Array(out.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of out) {
    all.set(a, o);
    o += a.length;
  }
  assert.equal(all.length, 32000);
  const peak = (a: Int16Array) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  assert.equal(peak(all.subarray(0, 16000 - 4800)), 0, "cliques longe da voz zerados");
  assert.ok(peak(all.subarray(16000)) > 7000, "voz preservada");
});

test("toPcm16k reamostra 48 kHz e encodeWav gera WAV válido", () => {
  const f = new Float32Array(48000).fill(0.5);
  const pcm = toPcm16k(f, 48000);
  assert.equal(pcm.length, 16000);
  assert.equal(pcm[0], 16383);
  const wav = encodeWav(pcm);
  assert.equal(new TextDecoder().decode(wav.subarray(0, 4)), "RIFF");
  assert.equal(seconds(wav), 1);
});
