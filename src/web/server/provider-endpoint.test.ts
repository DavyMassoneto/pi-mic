import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { resolveProviderEndpoint } from "./provider-endpoint.ts";

function agentDirWith(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "pi-mic-endpoint-"));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), JSON.stringify(content));
  }
  return dir;
}

const config = { provider: "p", model: "deepgram/nova-3", language: "pt" };

test("resolveProviderEndpoint reads the key from an environment variable named in models.json", () => {
  const dir = agentDirWith({
    "models.json": { providers: { p: { apiKey: "MY_KEY", baseUrl: "http://gw/v1" } } },
  });
  const endpoint = resolveProviderEndpoint(dir, config, { MY_KEY: "secret" });
  assert.deepEqual(endpoint, {
    apiKey: "secret",
    baseUrl: "http://gw/v1",
    model: "deepgram/nova-3",
    language: "pt",
  });
});

test("resolveProviderEndpoint prefers auth.json and the configured baseUrl", () => {
  const dir = agentDirWith({
    "models.json": { providers: { p: { apiKey: "MY_KEY", baseUrl: "http://gw/v1" } } },
    "auth.json": { p: { key: "from-auth" } },
  });
  const endpoint = resolveProviderEndpoint(dir, { ...config, baseUrl: "http://own/v1" }, {});
  assert.equal(endpoint.apiKey, "from-auth");
  assert.equal(endpoint.baseUrl, "http://own/v1");
});

test("resolveProviderEndpoint explains what is missing", () => {
  const dir = agentDirWith({});
  assert.throws(() => resolveProviderEndpoint(dir, { model: "m" }, {}), /no provider set/);
  assert.throws(() => resolveProviderEndpoint(dir, config, {}), /no API key for provider "p"/);
  const keyOnly = agentDirWith({ "auth.json": { p: { key: "k" } } });
  assert.throws(() => resolveProviderEndpoint(keyOnly, config, {}), /no baseUrl for provider "p"/);
});
