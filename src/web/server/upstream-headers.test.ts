import assert from "node:assert/strict";
import { test } from "node:test";
import { upstreamHeaders } from "./upstream-headers.ts";

const target = new URL("http://pi-web:3041");

test("upstreamHeaders points host, origin and referer at the target", () => {
  const headers = upstreamHeaders(
    {
      host: "127.0.0.1:3042",
      origin: "http://127.0.0.1:3042",
      referer: "http://127.0.0.1:3042/session/1",
      cookie: "a=b",
    },
    target,
  );
  assert.equal(headers.host, "pi-web:3041");
  assert.equal(headers.origin, "http://pi-web:3041");
  assert.equal(headers.referer, "http://pi-web:3041/session/1");
  assert.equal(headers.cookie, "a=b");
  assert.equal(headers["accept-encoding"], "identity");
});

test("upstreamHeaders leaves absent origin and referer absent", () => {
  const headers = upstreamHeaders({ host: "x" }, target);
  assert.equal("origin" in headers, false);
  assert.equal("referer" in headers, false);
});
