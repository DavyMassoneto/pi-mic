const TEXTAREA_SELECTOR = "textarea.chat-input-textarea";
const SEARCH_DEPTH = 4;
const VERTICAL_SLACK = 8;

export function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function leftEdge(element: Element): number {
  return element.getBoundingClientRect().left;
}

export class Composer {
  readonly #button: HTMLElement;
  #send: HTMLElement | null = null;
  #mountQueued = false;

  constructor(button: HTMLElement) {
    this.#button = button;
  }

  textarea(): HTMLTextAreaElement | null {
    return document.querySelector<HTMLTextAreaElement>(TEXTAREA_SELECTOR);
  }

  send(): HTMLElement | null {
    return this.#send;
  }

  owns(target: EventTarget | null): boolean {
    return (
      target instanceof Node && (target === this.textarea() || !!this.#box()?.contains(target))
    );
  }

  lock(on: boolean): void {
    const textarea = this.textarea();
    if (!textarea) return;
    textarea.readOnly = on;
    textarea.classList.toggle("pi-mic-locked", on);
  }

  watch(): void {
    new MutationObserver(() => this.#queueMount()).observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  mount(): void {
    const textarea = this.textarea();
    if (!textarea) return;
    if (!this.#send?.isConnected) this.#send = this.#findSend(textarea);
    const send = this.#send;
    if (!send) return;
    if (this.#button.nextElementSibling !== send)
      send.parentElement?.insertBefore(this.#button, send);
    const style = getComputedStyle(send);
    const height = send.getBoundingClientRect().height;
    this.#button.style.height = `${height}px`;
    this.#button.style.width = `${height}px`;
    this.#button.style.borderRadius = style.borderRadius;
    this.#button.style.alignSelf = style.alignSelf;
  }

  #queueMount(): void {
    if (this.#mountQueued) return;
    this.#mountQueued = true;
    requestAnimationFrame(() => {
      this.#mountQueued = false;
      this.mount();
    });
  }

  #box(): HTMLElement | null {
    const textarea = this.textarea();
    if (!textarea || !this.#send) return null;
    let box = textarea.parentElement;
    while (box && !box.contains(this.#send)) box = box.parentElement;
    return box;
  }

  #findSend(textarea: HTMLTextAreaElement): HTMLElement | null {
    const area = textarea.getBoundingClientRect();
    let box = textarea.parentElement;
    for (let depth = 0; depth < SEARCH_DEPTH && box; depth++, box = box.parentElement) {
      const candidates = [...box.querySelectorAll("button")].filter((candidate) =>
        this.#isSendCandidate(candidate, area),
      );
      if (candidates.length) {
        return candidates.reduce((a, b) => (leftEdge(a) < leftEdge(b) ? a : b));
      }
    }
    return null;
  }

  #isSendCandidate(candidate: HTMLButtonElement, area: DOMRect): boolean {
    if (candidate === this.#button || candidate.offsetParent === null) return false;
    const rect = candidate.getBoundingClientRect();
    return (
      rect.top < area.bottom + VERTICAL_SLACK &&
      rect.bottom > area.top - VERTICAL_SLACK &&
      rect.left > area.left + area.width / 2
    );
  }
}
