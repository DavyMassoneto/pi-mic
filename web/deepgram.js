// Transcrição em tempo real pelo streaming do Deepgram (WebSocket /v1/listen). Só no Node:
// a chave fica no CLI ou no pi-mic-web, nunca no navegador.
import WebSocket from "ws";

export const DEEPGRAM_URL = "wss://api.deepgram.com/v1/listen";

/**
 * @typedef {object} RealtimeOptions
 * @property {string} apiKey
 * @property {string} [url]
 * @property {string} [model]
 * @property {string} [language]
 * @property {(committed: string, pending: string) => void} onUpdate
 * @property {(err: Error) => void} [onError]
 */

/**
 * Abre a sessão. Mande PCM 16 kHz mono int16 com send(); finish() fecha o fluxo, espera os
 * resultados finais e devolve o texto completo.
 * @param {RealtimeOptions} opts
 */
export function openRealtime(opts) {
  const q = new URLSearchParams({
    model: opts.model || "nova-3",
    encoding: "linear16",
    sample_rate: "16000",
    channels: "1",
    interim_results: "true",
    smart_format: "true",
    punctuate: "true",
    endpointing: "300",
  });
  if (opts.language) q.set("language", opts.language);
  const ws = new WebSocket(`${opts.url || DEEPGRAM_URL}?${q}`, {
    headers: { Authorization: `Token ${opts.apiKey}` },
  });

  /** @type {string[]} */
  const finals = [];
  let interim = "";
  const text = () => finals.filter(Boolean).join(" ");
  /** @type {Uint8Array[]} */
  const queue = [];
  let failed = /** @type {Error | null} */ (null);

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
  });

  const keepAlive = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "KeepAlive" }));
  }, 8000);

  return {
    /** @param {Int16Array} pcm */
    send(pcm) {
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
      ws.send(JSON.stringify({ type: "CloseStream" }));
      const timeout = setTimeout(() => ws.terminate(), 8000);
      await closed;
      clearTimeout(timeout);
      if (interim) finals.push(interim);
      return text();
    },
    cancel() {
      clearInterval(keepAlive);
      ws.terminate();
    },
  };
}
