import { Composer } from "./composer.ts";
import { Dictation } from "./dictation.ts";
import { installInputGuard } from "./input-guard.ts";
import { MicButtonView } from "./mic-button-view.ts";
import { installStyles } from "./styles.ts";

interface PiMicApi {
  toggle: () => void;
  cancel: () => void;
  state: () => string;
}

declare global {
  interface Window {
    __piMic?: PiMicApi;
  }
}

function boot(): void {
  installStyles();
  const view = new MicButtonView();
  const composer = new Composer(view.button);
  const dictation = new Dictation(composer, view);

  composer.watch();
  installInputGuard({
    composer,
    button: view.button,
    isBusy: () => dictation.isBusy(),
    onToggle: () => dictation.toggle(),
    onCancel: () => dictation.cancel(),
  });

  view.button.addEventListener("mousedown", (event) => event.preventDefault());
  view.button.addEventListener("click", (event) => {
    event.stopPropagation();
    dictation.toggle();
  });

  window.__piMic = {
    toggle: () => dictation.toggle(),
    cancel: () => dictation.cancel(),
    state: () => dictation.state(),
  };
  document.body.append(view.hint);
  dictation.render();
  composer.mount();
}

if (!window.__piMic) boot();
