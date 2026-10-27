export const MIC_PREFIX = "/__pi-mic";
export const TRANSCRIBE_PATH = `${MIC_PREFIX}/transcribe`;
export const CONFIG_PATH = `${MIC_PREFIX}/config`;
export const STREAM_PATH = `${MIC_PREFIX}/stream`;
export const ASSET_PREFIX = `${MIC_PREFIX}/assets`;
export const CLIENT_ENTRY_PATH = `${ASSET_PREFIX}/web/client/main.js`;

export interface ClientConfig {
  realtime: boolean;
}

export type StreamMessage =
  | { type: "update"; committed: string; pending: string }
  | { type: "done"; text: string }
  | { type: "error"; message: string };
