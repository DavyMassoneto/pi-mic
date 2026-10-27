import assert from "node:assert/strict";
import { test } from "node:test";
import { combine, joinParts } from "./transcript.ts";

test("joinParts trims and drops empty parts", () => {
  assert.equal(joinParts([" a ", "", "  ", "b"]), "a b");
});

test("combine joins non-empty committed and pending text", () => {
  assert.equal(combine("a", "b"), "a b");
  assert.equal(combine("", "b"), "b");
  assert.equal(combine("a", ""), "a");
});
