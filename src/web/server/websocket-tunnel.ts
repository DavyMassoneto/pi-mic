import type { IncomingMessage } from "node:http";
import net from "node:net";
import type { Duplex } from "node:stream";
import { upstreamHeaders } from "./upstream-headers.ts";

function requestHead(req: IncomingMessage, target: URL): string {
  const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
  for (const [name, value] of Object.entries(upstreamHeaders(req.headers, target))) {
    for (const item of Array.isArray(value) ? value : [value]) lines.push(`${name}: ${item}`);
  }
  return `${lines.join("\r\n")}\r\n\r\n`;
}

export function tunnelUpgrade(target: URL, req: IncomingMessage, socket: Duplex, head: Buffer) {
  const upstream = net.connect(Number(target.port), target.hostname, () => {
    upstream.write(requestHead(req, target));
    upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
}
