import http from "node:http";
import { WebSocketServer } from "ws";
import { CONFIG_PATH, STREAM_PATH, TRANSCRIBE_PATH } from "../../core/protocol.ts";
import { createProxy } from "./http-proxy.ts";
import { handleConfig } from "./routes/config-route.ts";
import { handleStream } from "./routes/stream-route.ts";
import { handleTranscribe } from "./routes/transcribe-route.ts";
import { tunnelUpgrade } from "./websocket-tunnel.ts";

const MAX_STREAM_PAYLOAD = 1024 * 1024;

export interface MicServerDeps {
  target: URL;
  agentDir: string;
  env: NodeJS.ProcessEnv;
  assets: ReadonlyMap<string, Buffer>;
}

export function createMicServer(deps: MicServerDeps): http.Server {
  const proxy = createProxy(deps.target);
  const routeDeps = { agentDir: deps.agentDir, env: deps.env };
  const streams = new WebSocketServer({ noServer: true, maxPayload: MAX_STREAM_PAYLOAD });

  const server = http.createServer((req, res) => {
    const asset = req.url ? deps.assets.get(req.url) : undefined;
    if (asset) {
      res.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-cache" });
      return res.end(asset);
    }
    if (req.url === TRANSCRIBE_PATH && req.method === "POST") {
      return void handleTranscribe(routeDeps, req, res);
    }
    if (req.url === CONFIG_PATH) return handleConfig(deps.agentDir, res);
    proxy(req, res);
  });

  server.on("upgrade", (req, socket, head) => {
    if (req.url?.split("?")[0] === STREAM_PATH) {
      return streams.handleUpgrade(req, socket, head, (ws) => handleStream(routeDeps, ws, req));
    }
    tunnelUpgrade(deps.target, req, socket, head);
  });
  return server;
}
