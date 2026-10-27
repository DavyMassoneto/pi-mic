// Transcrição pelo Deepgram em duas passadas. Só no Node: a chave fica no CLI ou no pi-mic-web.
// 1) Streaming (WebSocket /v1/listen): texto ao vivo enquanto se fala.
// 2) Ao parar: Finalize (espera a resposta from_finalize), CloseStream, e a gravação inteira vai
//    ao /v1/listen de áudio gravado, que vê a frase toda; esse texto substitui o do streaming.
import WebSocket from "ws";
import { encodeWav } from "./live-core.js";

export const DEEPGRAM_URL = "wss://api.deepgram.com/v1/listen";

/**
 * @typedef {object} RealtimeOptions
 * @property {string} apiKey
 * @property {number} sampleRate taxa do PCM enviado (a nativa do microfone)
 * @property {string} [url]
 * @property {string} [model]
 * @property {string} [language]
 * @property {string[]} [keyterms] termos para o modelo priorizar (nomes de projeto, jargão)
 * @property {(committed: string, pending: string) => void} onUpdate
 * @property {(err: Error) => void} [onError]
 */

/** @param {RealtimeOptions} opts @param {Record<string, string>} extra */
function query(opts, extra) {
  const q = new URLSearchParams({
    model: opts.model || "nova-3",
    smart_format: "true",
    punctuate: "true",
    ...extra,
  });
  if (opts.language) q.set("language", opts.language);
  for (const t of opts.keyterms ?? []) q.append("keyterm", t);
  return q;
}

/**
 * Abre a sessão. Mande PCM mono int16 na taxa `sampleRate` com send(); finish() devolve o texto
 * final (da segunda passada quando ela funciona, senão o do streaming).
 * @param {RealtimeOptions} opts
 */
export function openRealtime(opts) {
  const url = opts.url || DEEPGRAM_URL;
  const ws = new WebSocket(
    `${url}?${query(opts, {
      encoding: "linear16",
      sample_rate: String(opts.sampleRate),
      channels: "1",
      interim_results: "true",
      endpointing: "300",
    })}`,
    { headers: { Authorization: `Token ${opts.apiKey}` } },
  );

  /** @type {string[]} */
  const finals = [];
  let interim = "";
  const text = () => finals.filter(Boolean).join(" ");
  /** @type {Uint8Array[]} */
  const queue = [];
  /** @type {Int16Array[]} */
  const recorded = [];
  let failed = /** @type {Error | null} */ (null);
  /** @type {(() => void) | null} */
  let onFinalized = null;

  const opened = new Promise((resolve, reject) => {
    ws.on("open", () => {
      for (const b of queue.splice(0)) ws.send(b);
      resolve(undefined);
    });
    ws.on("unexpected-response", (_req, res) => {
      failed = new Error(`Deepgram HTTP ${res.statusCode}`);
      reject(failed);
    });
    ws.on("error", (err) => {
      failed = err;
      reject(err);
    });
  });
  opened.catch((err) => opts.onError?.(err));
  const closed = new Promise((resolve) => ws.on("close", resolve));

  ws.on("message", (data, isBinary) => {
    if (isBinary) return;
    const msg = JSON.parse(String(data));
    if (msg.type !== "Results") return;
    const t = (msg.channel?.alternatives?.[0]?.transcript ?? "").trim();
    if (msg.is_final) {
      finals.push(t);
      interim = "";
    } else interim = t;
    opts.onUpdate(text(), interim);
    if (msg.from_finalize) onFinalized?.();
  });

  const keepAlive = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "KeepAlive" }));
  }, 8000);

  /** Segunda passada: a gravação inteira no endpoint de áudio gravado. */
  async function prerecorded() {
    const total = recorded.reduce((n, p) => n + p.length, 0);
    if (total < opts.sampleRate / 4) return "";
    const pcm = new Int16Array(total);
    let o = 0;
    for (const p of recorded) {
      pcm.set(p, o);
      o += p.length;
    }
    const rest = url.replace(/^ws/, "http");
    const res = await fetch(`${rest}?${query(opts, {})}`, {
      method: "POST",
      headers: { Authorization: `Token ${opts.apiKey}`, "Content-Type": "audio/wav" },
      body: encodeWav(pcm, opts.sampleRate),
    });
    if (!res.ok) throw new Error(`Deepgram HTTP ${res.status}`);
    const json = await res.json();
    return (json.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "").trim();
  }

  return {
    /** @param {Int16Array} pcm */
    send(pcm) {
      recorded.push(pcm.slice());
      const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength).slice();
      if (ws.readyState === WebSocket.OPEN) ws.send(bytes);
      else if (ws.readyState === WebSocket.CONNECTING) queue.push(bytes);
    },
    /** Espera a conexão (para erros de chave/endereço aparecerem logo). */
    ready: () => opened,
    async finish() {
      clearInterval(keepAlive);
      if (failed) throw failed;
      await opened;
      // Finalize descarrega o áudio pendente; a resposta vem marcada com from_finalize.
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 5000);
        onFinalized = () => {
          clearTimeout(timer);
          resolve(undefined);
        };
        ws.send(JSON.stringify({ type: "Finalize" }));
      });
      ws.send(JSON.stringify({ type: "CloseStream" }));
      const timeout = setTimeout(() => ws.terminate(), 5000);
      await closed;
      clearTimeout(timeout);
      if (interim) finals.push(interim);
      const streamed = text();
      try {
        const full = await prerecorded();
        if (full) {
          opts.onUpdate(full, "");
          return full;
        }
      } catch (err) {
        opts.onError?.(/** @type {Error} */ (err));
      }
      return streamed;
    },
    cancel() {
      clearInterval(keepAlive);
      ws.terminate();
    },
  };
}
