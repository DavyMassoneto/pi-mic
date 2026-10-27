import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, saveConfig } from "../../config/mic-config.ts";
import { listInputDevices } from "../capture/windows-devices.ts";

const SYSTEM_DEFAULT = "(system default)";

export async function pickDevice(ctx: ExtensionContext, agentDir: string): Promise<void> {
  const names = await listInputDevices();
  if (names.length === 0) {
    ctx.ui.notify("pi-mic: device selection is only available on Windows", "info");
    return;
  }
  const choice = await ctx.ui.select("Microphone", [SYSTEM_DEFAULT, ...names]);
  if (choice === undefined) return;
  const config = loadConfig(agentDir);
  config.device = choice === SYSTEM_DEFAULT ? undefined : choice;
  saveConfig(agentDir, config);
  ctx.ui.notify(`pi-mic: input device = ${choice}`, "info");
}
