export interface TranscriptionEngine {
  push(pcm: Int16Array): void;
  stop(): Promise<string>;
  cancel(): void;
}

export interface EngineEvents {
  onUpdate: (committed: string, pending: string) => void;
  onLevel?: (level: number) => void;
  onError?: (err: Error) => void;
}

export interface SpeechResult {
  text: string;
  noSpeech?: boolean;
}
