import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Dictation } from "../dictation.ts";
import { checkSetup } from "./check-command.ts";
import { pickDevice } from "./device-command.ts";
import { setupMic } from "./setup-command.ts";

const CLI_SUBCOMMANDS = ["device", "setup", "check"];
const WEB_SUBCOMMANDS = ["setup", "check"];
const WEB_USAGE =
  "pi-mic in pi-web: use the mic button in the page; /mic setup and /mic check configure it";

interface MicCommandDeps {
  agentDir: string;
  dictation?: Dictation;
}

export function registerMicCommand(pi: ExtensionAPI, deps: MicCommandDeps): void {
  const subcommands = deps.dictation ? CLI_SUBCOMMANDS : WEB_SUBCOMMANDS;
  pi.registerCommand("mic", {
    description:
      "Voice input. /mic toggles recording; /mic device picks the microphone; /mic setup; /mic check",
    getArgumentCompletions: (prefix: string) =>
      subcommands
        .filter((name) => name.startsWith(prefix))
        .map((name) => ({
          value: name,
          label: name,
        })),
    handler: async (args, ctx) => {
      const subcommand = args.trim();
      if (subcommand === "device" && deps.dictation) return pickDevice(ctx, deps.agentDir);
      if (subcommand === "setup") return setupMic(ctx, deps.agentDir);
      if (subcommand === "check") return checkSetup(ctx, deps.agentDir);
      if (deps.dictation) return deps.dictation.toggle(ctx);
      ctx.ui.notify(WEB_USAGE, "info");
    },
  });
}
