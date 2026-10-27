// pi-mic: botão de microfone no campo de mensagem do pi-web (injetado pelo pi-mic-web).
(() => {
  if (window.__piMic) return;

  const SELECTOR = "textarea.chat-input-textarea";
  const MIMES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  let state = "idle";
  let recorder = null;
  let stream = null;
  let chunks = [];

  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "pi-mic-btn";
  Object.assign(btn.style, {
    position: "fixed",
    zIndex: "2147483000",
    width: "30px",
    height: "30px",
    borderRadius: "50%",
    border: "1px solid rgba(127,127,127,.35)",
    background: "rgba(127,127,127,.12)",
    color: "inherit",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    padding: "0",
    fontSize: "15px",
    lineHeight: "1",
  });

  const toast = document.createElement("div");
  Object.assign(toast.style, {
    position: "fixed",
    zIndex: "2147483001",
    padding: "6px 10px",
    borderRadius: "6px",
    background: "rgba(30,30,30,.92)",
    color: "#fff",
    font: "12px system-ui, sans-serif",
    display: "none",
    maxWidth: "320px",
  });

  function textarea() {
    return document.querySelector(SELECTOR);
  }

  function render() {
    btn.textContent = { idle: "🎙", rec: "⏺", busy: "…" }[state];
    btn.style.background = state === "rec" ? "#d93025" : "rgba(127,127,127,.12)";
    btn.style.color = state === "rec" ? "#fff" : "inherit";
    btn.title = {
      idle: "Voice input (Alt+M)",
      rec: "Recording — click or Alt+M to stop",
      busy: "Transcribing…",
    }[state];
  }

  function place() {
    const ta = textarea();
    if (!ta || ta.offsetParent === null) {
      btn.style.display = "none";
      return;
    }
    const r = ta.getBoundingClientRect();
    btn.style.display = "flex";
    btn.style.left = `${rightEdge(ta, r) - 36}px`;
    btn.style.top = `${r.top + Math.max(0, (r.height - 30) / 2)}px`;
  }

  /** Borda onde o botão encosta: à esquerda dos botões do campo (ex.: Enviar) na mesma linha. */
  function rightEdge(ta, r) {
    let box = ta.parentElement;
    for (let i = 0; i < 3 && box && !box.querySelector("button"); i++) box = box.parentElement;
    if (!box) return r.right;
    const lefts = [...box.querySelectorAll("button")]
      .filter((b) => b !== btn && b.offsetParent !== null)
      .map((b) => b.getBoundingClientRect())
      .filter((b) => b.top < r.bottom && b.bottom > r.top && b.left > r.left + r.width / 2)
      .map((b) => b.left);
    return Math.min(r.right, ...lefts);
  }

  function flash(msg) {
    const r = btn.getBoundingClientRect();
    toast.textContent = msg;
    toast.style.display = "block";
    toast.style.left = `${Math.max(8, r.right - 320)}px`;
    toast.style.top = `${Math.max(8, r.top - 40)}px`;
    clearTimeout(flash.t);
    flash.t = setTimeout(() => {
      toast.style.display = "none";
    }, 4000);
  }

  /** Insere no cursor do textarea de forma que o estado do React acompanhe. */
  function insert(text) {
    const ta = textarea();
    if (!ta) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    const cur = ta.value;
    const start = ta.selectionStart ?? cur.length;
    const end = ta.selectionEnd ?? cur.length;
    const before = cur.slice(0, start);
    const sep = before && !/\s$/.test(before) ? " " : "";
    setter.call(ta, before + sep + text + cur.slice(end));
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    const pos = (before + sep + text).length;
    ta.focus();
    ta.setSelectionRange(pos, pos);
    return true;
  }

  async function transcribe(blob) {
    const r = await fetch("/__pi-mic/transcribe", {
      method: "POST",
      headers: { "content-type": blob.type || "audio/webm" },
      body: blob,
    });
    const json = await r.json();
    if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`);
    return json;
  }

  async function finish() {
    const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
    state = "busy";
    render();
    try {
      const { text, noSpeech } = await transcribe(blob);
      if (noSpeech) flash("No speech detected — check the browser's microphone");
      else insert(text);
    } catch (err) {
      flash(`Transcription failed: ${err.message}`);
    } finally {
      state = "idle";
      render();
    }
  }

  async function start() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      flash("The microphone needs HTTPS or localhost (open pi-web through pi-mic-web)");
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      flash(`Microphone blocked: ${err.message}`);
      return;
    }
    const mimeType = MIMES.find((m) => window.MediaRecorder?.isTypeSupported(m));
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = finish;
    recorder.start();
    state = "rec";
    render();
  }

  function stop() {
    recorder.stop();
    for (const t of stream.getTracks()) t.stop();
  }

  function toggle() {
    if (state === "idle") start();
    else if (state === "rec") stop();
  }

  btn.addEventListener("mousedown", (e) => e.preventDefault()); // mantém o foco/cursor no textarea
  btn.addEventListener("click", toggle);
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === "KeyM") {
        e.preventDefault();
        toggle();
      }
    },
    true,
  );

  function mount() {
    document.body.append(btn, toast);
    render();
    place();
    setInterval(place, 300);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
  }

  window.__piMic = { insert, transcribe, toggle };
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
