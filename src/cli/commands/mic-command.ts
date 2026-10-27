import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Dictation } from "../dictation.ts";
import { checkSetup } from "./check-command.ts";
import { pickDevice } from "./device-command.ts";
import { setupMic } from "./setup-command.ts";

const SUBCOMMANDS = ["device", "setup", "check"];

interface MicCommandDeps {
  agentDir: string;
  dictation: Dictation;
}

export function registerMicCommand(pi: ExtensionAPI, deps: MicCommandDeps): void {
  pi.registerCommand("mic", {
    description:
      "Voice input. /mic toggles recording; /mic device picks the microphone; /mic setup; /mic check",
    getArgumentCompletions: (prefix: string) =>
      SUBCOMMANDS.filter((name) => name.startsWith(prefix)).map((name) => ({
        value: name,
        label: name,
      })),
    handler: async (args, ctx) => {
      const subcommand = args.trim();
      if (subcommand === "device") return pickDevice(ctx, deps.agentDir);
      if (subcommand === "setup") return setupMic(ctx, deps.agentDir);
      if (subcommand === "check") return checkSetup(ctx, deps.agentDir);
      return deps.dictation.toggle(ctx);
    },
  });
}
