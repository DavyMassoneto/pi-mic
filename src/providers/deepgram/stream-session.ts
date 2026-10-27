import WebSocket from "ws";
import { concatPcm } from "../../core/audio/pcm.ts";
import { joinParts } from "../../core/transcription/transcript.ts";
import { DEEPGRAM_URL, type DeepgramOptions } from "./options.ts";
import { transcribePrerecorded } from "./prerecorded.ts";
import { deepgramQuery } from "./query.ts";

const KEEP_ALIVE_MS = 8000;
const FINALIZE_TIMEOUT_MS = 5000;
const CLOSE_TIMEOUT_MS = 5000;

interface ResultsMessage {
  type?: string;
  is_final?: boolean;
  from_finalize?: boolean;
  channel?: { alternatives?: { transcript?: string }[] };
}

export interface DeepgramStream {
  send(pcm: Int16Array): void;
  ready(): Promise<void>;
  finish(): Promise<string>;
  cancel(): void;
}

class DeepgramStreamSession implements DeepgramStream {
  readonly #options: DeepgramOptions;
  readonly #socket: WebSocket;
  readonly #opened: Promise<void>;
  readonly #closed: Promise<void>;
  readonly #keepAlive: NodeJS.Timeout;
  readonly #finals: string[] = [];
  readonly #unsent: Uint8Array[] = [];
  readonly #recorded: Int16Array[] = [];
  #interim = "";
  #failure: Error | null = null;
  #onFinalized: (() => void) | null = null;

  constructor(options: DeepgramOptions) {
    this.#options = options;
    this.#socket = this.#connect();
    this.#opened = this.#watchOpening();
    this.#opened.catch((err) => options.onError?.(err));
    this.#closed = new Promise((resolve) => this.#socket.on("close", () => resolve()));
    this.#socket.on("message", (data, isBinary) => this.#onMessage(data, isBinary));
    this.#keepAlive = setInterval(() => this.#sendKeepAlive(), KEEP_ALIVE_MS);
  }

  send(pcm: Int16Array): void {
    this.#recorded.push(pcm.slice());
    const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength).slice();
    if (this.#socket.readyState === WebSocket.OPEN) this.#socket.send(bytes);
    else if (this.#socket.readyState === WebSocket.CONNECTING) this.#unsent.push(bytes);
  }

  ready(): Promise<void> {
    return this.#opened;
  }

  async finish(): Promise<string> {
    clearInterval(this.#keepAlive);
    if (this.#failure) throw this.#failure;
    await this.#opened;
    await this.#finalize();
    this.#socket.send(JSON.stringify({ type: "CloseStream" }));
    await this.#awaitClose();
    if (this.#interim) this.#finals.push(this.#interim);
    const streamed = this.#streamedText();
    return (await this.#secondPass()) || streamed;
  }

  cancel(): void {
    clearInterval(this.#keepAlive);
    this.#socket.terminate();
  }

  #connect(): WebSocket {
    const url = this.#options.url || DEEPGRAM_URL;
    const query = deepgramQuery(this.#options, {
      encoding: "linear16",
      sample_rate: String(this.#options.sampleRate),
      channels: "1",
      interim_results: "true",
      endpointing: "300",
    });
    return new WebSocket(`${url}?${query}`, {
      headers: { Authorization: `Token ${this.#options.apiKey}` },
    });
  }

  #watchOpening(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#socket.on("open", () => {
        for (const bytes of this.#unsent.splice(0)) this.#socket.send(bytes);
        resolve();
      });
      this.#socket.on("unexpected-response", (_req, res) => {
        this.#failure = new Error(`Deepgram HTTP ${res.statusCode}`);
        reject(this.#failure);
      });
      this.#socket.on("error", (err) => {
        this.#failure = err;
        reject(err);
      });
    });
  }

  #onMessage(data: WebSocket.RawData, isBinary: boolean): void {
    if (isBinary) return;
    const message = JSON.parse(String(data)) as ResultsMessage;
    if (message.type !== "Results") return;
    const transcript = (message.channel?.alternatives?.[0]?.transcript ?? "").trim();
    if (message.is_final) {
      this.#finals.push(transcript);
      this.#interim = "";
    } else this.#interim = transcript;
    this.#options.onUpdate(this.#streamedText(), this.#interim);
    if (message.from_finalize) this.#onFinalized?.();
  }

  #sendKeepAlive(): void {
    if (this.#socket.readyState === WebSocket.OPEN) {
      this.#socket.send(JSON.stringify({ type: "KeepAlive" }));
    }
  }

  #streamedText(): string {
    return joinParts(this.#finals);
  }

  #finalize(): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, FINALIZE_TIMEOUT_MS);
      this.#onFinalized = () => {
        clearTimeout(timer);
        resolve();
      };
      this.#socket.send(JSON.stringify({ type: "Finalize" }));
    });
  }

  async #awaitClose(): Promise<void> {
    const timer = setTimeout(() => this.#socket.terminate(), CLOSE_TIMEOUT_MS);
    await this.#closed;
    clearTimeout(timer);
  }

  async #secondPass(): Promise<string> {
    try {
      const full = await transcribePrerecorded(this.#options, concatPcm(this.#recorded));
      if (full) this.#options.onUpdate(full, "");
      return full;
    } catch (err) {
      this.#options.onError?.(err as Error);
      return "";
    }
  }
}

export function openDeepgramStream(options: DeepgramOptions): DeepgramStream {
  return new DeepgramStreamSession(options);
}
