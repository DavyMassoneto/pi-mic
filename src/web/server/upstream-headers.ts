import type { IncomingHttpHeaders, OutgoingHttpHeaders } from "node:http";

export function upstreamHeaders(headers: IncomingHttpHeaders, target: URL): OutgoingHttpHeaders {
  const out: OutgoingHttpHeaders = { ...headers, host: target.host, "accept-encoding": "identity" };
  if (out.origin) out.origin = target.origin;
  if (typeof out.referer === "string") {
    out.referer = out.referer.replace(/^https?:\/\/[^/]+/, target.origin);
  }
  return out;
}
