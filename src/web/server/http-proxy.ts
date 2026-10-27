import http from "node:http";
import { CLIENT_ENTRY_PATH } from "../../core/protocol.ts";
import { HeadInjector } from "./head-injector.ts";
import { upstreamHeaders } from "./upstream-headers.ts";

const CLIENT_TAG = Buffer.from(`<script type="module" src="${CLIENT_ENTRY_PATH}"></script>`);

function relayResponse(upstream: http.IncomingMessage, res: http.ServerResponse): void {
  const headers = { ...upstream.headers };
  const isHtml = (headers["content-type"] || "").startsWith("text/html");
  if (!isHtml) {
    res.writeHead(upstream.statusCode ?? 502, headers);
    upstream.pipe(res);
    return;
  }
  delete headers["content-length"];
  res.writeHead(upstream.statusCode ?? 502, headers);
  const injector = new HeadInjector(CLIENT_TAG);
  upstream.on("data", (chunk: Buffer) => {
    const out = injector.write(chunk);
    if (out.length) res.write(out);
  });
  upstream.on("end", () => res.end(injector.end()));
}

export function createProxy(target: URL): http.RequestListener {
  return (req, res) => {
    const upstream = http.request(
      {
        host: target.hostname,
        port: target.port,
        method: req.method,
        path: req.url,
        headers: upstreamHeaders(req.headers, target),
      },
      (upstreamRes) => relayResponse(upstreamRes, res),
    );
    upstream.on("error", (err) => {
      if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
      res.end(`pi-mic-web: pi-web unreachable at ${target.origin} (${err.message})`);
    });
    req.pipe(upstream);
    res.on("close", () => upstream.destroy());
  };
}
