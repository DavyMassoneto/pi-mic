import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { handleTranscribe } from "./transcribe-route.ts";

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function agentDirFor(baseUrl: string | undefined): string {
  const dir = mkdtempSync(join(tmpdir(), "pi-mic-route-"));
  const config = baseUrl ? { provider: "p", baseUrl } : {};
  writeFileSync(join(dir, "pi-mic.json"), JSON.stringify(config));
  writeFileSync(join(dir, "auth.json"), JSON.stringify({ p: { key: "k" } }));
  return dir;
}

async function post(agentDir: string, body: Buffer, maxAudioBytes?: number) {
  const server = createServer((req, res) => {
    void handleTranscribe({ agentDir, env: {}, maxAudioBytes }, req, res);
  });
  const url = await listen(server);
  try {
    const headers = { "content-type": "audio/wav" };
    const res = await fetch(url, { method: "POST", headers, body: new Uint8Array(body) });
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  } finally {
    server.closeAllConnections();
    server.close();
  }
}

async function withUpstream(status: number, reply: string, fn: (baseUrl: string) => Promise<void>) {
  const upstream = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(reply);
    });
  });
  const baseUrl = await listen(upstream);
  try {
    await fn(baseUrl);
  } finally {
    upstream.closeAllConnections();
    upstream.close();
  }
}

test("transcribe route rejects oversized audio with 413", async () => {
  const result = await post(agentDirFor(undefined), Buffer.alloc(20), 10);
  assert.equal(result.status, 413);
  assert.deepEqual(result.json, { error: "audio too large" });
});

test("transcribe route maps a gateway HTTP failure to 502", async () => {
  await withUpstream(401, "denied", async (baseUrl) => {
    const result = await post(agentDirFor(baseUrl), Buffer.alloc(8));
    assert.equal(result.status, 502);
    assert.match(String(result.json.error), /HTTP 401: denied/);
  });
});

test("transcribe route maps configuration errors to 500", async () => {
  const result = await post(agentDirFor(undefined), Buffer.alloc(8));
  assert.equal(result.status, 500);
  assert.match(String(result.json.error), /no provider set/);
});

test("transcribe route returns the text and the no-speech flag", async () => {
  await withUpstream(200, JSON.stringify({ text: " hi " }), async (baseUrl) => {
    const result = await post(agentDirFor(baseUrl), Buffer.alloc(8));
    assert.equal(result.status, 200);
    assert.deepEqual(result.json, { text: "hi", noSpeech: false });
  });
});
