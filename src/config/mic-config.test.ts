import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DEFAULT_MODEL, loadConfig, realtimeKey, saveConfig } from "./mic-config.ts";

const tempDir = () => mkdtempSync(join(tmpdir(), "pi-mic-config-"));

test("loadConfig falls back to the default model when the file is missing", () => {
  assert.deepEqual(loadConfig(tempDir()), { model: DEFAULT_MODEL });
});

test("saveConfig and loadConfig round-trip the file shape", () => {
  const dir = tempDir();
  saveConfig(dir, { provider: "p", model: "m", language: "pt" });
  assert.deepEqual(loadConfig(dir), { provider: "p", model: "m", language: "pt" });
  assert.match(readFileSync(join(dir, "pi-mic.json"), "utf8"), /\n$/);
});

test("loadConfig fills in the default model when the file omits it", () => {
  const dir = tempDir();
  writeFileSync(join(dir, "pi-mic.json"), JSON.stringify({ provider: "p" }));
  assert.equal(loadConfig(dir).model, DEFAULT_MODEL);
});

test("realtimeKey prefers the environment over the config", () => {
  const config = { model: "m", realtime: { provider: "deepgram" as const, apiKey: "file" } };
  assert.equal(realtimeKey(config, { DEEPGRAM_API_KEY: "env" }), "env");
  assert.equal(realtimeKey(config, {}), "file");
  assert.equal(realtimeKey({ model: "m" }, {}), undefined);
});
