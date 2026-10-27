import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOptions } from "./options.ts";

test("parseOptions applies defaults", () => {
  assert.deepEqual(parseOptions([], {}), {
    targetUrl: undefined,
    listenHost: "127.0.0.1",
    listenPort: 3042,
  });
});

test("parseOptions reads the environment", () => {
  const options = parseOptions([], {
    PI_MIC_WEB_TARGET: "http://env:1",
    PI_MIC_WEB_LISTEN: "0.0.0.0:4000",
  });
  assert.deepEqual(options, { targetUrl: "http://env:1", listenHost: "0.0.0.0", listenPort: 4000 });
});

test("parseOptions lets flags win over the environment", () => {
  const options = parseOptions(["--target", "http://flag:2", "--listen", "127.0.0.1:5000"], {
    PI_MIC_WEB_TARGET: "http://env:1",
    PI_MIC_WEB_LISTEN: "0.0.0.0:4000",
  });
  assert.deepEqual(options, {
    targetUrl: "http://flag:2",
    listenHost: "127.0.0.1",
    listenPort: 5000,
  });
});
