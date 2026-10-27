import { ICONS } from "./icons.ts";
import { type ButtonState, messages } from "./messages.ts";

const FLASH_MS = 4000;
const HINT_GAP = 8;

export class MicButtonView {
  readonly button = document.createElement("button");
  readonly hint = document.createElement("div");
  #state: ButtonState = "idle";
  #flashTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.button.type = "button";
    this.button.id = "pi-mic-btn";
    this.hint.id = "pi-mic-hint";
  }

  render(state: ButtonState, send: HTMLElement | null): void {
    this.#state = state;
    this.button.dataset.state = state;
    this.button.innerHTML = ICONS[state];
    this.button.title = messages[state];
    this.button.setAttribute("aria-label", messages[state]);
    this.button.setAttribute("aria-pressed", String(state === "rec"));
    if (state !== "rec") this.button.style.boxShadow = "";
    if (send) {
      send.style.opacity = state === "idle" ? "" : "0.4";
      send.style.pointerEvents = state === "idle" ? "" : "none";
    }
    if (state === "idle") this.hint.style.display = "none";
    else this.#showHint(messages[state]);
  }

  flash(message: string): void {
    this.#showHint(message);
    clearTimeout(this.#flashTimer);
    this.#flashTimer = setTimeout(() => {
      if (this.#state === "idle") this.hint.style.display = "none";
    }, FLASH_MS);
  }

  glow(level: number): void {
    this.button.style.boxShadow = `0 0 0 ${2 + Math.round(level * 8)}px rgba(217,48,37,.35)`;
  }

  #showHint(text: string): void {
    this.hint.textContent = text;
    this.hint.style.display = "block";
    const rect = this.button.getBoundingClientRect();
    this.hint.style.left = `${Math.max(HINT_GAP, rect.right - this.hint.offsetWidth)}px`;
    this.hint.style.top = `${Math.max(HINT_GAP, rect.top - this.hint.offsetHeight - HINT_GAP)}px`;
  }
}
