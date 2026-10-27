import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadBrowserAssets } from "./browser-assets.ts";

function fakeDist(): string {
  const root = mkdtempSync(join(tmpdir(), "pi-mic-dist-"));
  for (const [path, content] of Object.entries({
    "core/audio/pcm.js": "pcm",
    "web/client/main.js": "main",
    "web/client/nested/view.js": "view",
    "web/server/main.js": "server",
    "config/mic-config.js": "secret-config",
  })) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

test("loadBrowserAssets serves core and client scripts under mirrored paths", () => {
  const assets = loadBrowserAssets(fakeDist());
  assert.equal(assets.get("/__pi-mic/assets/core/audio/pcm.js")?.toString(), "pcm");
  assert.equal(assets.get("/__pi-mic/assets/web/client/main.js")?.toString(), "main");
  assert.equal(assets.get("/__pi-mic/assets/web/client/nested/view.js")?.toString(), "view");
});

test("loadBrowserAssets rejects server code, other folders and traversal", () => {
  const assets = loadBrowserAssets(fakeDist());
  assert.equal(assets.has("/__pi-mic/assets/web/server/main.js"), false);
  assert.equal(assets.has("/__pi-mic/assets/config/mic-config.js"), false);
  assert.equal(assets.has("/__pi-mic/assets/web/client/../server/main.js"), false);
  assert.equal(assets.size, 3);
});
