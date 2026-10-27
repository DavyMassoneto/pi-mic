import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { registerMicCommand } from "./commands/mic-command.ts";
import { SHORTCUT } from "./constants.ts";
import { Dictation } from "./dictation.ts";

export default function (pi: ExtensionAPI) {
  const agentDir = getAgentDir();
  const dictation = new Dictation(agentDir);

  pi.registerShortcut(SHORTCUT, {
    description: "Voice input: start/stop recording and insert the transcription",
    handler: (ctx) => dictation.toggle(ctx),
  });
  registerMicCommand(pi, { agentDir, dictation });
  pi.on("session_shutdown", () => dictation.dispose());
}
