// My notes as marks: a note's range cuts a run into segments, a range across two runs marks the tail of one and the
// head of the next, and a note across bold text marks the words on both sides of the hidden ** but not the marks.
import assert from "node:assert/strict";
import { test } from "node:test";
import { leaves, parse } from "./markdown.ts";
import { segments } from "./marks.ts";

test("a note range cuts its run into segments; overlap keeps the first note", () => {
  const segs = segments({ at: 0, text: "one two three" }, [
    { id: "a", at: 4, end: 7 },
    { id: "b", at: 6, end: 10 },
  ]);
  assert.deepEqual(segs, [
    { at: 0, text: "one ", noteId: null },
    { at: 4, text: "two", noteId: "a" },
    { at: 7, text: " three", noteId: null },
  ]);
});

test("a range spanning runs marks the tail of one and the head of the next", () => {
  const note = [{ id: "n", at: 3, end: 8 }];
  assert.deepEqual(segments({ at: 0, text: "alpha" }, note), [
    { at: 0, text: "alp", noteId: null },
    { at: 3, text: "ha", noteId: "n" },
  ]);
  assert.deepEqual(segments({ at: 6, text: "beta" }, note), [
    { at: 6, text: "be", noteId: "n" },
    { at: 8, text: "ta", noteId: null },
  ]);
});

test("a note across bold text marks the words in and around it, never the ** between", () => {
  const src = "Keep it **short and warm**, always.";
  const note = [{ id: "n", at: src.indexOf("it"), end: src.indexOf(",") }]; // "it **short and warm**"
  const marked = leaves(parse(src))
    .flatMap((l) => segments(l, note))
    .filter((s) => s.noteId)
    .map((s) => s.text);
  assert.deepEqual(marked, ["it ", "short and warm"]);
});
