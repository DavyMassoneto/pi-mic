#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAgentDir } from "./agent-dir.ts";
import { createMicServer } from "./app.ts";
import { loadBrowserAssets } from "./browser-assets.ts";
import { parseOptions } from "./options.ts";
import { detectTarget } from "./pi-web-run.ts";

const distRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const agentDir = resolveAgentDir(process.env);
const options = parseOptions(process.argv.slice(2), process.env);
const targetUrl = options.targetUrl || detectTarget(agentDir);

if (!targetUrl) {
  console.error("pi-mic-web: pi-web address unknown; pass --target http://host:port");
  process.exit(1);
}

const target = new URL(targetUrl);
const server = createMicServer({
  target,
  agentDir,
  env: process.env,
  assets: loadBrowserAssets(distRoot),
});

server.listen(options.listenPort, options.listenHost, () => {
  console.log(`pi-mic-web: http://${options.listenHost}:${options.listenPort} → ${target.origin}`);
});
