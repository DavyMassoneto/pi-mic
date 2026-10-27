import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { installPiWebHost } from "../web/host/install-pi-web-host.ts";
import { loadBrowserAssets } from "../web/server/browser-assets.ts";
import { registerMicCommand } from "./commands/mic-command.ts";

const DIST_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "dist");
const RELOAD_NOTICE =
  "pi-mic: microphone ready for pi-web. Reload this page to get the mic button.";

export function enterPiWebMode(pi: ExtensionAPI, agentDir: string): void {
  registerMicCommand(pi, { agentDir });
  const installed = installPiWebHost({
    agentDir,
    env: process.env,
    assets: loadBrowserAssets(DIST_ROOT),
  });
  if (!installed) return;
  let notified = false;
  pi.on("agent_start", (_event, ctx) => {
    if (notified) return;
    notified = true;
    ctx.ui.notify(RELOAD_NOTICE, "info");
  });
}
