import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import { CLIENT_ENTRY_PATH } from "../../core/protocol.ts";
import { HeadInjector } from "../server/head-injector.ts";

const CLIENT_TAG = Buffer.from(`<script type="module" src="${CLIENT_ENTRY_PATH}"></script>`);

type WriteCallback = (error?: Error | null) => void;

export function isDocumentRequest(req: IncomingMessage): boolean {
  return req.method === "GET" && (req.headers.accept || "").includes("text/html");
}

function headerValue(res: ServerResponse, headers: OutgoingHttpHeaders, name: string): string {
  const value = headers[name] ?? res.getHeader(name);
  return String(Array.isArray(value) ? value[0] : (value ?? ""));
}

function findHeaders(args: unknown[]): OutgoingHttpHeaders {
  const candidate = args.find((arg) => typeof arg === "object" && arg !== null);
  return candidate && !Array.isArray(candidate) ? (candidate as OutgoingHttpHeaders) : {};
}

function isInjectable(res: ServerResponse, headers: OutgoingHttpHeaders): boolean {
  const encoding = headerValue(res, headers, "content-encoding");
  return (
    headerValue(res, headers, "content-type").startsWith("text/html") &&
    (encoding === "" || encoding === "identity")
  );
}

function toBuffer(chunk: unknown, encoding: unknown): Buffer {
  if (typeof chunk === "string") {
    return Buffer.from(chunk, typeof encoding === "string" ? (encoding as BufferEncoding) : "utf8");
  }
  return Buffer.from(chunk as Uint8Array);
}

function splitArguments(args: unknown[]): {
  chunk: unknown;
  encoding: unknown;
  done?: WriteCallback;
} {
  const [chunk, second, third] = args;
  if (typeof chunk === "function")
    return { chunk: undefined, encoding: undefined, done: chunk as WriteCallback };
  if (typeof second === "function")
    return { chunk, encoding: undefined, done: second as WriteCallback };
  return { chunk, encoding: second, done: third as WriteCallback | undefined };
}

export function stripEncodingForDocument(req: IncomingMessage): void {
  delete req.headers["accept-encoding"];
}

export function injectClientIntoHtml(res: ServerResponse): void {
  const originalWriteHead = res.writeHead;
  const originalWrite = res.write;
  const originalEnd = res.end;
  let injector: HeadInjector | undefined;

  res.writeHead = function (this: ServerResponse, ...args: unknown[]) {
    const headers = findHeaders(args);
    if (!injector && isInjectable(this, headers)) {
      injector = new HeadInjector(CLIENT_TAG);
      this.removeHeader("content-length");
      delete headers["content-length"];
    }
    res.writeHead = originalWriteHead;
    return (originalWriteHead as (...a: unknown[]) => ServerResponse).apply(this, args);
  } as typeof res.writeHead;

  res.write = function (this: ServerResponse, ...args: unknown[]) {
    if (!this.headersSent) this.writeHead(this.statusCode);
    if (!injector) return (originalWrite as (...a: unknown[]) => boolean).apply(this, args);
    const { chunk, encoding, done } = splitArguments(args);
    const out = injector.write(toBuffer(chunk, encoding));
    if (out.length) return (originalWrite as (...a: unknown[]) => boolean).call(this, out, done);
    done?.();
    return true;
  } as typeof res.write;

  res.end = function (this: ServerResponse, ...args: unknown[]) {
    if (!this.headersSent) this.writeHead(this.statusCode);
    if (!injector) return (originalEnd as (...a: unknown[]) => ServerResponse).apply(this, args);
    const { chunk, encoding, done } = splitArguments(args);
    const head =
      chunk === undefined || chunk === null
        ? Buffer.alloc(0)
        : injector.write(toBuffer(chunk, encoding));
    return (originalEnd as (...a: unknown[]) => ServerResponse).call(
      this,
      Buffer.concat([head, injector.end()]),
      done,
    );
  } as typeof res.end;
}
