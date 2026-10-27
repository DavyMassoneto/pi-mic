import type { Composer } from "./composer.ts";

interface InputGuardOptions {
  composer: Composer;
  button: HTMLElement;
  isBusy: () => boolean;
  onToggle: () => void;
  onCancel: () => void;
}

const BLOCKED_EDIT_EVENTS = ["beforeinput", "paste", "drop", "cut"];
const BLOCKED_POINTER_EVENTS = ["click", "mousedown", "pointerdown"];

function swallow(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
}

function isToggleShortcut(event: KeyboardEvent): boolean {
  return event.altKey && !event.ctrlKey && !event.metaKey && event.code === "KeyM";
}

export function installInputGuard(options: InputGuardOptions): void {
  const { composer, button, isBusy, onToggle, onCancel } = options;

  document.addEventListener(
    "keydown",
    (event) => {
      if (isToggleShortcut(event)) {
        swallow(event);
        onToggle();
        return;
      }
      if (!isBusy()) return;
      if (event.key === "Escape") {
        swallow(event);
        onCancel();
        return;
      }
      if (composer.owns(event.target)) swallow(event);
    },
    true,
  );

  for (const type of BLOCKED_EDIT_EVENTS) {
    document.addEventListener(
      type,
      (event) => {
        if (isBusy() && composer.owns(event.target)) swallow(event);
      },
      true,
    );
  }

  for (const type of BLOCKED_POINTER_EVENTS) {
    document.addEventListener(
      type,
      (event) => {
        const target = event.target;
        if (
          isBusy() &&
          composer.owns(target) &&
          !(target instanceof Node && button.contains(target))
        ) {
          swallow(event);
        }
      },
      true,
    );
  }
}
