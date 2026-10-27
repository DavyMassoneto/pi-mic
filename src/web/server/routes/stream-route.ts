import type { IncomingMessage } from "node:http";
import { type RawData, WebSocket } from "ws";
import { loadConfig, realtimeKey } from "../../../config/mic-config.ts";
import { SAMPLE_RATE } from "../../../core/audio/pcm.ts";
import type { StreamMessage } from "../../../core/protocol.ts";
import { openGatedDeepgram } from "../../../providers/deepgram/gated-engine.ts";
import { DebugCapture } from "../debug-capture.ts";

export interface StreamRouteDeps {
  agentDir: string;
  env: NodeJS.ProcessEnv;
}

function requestedRate(req: IncomingMessage): number {
  return Number(new URL(req.url ?? "", "http://x").searchParams.get("rate")) || SAMPLE_RATE;
}

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  return Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
}

function toPcm(data: RawData): Int16Array {
  const buffer = toBuffer(data);
  const end = buffer.byteOffset + (buffer.length & ~1);
  return new Int16Array(buffer.buffer.slice(buffer.byteOffset, end));
}

export function handleStream(deps: StreamRouteDeps, client: WebSocket, req: IncomingMessage): void {
  const config = loadConfig(deps.agentDir);
  const rate = requestedRate(req);
  const debug = config.debug ? new DebugCapture(deps.agentDir, rate) : undefined;
  const send = (message: StreamMessage) => {
    debug?.addEvent(message);
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message));
  };
  const apiKey = realtimeKey(config, deps.env);
  if (!config.realtime || !apiKey) {
    send({ type: "error", message: "realtime is not configured; run /mic setup in pi" });
    client.close();
    return;
  }
  const engine = openGatedDeepgram({
    apiKey,
    sampleRate: rate,
    url: config.realtime.url,
    model: config.realtime.model,
    language: config.language,
    keyterms: config.keyterms,
    onUpdate: (committed, pending) => send({ type: "update", committed, pending }),
    onError: (err) => send({ type: "error", message: err.message }),
  });
  let finished = false;
  client.on("message", async (data, isBinary) => {
    if (isBinary) {
      const pcm = toPcm(data);
      debug?.addAudio(pcm);
      return engine.push(pcm);
    }
    if (String(data) !== "stop" || finished) return;
    finished = true;
    debug?.addEvent({ type: "stop" });
    try {
      send({ type: "done", text: await engine.stop() });
    } catch (err) {
      send({ type: "error", message: (err as Error).message });
    }
    client.close();
    debug?.save();
  });
  client.on("close", () => {
    if (!finished) engine.cancel();
  });
}
