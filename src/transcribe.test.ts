import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { appendText, silentWav, transcribe } from "./transcribe.ts";

test("appendText separa com espaço só quando preciso", () => {
  assert.equal(appendText("", "oi"), "oi");
  assert.equal(appendText("fix", "the bug"), "fix the bug");
  assert.equal(appendText("fix ", "the bug"), "fix the bug");
});

test("silentWav gera cabeçalho RIFF/WAVE de 16 kHz mono", () => {
  const wav = Buffer.from(silentWav(500));
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.toString("ascii", 8, 12), "WAVE");
  assert.equal(wav.readUInt32LE(24), 16000);
  assert.equal(wav.readUInt32LE(40), 16000);
  assert.equal(wav.length, 44 + 16000);
});

async function withServer(
  reply: (body: string, auth: string | undefined) => [number, string],
  fn: (baseUrl: string) => Promise<void>,
) {
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    const [status, out] = reply(body, req.headers.authorization);
    res.writeHead(status, { "content-type": "application/json" });
    res.end(out);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}/v1/`);
  } finally {
    server.close();
  }
}

const base = {
  apiKey: "k",
  model: "deepgram/nova-3",
  audio: silentWav(10),
  mimeType: "audio/wav",
  fileName: "speech.wav",
};

test("transcribe envia multipart com modelo, idioma e Bearer", async () => {
  let seen = "";
  let auth: string | undefined;
  await withServer(
    (body, a) => {
      seen = body;
      auth = a;
      return [200, JSON.stringify({ text: " olá ", noSpeechDetected: false })];
    },
    async (baseUrl) => {
      const r = await transcribe({ ...base, baseUrl, language: "pt" });
      assert.deepEqual(r, { text: "olá", noSpeech: false });
    },
  );
  assert.equal(auth, "Bearer k");
  assert.match(seen, /name="model"\r\n\r\ndeepgram\/nova-3/);
  assert.match(seen, /name="language"\r\n\r\npt/);
  assert.match(seen, /filename="speech.wav"/);
});

test("transcribe marca ausência de fala e propaga erro HTTP", async () => {
  await withServer(
    () => [200, JSON.stringify({ text: "", noSpeechDetected: true })],
    async (baseUrl) => {
      assert.deepEqual(await transcribe({ ...base, baseUrl }), { text: "", noSpeech: true });
    },
  );
  await withServer(
    () => [401, JSON.stringify({ error: "auth" })],
    async (baseUrl) => {
      await assert.rejects(transcribe({ ...base, baseUrl }), /HTTP 401/);
    },
  );
});
