import { type ClientConfig, CONFIG_PATH, TRANSCRIBE_PATH } from "../../core/protocol.ts";
import type { SpeechResult } from "../../core/transcription/engine.ts";

interface ErrorBody {
  error?: string;
}

export async function fetchClientConfig(): Promise<ClientConfig> {
  return (await (await fetch(CONFIG_PATH)).json()) as ClientConfig;
}

export async function transcribeWav(wav: Uint8Array<ArrayBuffer>): Promise<SpeechResult> {
  const res = await fetch(TRANSCRIBE_PATH, {
    method: "POST",
    headers: { "content-type": "audio/wav" },
    body: wav,
  });
  const json = (await res.json()) as SpeechResult & ErrorBody;
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}
