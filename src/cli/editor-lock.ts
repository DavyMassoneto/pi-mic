import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { matchesKey } from "@earendil-works/pi-tui";
import { SHORTCUT } from "./constants.ts";

interface LockHandlers {
  onToggle: () => void;
  onCancel: () => void;
}

export function lockEditor(ui: ExtensionContext["ui"], handlers: LockHandlers): () => void {
  return ui.onTerminalInput((data) => {
    if (matchesKey(data, SHORTCUT)) handlers.onToggle();
    else if (matchesKey(data, "escape")) handlers.onCancel();
    return { consume: true };
  });
}
