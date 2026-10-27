import assert from "node:assert/strict";
import { test } from "node:test";
import { appendText, createInsertion } from "./insertion.ts";

test("appendText adds a space only when needed", () => {
  assert.equal(appendText("", "hi"), "hi");
  assert.equal(appendText("fix", "the bug"), "fix the bug");
  assert.equal(appendText("fix ", "the bug"), "fix the bug");
});

test("createInsertion spaces the text from both neighbours and reports the caret", () => {
  const insert = createInsertion("fix bug", 3, 3);
  assert.deepEqual(insert("the"), { value: "fix the bug", caret: 7 });
  assert.deepEqual(insert(""), { value: "fix bug", caret: 3 });
});

test("createInsertion replaces the selection and skips redundant spaces", () => {
  const insert = createInsertion("a XXX b", 2, 5);
  assert.deepEqual(insert("new"), { value: "a new b", caret: 5 });
  const atEnd = createInsertion("hello", 5, 5);
  assert.deepEqual(atEnd("world"), { value: "hello world", caret: 11 });
});
