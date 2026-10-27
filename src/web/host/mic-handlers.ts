import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer } from "ws";
import { CONFIG_PATH, STREAM_PATH, TRANSCRIBE_PATH } from "../../core/protocol.ts";
import { handleConfig } from "../server/routes/config-route.ts";
import { handleStream } from "../server/routes/stream-route.ts";
import { handleTranscribe } from "../server/routes/transcribe-route.ts";

const MAX_STREAM_PAYLOAD = 1024 * 1024;

export interface MicHandlerDeps {
  agentDir: string;
  env: NodeJS.ProcessEnv;
  assets: ReadonlyMap<string, Buffer>;
}

export interface MicHandlers {
  handleRequest(req: IncomingMessage, res: ServerResponse): boolean;
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean;
}

export function createMicHandlers(deps: MicHandlerDeps): MicHandlers {
  const routeDeps = { agentDir: deps.agentDir, env: deps.env };
  const streams = new WebSocketServer({ noServer: true, maxPayload: MAX_STREAM_PAYLOAD });

  return {
    handleRequest(req, res) {
      const asset = req.url ? deps.assets.get(req.url) : undefined;
      if (asset) {
        res.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-cache" });
        res.end(asset);
        return true;
      }
      if (req.url === TRANSCRIBE_PATH && req.method === "POST") {
        void handleTranscribe(routeDeps, req, res);
        return true;
      }
      if (req.url === CONFIG_PATH) {
        handleConfig(deps.agentDir, res);
        return true;
      }
      return false;
    },
    handleUpgrade(req, socket, head) {
      if (req.url?.split("?")[0] !== STREAM_PATH) return false;
      streams.handleUpgrade(req, socket, head, (ws) => handleStream(routeDeps, ws, req));
      return true;
    },
  };
}
