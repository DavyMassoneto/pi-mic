import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveEndpoint } from "./endpoint.ts";

function fakeContext(apiKey: string | undefined, models: { provider: string; baseUrl: string }[]) {
  return {
    modelRegistry: {
      getApiKeyForProvider: async () => apiKey,
      getAll: () => models,
    },
  } as never;
}

test("resolveEndpoint requires a provider", async () => {
  await assert.rejects(resolveEndpoint(fakeContext("k", []), { model: "m" }), /no provider set/);
});

test("resolveEndpoint requires an API key", async () => {
  await assert.rejects(
    resolveEndpoint(fakeContext(undefined, []), { model: "m", provider: "p" }),
    /no API key for provider "p"/,
  );
});

test("resolveEndpoint prefers the configured baseUrl over the registry", async () => {
  const models = [{ provider: "p", baseUrl: "http://registry/v1" }];
  const config = { model: "m", provider: "p" };
  const fromRegistry = await resolveEndpoint(fakeContext("k", models), config);
  assert.deepEqual(fromRegistry, { apiKey: "k", baseUrl: "http://registry/v1" });
  const configured = await resolveEndpoint(fakeContext("k", models), {
    ...config,
    baseUrl: "http://configured/v1",
  });
  assert.equal(configured.baseUrl, "http://configured/v1");
});

test("resolveEndpoint fails without any baseUrl", async () => {
  await assert.rejects(
    resolveEndpoint(fakeContext("k", []), { model: "m", provider: "p" }),
    /no baseUrl for provider "p"/,
  );
});
