import { encodeWav } from "../../core/audio/wav.ts";
import { DEEPGRAM_URL, type DeepgramOptions } from "./options.ts";
import { deepgramQuery } from "./query.ts";

const MIN_AUDIO_SECONDS = 0.25;

interface PrerecordedResponse {
  results?: { channels?: { alternatives?: { transcript?: string }[] }[] };
}

export async function transcribePrerecorded(
  options: DeepgramOptions,
  pcm: Int16Array,
): Promise<string> {
  if (pcm.length < options.sampleRate * MIN_AUDIO_SECONDS) return "";
  const endpoint = (options.url || DEEPGRAM_URL).replace(/^ws/, "http");
  const res = await fetch(`${endpoint}?${deepgramQuery(options)}`, {
    method: "POST",
    headers: { Authorization: `Token ${options.apiKey}`, "Content-Type": "audio/wav" },
    body: encodeWav(pcm, options.sampleRate),
  });
  if (!res.ok) throw new Error(`Deepgram HTTP ${res.status}`);
  const json = (await res.json()) as PrerecordedResponse;
  return (json.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "").trim();
}
