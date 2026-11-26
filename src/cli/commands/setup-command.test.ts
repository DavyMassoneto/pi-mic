import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { DEFAULT_MODEL, loadConfig, saveConfig } from "../../config/mic-config.ts";
import { setupMic } from "./setup-command.ts";

const GEMINI_MODEL = "agy/gemini-3.8-flash-low";

async function withSetup(
  provider: string,
  modelChoice: string,
  mode: string,
  fn: (dir: string, ctx: Parameters<typeof setupMic>[0], choices: string[][]) => Promise<void>,
) {
  const dir = mkdtempSync(join(import.meta.dirname, ".setup-test-"));
  const choices: string[][] = [];
  const ctx = {
    modelRegistry: { getAll: () => [{ provider }] },
    ui: {
      select: async (title: string, items: string[]) => {
        choices.push(items);
        if (title.startsWith("Provider")) return provider;
        if (title === "Mode") return mode;
        return modelChoice;
      },
      input: async (_title: string, value: string) => value,
      notify: () => {},
    },
  } as never;
  try {
    await fn(dir, ctx, choices);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("setup offers Gemini via omniroute for segmented transcription without changing the default", async () => {
  await withSetup(
    "omniroute",
    GEMINI_MODEL,
    "Per phrase (the provider above)",
    async (dir, ctx, choices) => {
      await setupMic(ctx, dir);
      assert.ok(
        choices.some((items) => items[0] === DEFAULT_MODEL && items.includes(GEMINI_MODEL)),
      );
      assert.deepEqual(loadConfig(dir), { provider: "omniroute", model: GEMINI_MODEL });
    },
  );
});

test("setup keeps a configured model and Deepgram realtime when selected", async () => {
  await withSetup(
    "omniroute",
    "custom-model",
    "Real time (Deepgram streaming)",
    async (dir, ctx) => {
      saveConfig(dir, {
        provider: "omniroute",
        model: "custom-model",
        realtime: { provider: "deepgram", model: "nova-3", apiKey: "test-key" },
      });
      await setupMic(ctx, dir);
      const config = loadConfig(dir);
      assert.equal(config.model, "custom-model");
      assert.deepEqual(config.realtime, {
        provider: "deepgram",
        model: "nova-3",
        apiKey: "test-key",
      });
    },
  );
});

test("setup removes realtime when switching to the Gemini segmented option", async () => {
  await withSetup(
    "omniroute",
    GEMINI_MODEL,
    "Per phrase (the provider above)",
    async (dir, ctx) => {
      saveConfig(dir, {
        provider: "omniroute",
        model: DEFAULT_MODEL,
        realtime: { provider: "deepgram", apiKey: "test-key" },
      });
      await setupMic(ctx, dir);
      assert.deepEqual(loadConfig(dir), { provider: "omniroute", model: GEMINI_MODEL });
    },
  );
});

test("setup accepts the custom model input for omniroute", async () => {
  await withSetup(
    "omniroute",
    "Other model…",
    "Per phrase (the provider above)",
    async (dir, ctx) => {
      saveConfig(dir, { provider: "omniroute", model: "custom-transcription-model" });
      await setupMic(ctx, dir);
      assert.equal(loadConfig(dir).model, "custom-transcription-model");
    },
  );
});

test("setup leaves other providers on the existing model input flow", async () => {
  await withSetup(
    "other",
    GEMINI_MODEL,
    "Per phrase (the provider above)",
    async (dir, ctx, choices) => {
      await setupMic(ctx, dir);
      assert.equal(loadConfig(dir).model, DEFAULT_MODEL);
      assert.ok(!choices.some((items) => items.includes(GEMINI_MODEL)));
    },
  );
});
