import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { createEngine } from "../../cli/engine-factory.ts";
import { SAMPLE_RATE } from "../../core/audio/pcm.ts";
import { silentWav } from "../../core/audio/wav.ts";
import { feed, signal } from "../../testing/signals.ts";
import { TranscriptionHttpError, transcribe } from "./transcribe.ts";

async function withServer(
  reply: (
    body: string,
    auth: string | undefined,
    method?: string,
    url?: string,
  ) => [number, string],
  fn: (baseUrl: string) => Promise<void>,
) {
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const [status, out] = reply(body, req.headers.authorization, req.method, req.url);
    res.writeHead(status, { "content-type": "application/json" });
    res.end(out);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
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

test("transcribe sends multipart with model, language and Bearer token", async () => {
  let seen = "";
  let auth: string | undefined;
  await withServer(
    (body, header) => {
      seen = body;
      auth = header;
      return [200, JSON.stringify({ text: " hello ", noSpeechDetected: false })];
    },
    async (baseUrl) => {
      const result = await transcribe({ ...base, baseUrl, language: "pt" });
      assert.deepEqual(result, { text: "hello", noSpeech: false });
    },
  );
  assert.equal(auth, "Bearer k");
  assert.match(seen, /name="model"\r\n\r\ndeepgram\/nova-3/);
  assert.match(seen, /name="language"\r\n\r\npt/);
  assert.match(seen, /filename="speech.wav"/);
});

test("segmented dictation wires the configured OmniRoute Gemini model to audio transcriptions", async () => {
  const requests: { body: string; auth: string | undefined; method?: string; url?: string }[] = [];
  const errors: Error[] = [];
  await withServer(
    (body, auth, method, url) => {
      requests.push({ body, auth, method, url });
      return [200, JSON.stringify({ text: " Gemini dictation " })];
    },
    async (baseUrl) => {
      const ctx = {
        modelRegistry: {
          getApiKeyForProvider: async (provider: string) => {
            assert.equal(provider, "omniroute");
            return "test-omniroute-key";
          },
          getAll: () => [{ provider: "omniroute", baseUrl }],
        },
      } as never;
      const engine = await createEngine(
        ctx,
        { provider: "omniroute", model: "agy/gemini-3.8-flash-low", language: "pt" },
        SAMPLE_RATE,
        { onUpdate: () => {}, onError: (error) => errors.push(error), onLevel: () => {} },
      );
      feed(engine, signal([["voice", 900]]));
      assert.equal(await engine.stop(), "Gemini dictation");
    },
  );
  assert.deepEqual(errors, []);
  assert.ok(requests.length > 0);
  for (const request of requests) {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/v1/audio/transcriptions");
    assert.equal(request.auth, "Bearer test-omniroute-key");
    assert.match(request.body, /name="model"\r\n\r\nagy\/gemini-3\.8-flash-low/);
    assert.match(request.body, /name="language"\r\n\r\npt/);
    assert.match(request.body, /filename="speech.wav"/);
    assert.match(request.body, /Content-Type: audio\/wav/i);
  }
});

test("transcribe flags missing speech and raises a typed HTTP error", async () => {
  await withServer(
    () => [200, JSON.stringify({ text: "", noSpeechDetected: true })],
    async (baseUrl) => {
      assert.deepEqual(await transcribe({ ...base, baseUrl }), { text: "", noSpeech: true });
    },
  );
  await withServer(
    () => [401, JSON.stringify({ error: "auth" })],
    async (baseUrl) => {
      await assert.rejects(transcribe({ ...base, baseUrl }), (err) => {
        assert.ok(err instanceof TranscriptionHttpError);
        assert.equal(err.status, 401);
        assert.match(err.message, /HTTP 401/);
        return true;
      });
    },
  );
});
