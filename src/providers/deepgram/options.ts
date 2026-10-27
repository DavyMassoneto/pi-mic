export const DEEPGRAM_URL = "wss://api.deepgram.com/v1/listen";
export const DEEPGRAM_DEFAULT_MODEL = "nova-3";

export interface DeepgramOptions {
  apiKey: string;
  sampleRate: number;
  url?: string;
  model?: string;
  language?: string;
  keyterms?: string[];
  onUpdate: (committed: string, pending: string) => void;
  onError?: (err: Error) => void;
}
