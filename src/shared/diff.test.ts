// The review's diff: right on small texts, bounded on big ones — a phone must never freeze over a review.
import assert from "node:assert/strict";
import { test } from "node:test";
import { diffRows, lineDiff } from "./diff.ts";

test("a one-line change diffs as minus and plus between unchanged lines", () => {
  const got = lineDiff("one\ntwo\nthree", "one\n2\nthree");
  assert.deepEqual(got, [
    { kind: "same", text: "one" },
    { kind: "del", text: "two" },
    { kind: "add", text: "2" },
    { kind: "same", text: "three" },
  ]);
});

test("a huge pair of texts diffs without the big matrix, every change still shown (R2-8)", () => {
  const a = Array.from({ length: 30_000 }, (_, i) => `old line ${i}`).join("\n");
  const b = Array.from({ length: 30_000 }, (_, i) => `new line ${i}`).join("\n");
  const started = Date.now();
  const got = lineDiff(`same head\n${a}\nsame tail`, `same head\n${b}\nsame tail`);
  assert.ok(Date.now() - started < 2000, "the bounded path stays fast");
  assert.equal(got[0].kind, "same");
  assert.equal(got.filter((r) => r.kind === "del").length, 30_000);
  assert.equal(got.filter((r) => r.kind === "add").length, 30_000);
  assert.equal(got[got.length - 1].kind, "same");
});

test("a big document folds its unchanged middle into a skip row", () => {
  const lines = Array.from({ length: 200 }, (_, i) => `line ${i} of a made-up report that goes on and on`);
  const a = lines.join("\n");
  const b = [...lines.slice(0, 100), "a changed line", ...lines.slice(101)].join("\n");
  const rows = diffRows(a, b, 100);
  assert.ok(rows.some((r) => r.kind === "skip"));
  assert.ok(rows.some((r) => r.kind === "add" && r.text === "a changed line"));
});
