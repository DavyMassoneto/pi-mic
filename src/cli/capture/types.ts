export type PcmListener = (pcm: Int16Array) => void;

export interface Capture {
  rate: number;
  stop(): Promise<void>;
  cancel(): void;
}
