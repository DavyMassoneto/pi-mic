import { floatToInt16 } from "../../core/audio/pcm.ts";

const CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
};

const WORKLET_NAME = "pi-mic";
const WORKLET_SOURCE = `registerProcessor("${WORKLET_NAME}", class extends AudioWorkletProcessor {
    process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
  });`;
const MIN_SAMPLES_PER_DRAIN = 1600;

export interface Microphone {
  sampleRate: number;
  listen(onPcm: (pcm: Int16Array) => void): void;
  release(): void;
}

export function requestMicrophoneStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia(CONSTRAINTS);
}

async function loadWorklet(context: AudioContext): Promise<void> {
  const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "text/javascript" }));
  await context.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
}

function concatFloats(chunks: readonly Float32Array[], total: number): Float32Array {
  const all = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }
  return all;
}

export async function openMicrophone(stream: MediaStream): Promise<Microphone> {
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  await loadWorklet(context);
  const node = new AudioWorkletNode(context, WORKLET_NAME);
  let onPcm: (pcm: Int16Array) => void = () => {};
  let chunks: Float32Array[] = [];
  let buffered = 0;

  const drain = () => {
    if (!buffered) return;
    const all = concatFloats(chunks, buffered);
    chunks = [];
    buffered = 0;
    onPcm(floatToInt16(all));
  };

  return {
    sampleRate: context.sampleRate,
    listen(listener) {
      onPcm = listener;
      node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        chunks.push(event.data);
        buffered += event.data.length;
        if (buffered >= MIN_SAMPLES_PER_DRAIN) drain();
      };
      source.connect(node);
    },
    release() {
      drain();
      node.port.onmessage = null;
      source.disconnect();
      for (const track of stream.getTracks()) track.stop();
      context.close();
    },
  };
}
