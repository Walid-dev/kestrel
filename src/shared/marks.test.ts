// The reader's text math: lines know their place, and note ranges cut a line into segments.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lineKinds, segments } from "./marks.ts";

test("lines carry their offset in the whole text", () => {
  const lines = lineKinds("# One\n\ntwo three");
  assert.deepEqual(
    lines.map((l) => [l.at, l.kind]),
    [
      [0, "h1"],
      [6, "blank"],
      [7, "plain"],
    ],
  );
});

test("a note range cuts its line into segments; overlap keeps the first note", () => {
  const [line] = lineKinds("one two three").slice(0, 1);
  const segs = segments(line, [
    { id: "a", at: 4, end: 7 },
    { id: "b", at: 6, end: 10 },
  ]);
  assert.deepEqual(segs, [
    { at: 0, text: "one ", noteId: null },
    { at: 4, text: "two", noteId: "a" },
    { at: 7, text: " three", noteId: null },
  ]);
});

test("a range spanning lines marks the tail of one and the head of the next", () => {
  const lines = lineKinds("alpha\nbeta");
  const note = [{ id: "n", at: 3, end: 8 }];
  assert.deepEqual(segments(lines[0], note), [
    { at: 0, text: "alp", noteId: null },
    { at: 3, text: "ha", noteId: "n" },
  ]);
  assert.deepEqual(segments(lines[1], note), [
    { at: 6, text: "be", noteId: "n" },
    { at: 8, text: "ta", noteId: null },
  ]);
});
