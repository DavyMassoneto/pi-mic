import { STREAM_PATH, type StreamMessage } from "../../core/protocol.ts";
import type { EngineEvents, TranscriptionEngine } from "../../core/transcription/engine.ts";
import { combine } from "../../core/transcription/transcript.ts";

type RealtimeEvents = EngineEvents & Required<Pick<EngineEvents, "onError">>;

function streamUrl(rate: number): string {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.host}${STREAM_PATH}?rate=${rate}`;
}

export function openRealtimeEngine(
  events: RealtimeEvents,
  rate: number,
): Promise<TranscriptionEngine> {
  const socket = new WebSocket(streamUrl(rate));
  socket.binaryType = "arraybuffer";
  let lastText = "";
  let resolveDone: (text: string | null) => void = () => {};
  const done = new Promise<string | null>((resolve) => {
    resolveDone = resolve;
  });

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data) as StreamMessage;
    if (message.type === "update") {
      lastText = combine(message.committed, message.pending);
      events.onUpdate(message.committed, message.pending);
    } else if (message.type === "done") resolveDone(message.text);
    else events.onError(new Error(message.message));
  };
  socket.onclose = () => resolveDone(null);

  return new Promise((resolve, reject) => {
    socket.onopen = () =>
      resolve({
        push(pcm) {
          if (socket.readyState === WebSocket.OPEN) socket.send(pcm);
        },
        async stop() {
          if (socket.readyState === WebSocket.OPEN) socket.send("stop");
          return (await done) ?? lastText;
        },
        cancel() {
          socket.close();
        },
      });
    socket.onerror = () => reject(new Error("stream connection failed"));
  });
}
