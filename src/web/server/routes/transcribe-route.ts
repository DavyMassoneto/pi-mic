import type { IncomingMessage, ServerResponse } from "node:http";
import { loadConfig } from "../../../config/mic-config.ts";
import {
  TranscriptionHttpError,
  transcribe,
} from "../../../providers/openai-compatible/transcribe.ts";
import { sendJson } from "../json-response.ts";
import { resolveProviderEndpoint } from "../provider-endpoint.ts";

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

const FILE_EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
};

export interface TranscribeRouteDeps {
  agentDir: string;
  env: NodeJS.ProcessEnv;
  maxAudioBytes?: number;
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) return undefined;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function mimeType(req: IncomingMessage): string {
  return (req.headers["content-type"] || "audio/webm").split(";")[0].trim();
}

export async function handleTranscribe(
  deps: TranscribeRouteDeps,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const audio = await readBody(req, deps.maxAudioBytes ?? MAX_AUDIO_BYTES);
  if (!audio) return sendJson(res, 413, { error: "audio too large" });
  try {
    const config = loadConfig(deps.agentDir);
    const endpoint = resolveProviderEndpoint(deps.agentDir, config, deps.env);
    const type = mimeType(req);
    const result = await transcribe({
      ...endpoint,
      audio,
      mimeType: type,
      fileName: `speech.${FILE_EXTENSIONS[type] || "webm"}`,
    });
    sendJson(res, 200, result);
  } catch (err) {
    const status = err instanceof TranscriptionHttpError ? 502 : 500;
    sendJson(res, status, { error: (err as Error).message });
  }
}
