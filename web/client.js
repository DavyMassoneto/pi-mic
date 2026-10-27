// pi-mic: entrada por voz no pi-web (injetado pelo pi-mic-web, sem alterar o pi-web).
// O botão entra na mesma linha do Enviar; durante a gravação o campo fica travado e o texto
// aparece ao vivo, trecho a trecho, conforme a fala.
import { floatToInt16, LiveTranscriber } from "./live-core.js";

if (!window.__piMic) {
  const SELECTOR = "textarea.chat-input-textarea";
  const TAIL_MS = 500;
  const pt = (navigator.language || "").toLowerCase().startsWith("pt");
  const T = pt
    ? {
        idle: "Falar (Alt+M)",
        rec: "Ouvindo — Alt+M ou clique para parar · Esc cancela",
        busy: "Finalizando a transcrição…",
        insecure: "O microfone exige HTTPS ou localhost",
        blocked: "Microfone bloqueado",
        failed: "Falha na transcrição",
        nothing: "Nenhuma fala detectada",
      }
    : {
        idle: "Speak (Alt+M)",
        rec: "Listening — Alt+M or click to stop · Esc cancels",
        busy: "Finishing transcription…",
        insecure: "The microphone needs HTTPS or localhost",
        blocked: "Microphone blocked",
        failed: "Transcription failed",
        nothing: "No speech detected",
      };
  const ICON = {
    idle: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1"/><path d="M12 18v4"/></svg>',
    rec: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor"/></svg>',
    busy: '<svg class="pi-mic-spin" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.2-8.56"/></svg>',
  };

  const style = document.createElement("style");
  style.textContent = `
    #pi-mic-btn { display:inline-flex; align-items:center; justify-content:center; flex:none;
      box-sizing:border-box; padding:0; margin:0 6px 0 0; cursor:pointer; color:inherit;
      background:transparent; border:1px solid rgba(127,127,127,.35); transition:box-shadow .08s; }
    #pi-mic-btn:hover { background:rgba(127,127,127,.15); }
    #pi-mic-btn[data-state="rec"] { background:#d93025; border-color:#d93025; color:#fff; }
    #pi-mic-btn[data-state="busy"] { cursor:progress; }
    #pi-mic-btn svg { display:block; }
    .pi-mic-spin { animation: pi-mic-spin .8s linear infinite; }
    @keyframes pi-mic-spin { to { transform: rotate(360deg); } }
    #pi-mic-hint { position:fixed; z-index:2147483001; padding:4px 8px; border-radius:6px;
      background:rgba(30,30,30,.92); color:#fff; font:12px system-ui,sans-serif; pointer-events:none;
      display:none; white-space:nowrap; }
    textarea.pi-mic-locked { caret-color:transparent; }
  `;
  document.head.append(style);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "pi-mic-btn";
  const hint = document.createElement("div");
  hint.id = "pi-mic-hint";

  let state = "idle";
  let send = null;
  let session = null;

  const textarea = () => document.querySelector(SELECTOR);
  const setValue = (ta, v) => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(ta, v);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  };

  /** O Enviar: botão do campo, na metade direita, na mesma faixa vertical do textarea. */
  function findSend(ta) {
    const r = ta.getBoundingClientRect();
    let box = ta.parentElement;
    for (let i = 0; i < 4 && box; i++, box = box.parentElement) {
      const cands = [...box.querySelectorAll("button")].filter((b) => {
        if (b === btn || b.offsetParent === null) return false;
        const br = b.getBoundingClientRect();
        return br.top < r.bottom + 8 && br.bottom > r.top - 8 && br.left > r.left + r.width / 2;
      });
      if (cands.length)
        return cands.reduce((a, b) =>
          a.getBoundingClientRect().left < b.getBoundingClientRect().left ? a : b,
        );
    }
    return null;
  }

  function composer() {
    const ta = textarea();
    if (!ta || !send) return null;
    let box = ta.parentElement;
    while (box && !box.contains(send)) box = box.parentElement;
    return box;
  }

  function render() {
    btn.dataset.state = state;
    btn.innerHTML = ICON[state];
    btn.title = T[state];
    btn.setAttribute("aria-label", T[state]);
    btn.setAttribute("aria-pressed", String(state === "rec"));
    if (state !== "rec") btn.style.boxShadow = "";
    if (send) {
      send.style.opacity = state === "idle" ? "" : "0.4";
      send.style.pointerEvents = state === "idle" ? "" : "none";
    }
    if (state === "idle") {
      hint.style.display = "none";
    } else {
      hint.textContent = T[state];
      hint.style.display = "block";
      placeHint();
    }
  }

  function placeHint() {
    const r = btn.getBoundingClientRect();
    hint.style.left = `${Math.max(8, r.right - hint.offsetWidth)}px`;
    hint.style.top = `${Math.max(8, r.top - hint.offsetHeight - 8)}px`;
  }

  function flash(msg) {
    hint.textContent = msg;
    hint.style.display = "block";
    placeHint();
    clearTimeout(flash.t);
    flash.t = setTimeout(() => {
      if (state === "idle") hint.style.display = "none";
    }, 4000);
  }

  /** Mantém o botão logo antes do Enviar, com a mesma altura e o mesmo arredondamento. */
  function mount() {
    const ta = textarea();
    if (!ta) return;
    if (!send?.isConnected) send = findSend(ta);
    if (!send) return;
    if (btn.nextElementSibling !== send) send.parentElement.insertBefore(btn, send);
    const cs = getComputedStyle(send);
    const h = send.getBoundingClientRect().height;
    btn.style.height = `${h}px`;
    btn.style.width = `${h}px`;
    btn.style.borderRadius = cs.borderRadius;
    btn.style.alignSelf = cs.alignSelf;
  }

  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      mount();
    });
  }).observe(document.body, { childList: true, subtree: true });

  function lock(on) {
    const ta = textarea();
    if (!ta) return;
    ta.readOnly = on;
    ta.classList.toggle("pi-mic-locked", on);
  }

  const busy = () => state !== "idle";
  const inComposer = (t) => t instanceof Node && (t === textarea() || composer()?.contains(t));

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === "KeyM") {
        e.preventDefault();
        e.stopPropagation();
        toggle();
        return;
      }
      if (!busy()) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancel();
        return;
      }
      if (inComposer(e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );
  for (const type of ["beforeinput", "paste", "drop", "cut"]) {
    document.addEventListener(
      type,
      (e) => {
        if (busy() && inComposer(e.target)) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true,
    );
  }
  for (const type of ["click", "mousedown", "pointerdown"]) {
    document.addEventListener(
      type,
      (e) => {
        if (busy() && inComposer(e.target) && !btn.contains(e.target)) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true,
    );
  }

  async function transcribeWav(wav) {
    const r = await fetch("/__pi-mic/transcribe", {
      method: "POST",
      headers: { "content-type": "audio/wav" },
      body: wav,
    });
    const json = await r.json();
    if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`);
    return json;
  }

  const WORKLET = `registerProcessor("pi-mic", class extends AudioWorkletProcessor {
    process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
  });`;

  /** Tempo real: o pi-mic-web repassa ao streaming do Deepgram (a chave fica no servidor). */
  function realtimeEngine({ onUpdate, onError }, rate) {
    const ws = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/__pi-mic/stream?rate=${rate}`,
    );
    ws.binaryType = "arraybuffer";
    let last = "";
    let resolveDone;
    const done = new Promise((r) => {
      resolveDone = r;
    });
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.type === "update") {
        last = [m.committed, m.pending].filter(Boolean).join(" ");
        onUpdate(m.committed, m.pending);
      } else if (m.type === "done") resolveDone(m.text);
      else if (m.type === "error") onError(new Error(m.message));
    };
    ws.onclose = () => resolveDone(null);
    return new Promise((resolve, reject) => {
      ws.onopen = () =>
        resolve({
          push(pcm) {
            if (ws.readyState === WebSocket.OPEN) ws.send(pcm);
          },
          async stop() {
            if (ws.readyState === WebSocket.OPEN) ws.send("stop");
            return (await done) ?? last;
          },
          cancel() {
            ws.close();
          },
        });
      ws.onerror = () => reject(new Error("stream connection failed"));
    });
  }

  async function start() {
    const ta = textarea();
    if (!ta) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return flash(T.insecure);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      return flash(`${T.blocked}: ${err.message}`);
    }
    // Taxa nativa do microfone: o áudio segue sem reamostrar até o reconhecimento.
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const node = new AudioWorkletNode(ctx, "pi-mic");

    const value = ta.value;
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const compose = (text) => {
      const pre = before && text && !/\s$/.test(before) ? " " : "";
      const post = after && text && !/^\s/.test(after) ? " " : "";
      return { value: before + pre + text + post + after, caret: (before + pre + text).length };
    };

    const events = {
      onUpdate: (committed, pending) => {
        const t = textarea();
        if (t) setValue(t, compose([committed, pending].filter(Boolean).join(" ")).value);
      },
      onError: (err) => flash(`${T.failed}: ${err.message}`),
    };
    let live;
    try {
      const cfg = await (await fetch("/__pi-mic/config")).json();
      live = cfg.realtime
        ? await realtimeEngine(events, ctx.sampleRate)
        : new LiveTranscriber({
            interimEveryMs: 600,
            sampleRate: ctx.sampleRate,
            transcribe: transcribeWav,
            ...events,
          });
    } catch (err) {
      for (const t of stream.getTracks()) t.stop();
      ctx.close();
      return flash(`${T.failed}: ${err.message}`);
    }

    let buf = [];
    let len = 0;
    const drain = () => {
      if (!len) return;
      const all = new Float32Array(len);
      let o = 0;
      for (const b of buf) {
        all.set(b, o);
        o += b.length;
      }
      buf = [];
      len = 0;
      const pcm = floatToInt16(all);
      live.push(pcm);
      if (state === "rec") {
        let sum = 0;
        for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
        const level = Math.min(1, Math.sqrt(sum / (pcm.length || 1)) / 6000);
        btn.style.boxShadow = `0 0 0 ${2 + Math.round(level * 8)}px rgba(217,48,37,.35)`;
      }
    };
    node.port.onmessage = (e) => {
      buf.push(e.data);
      len += e.data.length;
      if (len >= 1600) drain();
    };
    source.connect(node);

    const release = () => {
      drain();
      node.port.onmessage = null;
      source.disconnect();
      for (const t of stream.getTracks()) t.stop();
      ctx.close();
    };
    session = { live, release, compose, original: value };
    lock(true);
    state = "rec";
    render();
  }

  async function stop() {
    const s = session;
    state = "busy";
    render();
    // A última sílaba costuma sair junto com o clique: grava mais um pouco antes de fechar.
    await new Promise((r) => setTimeout(r, TAIL_MS));
    s.release();
    const text = await s.live.stop();
    finish(s, text);
  }

  function cancel() {
    const s = session;
    if (!s) return;
    s.live.cancel();
    s.release();
    const ta = textarea();
    if (ta) setValue(ta, s.original);
    finish(s, null);
  }

  function finish(s, text) {
    if (session !== s) return;
    session = null;
    lock(false);
    state = "idle";
    render();
    const ta = textarea();
    if (!ta) return;
    if (text !== null) {
      const { value, caret } = s.compose(text);
      setValue(ta, value);
      ta.focus();
      ta.setSelectionRange(caret, caret);
      if (!text) flash(T.nothing);
    } else ta.focus();
  }

  function toggle() {
    if (state === "idle") start();
    else if (state === "rec") stop();
  }

  btn.addEventListener("mousedown", (e) => e.preventDefault());
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle();
  });

  window.__piMic = { toggle, cancel, state: () => state };
  document.body.append(hint);
  render();
  mount();
}
