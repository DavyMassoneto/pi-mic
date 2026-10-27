import assert from "node:assert/strict";
import { test } from "node:test";
import { HeadInjector } from "./head-injector.ts";

const tag = Buffer.from("<script></script>");

function run(chunks: string[]): string {
  const injector = new HeadInjector(tag);
  const out = chunks.map((chunk) => injector.write(Buffer.from(chunk)));
  out.push(injector.end());
  return Buffer.concat(out).toString();
}

test("HeadInjector inserts the tag before </head>", () => {
  assert.equal(
    run(["<html><head></head><body>x</body></html>"]),
    "<html><head><script></script></head><body>x</body></html>",
  );
});

test("HeadInjector finds </head> split across chunks", () => {
  assert.equal(
    run(["<html><head></he", "ad><body>", "x</body>"]),
    "<html><head><script></script></head><body>x</body>",
  );
});

test("HeadInjector passes text through unchanged when there is no head", () => {
  assert.equal(run(["plain ", "text"]), "plain text");
});

test("HeadInjector injects only once", () => {
  assert.equal(run(["</head>", "</head>"]), "<script></script></head></head>");
});
