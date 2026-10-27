import assert from "node:assert/strict";
import { test } from "node:test";
import { deepgramQuery } from "./query.ts";

test("deepgramQuery defaults to nova-3 with formatting enabled", () => {
  const query = deepgramQuery({});
  assert.equal(query.get("model"), "nova-3");
  assert.equal(query.get("smart_format"), "true");
  assert.equal(query.get("punctuate"), "true");
  assert.equal(query.has("language"), false);
});

test("deepgramQuery adds language, repeated keyterms and extra parameters", () => {
  const query = deepgramQuery(
    { model: "nova-2", language: "pt", keyterms: ["pi-mic", "OmniRoute"] },
    { encoding: "linear16" },
  );
  assert.equal(query.get("model"), "nova-2");
  assert.equal(query.get("language"), "pt");
  assert.deepEqual(query.getAll("keyterm"), ["pi-mic", "OmniRoute"]);
  assert.equal(query.get("encoding"), "linear16");
});
