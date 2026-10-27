import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { gzipSync } from "node:zlib";
import { CONFIG_PATH } from "../../core/protocol.ts";
import { attachMicHandlers } from "./attach.ts";
import { createMicHandlers } from "./mic-handlers.ts";

const HTML = "<html><head><title>x</title></head><body>hi</body></html>";
const ASSET_PATH = "/__pi-mic/assets/web/client/main.js";

function hostListener(req: http.IncomingMessage, res: http.ServerResponse): void {
  if (req.url === "/json") {
    const body = JSON.stringify({ ok: true });
    res.writeHead(200, { "content-type": "application/json", "content-length": body.length });
    return void res.end(body);
  }
  if (req.headers["accept-encoding"]?.includes("gzip")) {
    const body = gzipSync(HTML);
    res.writeHead(200, {
      "content-type": "text/html",
      "content-encoding": "gzip",
      "content-length": body.length,
    });
    return void res.end(body);
  }
  res.writeHead(200, { "content-type": "text/html", "content-length": HTML.length });
  res.end(HTML);
}

let server: http.Server;
let port: number;

before(async () => {
  server = http.createServer(hostListener);
  server.on("upgrade", (_req, socket) => {
    socket.end("HTTP/1.1 200 OK\r\nx-original-upgrade: yes\r\nconnection: close\r\n\r\n");
  });
  const handlers = createMicHandlers({
    agentDir: process.cwd(),
    env: {},
    assets: new Map([[ASSET_PATH, Buffer.from("console.log(1)")]]),
  });
  assert.equal(attachMicHandlers(server, handlers), true);
  assert.equal(attachMicHandlers(server, handlers), false);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

after(() => server.close());

function get(path: string, headers: http.OutgoingHttpHeaders = {}) {
  return new Promise<{ headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
    http
      .get({ port, host: "127.0.0.1", path, headers }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ headers: res.headers, body: Buffer.concat(chunks).toString() }),
        );
      })
      .on("error", reject);
  });
}

test("document requests get the script tag without stale encoding or length", async () => {
  const res = await get("/", { accept: "text/html", "accept-encoding": "gzip" });
  assert.match(
    res.body,
    /<script type="module" src="\/__pi-mic\/assets\/web\/client\/main\.js"><\/script><\/head>/,
  );
  assert.equal(res.headers["content-encoding"], undefined);
  assert.equal(res.headers["content-length"], undefined);
});

test("non-document requests pass through untouched", async () => {
  const res = await get("/json", { accept: "application/json", "accept-encoding": "gzip" });
  assert.equal(res.body, '{"ok":true}');
  assert.equal(res.headers["content-length"], "11");
});

test("config and assets are served by the mic handlers", async () => {
  const config = await get(CONFIG_PATH);
  assert.deepEqual(Object.keys(JSON.parse(config.body)), ["realtime"]);
  const asset = await get(ASSET_PATH);
  assert.equal(asset.body, "console.log(1)");
});

test("non-mic upgrades reach the original listener", async () => {
  const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
    http
      .get(
        {
          port,
          host: "127.0.0.1",
          path: "/ws",
          headers: { connection: "Upgrade", upgrade: "websocket" },
        },
        resolve,
      )
      .on("upgrade", resolve)
      .on("error", reject);
  });
  assert.equal(response.headers["x-original-upgrade"], "yes");
  response.destroy();
});
