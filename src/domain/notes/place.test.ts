// The placing rules: once, repeated (the note's words decide), overlapping (the first wins), missing (listed).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, place } from "./place.ts";

const ch = (find: string, replace: string, notes = ["n1"]) => ({ document: "d.md", find, replace, notes });

test("a change whose text appears once lands there; a missing text is listed with the reason", () => {
  const got = place("one two three", [ch("two", "2"), ch("missing", "x")], new Map([["n1", 4]]));
  assert.equal(got.placed.length, 1);
  assert.equal(got.placed[0].at, 4);
  assert.equal(got.leftOut[0].reason, "its text is not in the document");
});

test("a repeated text lands inside or nearest its note's words, and without an anchor it is listed", () => {
  const text = "The wolf waits. The night. The wolf waits. The end.";
  const second = text.lastIndexOf("The wolf waits.");
  const got = place(text, [ch("The wolf waits.", "The wolf still waits.")], new Map([["n1", second + 4]]));
  assert.equal(got.placed[0].at, second);
  const lost = place(text, [ch("The wolf waits.", "x")], new Map([["n1", null]]));
  assert.match(lost.leftOut[0].reason, /repeats 2 times/);
});

test("of two overlapping changes, the first wins and the second is listed", () => {
  const got = place("alpha beta gamma", [ch("alpha beta", "A"), ch("beta gamma", "B", ["n2"])], new Map());
  assert.equal(got.placed.length, 1);
  assert.equal(got.leftOut[0].reason, "it overlaps an earlier change");
});

test("apply writes the new text back to front, so every placement stays true", () => {
  const text = "one two three two";
  const got = place(text, [ch("one", "1"), ch("three", "3")], new Map());
  assert.equal(apply(text, got.placed), "1 two 3 two");
});
