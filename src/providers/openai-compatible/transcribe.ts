export interface Endpoint {
  baseUrl: string;
  apiKey: string;
}

export interface TranscribeRequest extends Endpoint {
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

const ERROR_BODY_LIMIT = 300;

export class TranscriptionHttpError extends Error {
  readonly status: number;

  constructor(status: number, body: string) {
    super(`HTTP ${status}: ${body.slice(0, ERROR_BODY_LIMIT)}`);
    this.status = status;
  }
}

function buildForm(req: TranscribeRequest): FormData {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(req.audio)], { type: req.mimeType }), req.fileName);
  form.append("model", req.model);
  if (req.language) form.append("language", req.language);
  return form;
}

export async function transcribe(req: TranscribeRequest): Promise<TranscribeResult> {
  const res = await fetch(`${req.baseUrl.replace(/\/+$/, "")}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${req.apiKey}` },
    body: buildForm(req),
    signal: req.signal,
  });
  const body = await res.text();
  if (!res.ok) throw new TranscriptionHttpError(res.status, body);
  const json = JSON.parse(body) as { text?: string; noSpeechDetected?: boolean };
  const text = (json.text ?? "").trim();
  return { text, noSpeech: json.noSpeechDetected === true || text === "" };
}
