import type http from "node:http";
import type { Duplex } from "node:stream";
import {
  injectClientIntoHtml,
  isDocumentRequest,
  stripEncodingForDocument,
} from "./html-injection.ts";
import type { MicHandlers } from "./mic-handlers.ts";

const ATTACHED_MARKER = Symbol.for("pi-mic/pi-web-host");

type RequestListener = (
  this: http.Server,
  req: http.IncomingMessage,
  res: http.ServerResponse,
) => void;
type UpgradeListener = (
  this: http.Server,
  req: http.IncomingMessage,
  socket: Duplex,
  head: Buffer,
) => void;

export function isAttached(server: http.Server): boolean {
  return (server as unknown as Record<symbol, unknown>)[ATTACHED_MARKER] === true;
}

export function attachMicHandlers(server: http.Server, handlers: MicHandlers): boolean {
  if (isAttached(server)) return false;
  (server as unknown as Record<symbol, unknown>)[ATTACHED_MARKER] = true;

  const requestListeners = server.listeners("request") as RequestListener[];
  const upgradeListeners = server.listeners("upgrade") as UpgradeListener[];
  server.removeAllListeners("request");
  server.removeAllListeners("upgrade");

  server.on("request", function (this: http.Server, req, res) {
    if (handlers.handleRequest(req, res)) return;
    if (isDocumentRequest(req)) {
      stripEncodingForDocument(req);
      injectClientIntoHtml(res);
    }
    for (const listener of requestListeners) listener.call(this, req, res);
  });

  server.on("upgrade", function (this: http.Server, req, socket, head) {
    if (handlers.handleUpgrade(req, socket, head)) return;
    for (const listener of upgradeListeners) listener.call(this, req, socket, head);
  });
  return true;
}
