export interface TranscribeRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  language?: string;
  audio: Uint8Array;
  mimeType: string;
  fileName: string;
  signal?: AbortSignal;
}

export interface TranscribeResult {
  text: string;
  noSpeech: boolean;
}

/** Junta a transcrição ao texto já digitado, com um espaço entre os dois quando preciso. */
export function appendText(current: string, text: string): string {
  const sep = current === "" || /\s$/.test(current) ? "" : " ";
  return current + sep + text;
}

/** WAV PCM 16 kHz mono 16 bits em silêncio, para o /mic check. */
export function silentWav(ms: number): Uint8Array {
  const dataLen = Math.round((16000 * ms) / 1000) * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(16000, 24);
  buf.writeUInt32LE(32000, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataLen, 40);
  return buf;
}

/** POST OpenAI-compatível em {baseUrl}/audio/transcriptions (OmniRoute → Deepgram). */
export async function transcribe(req: TranscribeRequest): Promise<TranscribeResult> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(req.audio)], { type: req.mimeType }), req.fileName);
  form.append("model", req.model);
  if (req.language) form.append("language", req.language);

  const url = `${req.baseUrl.replace(/\/+$/, "")}/audio/transcriptions`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${req.apiKey}` },
    body: form,
    signal: req.signal,
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  const json = JSON.parse(body) as { text?: string; noSpeechDetected?: boolean };
  const text = (json.text ?? "").trim();
  return { text, noSpeech: json.noSpeechDetected === true || text === "" };
}
