// The brief counts what waits and says it in sentences; an empty morning says so instead of a blank.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../db/migrate.ts";
import { morningBrief } from "./brief.ts";
import { addLesson, addPack } from "./learn/lessons.ts";
import { addTask } from "./tasks/tasks.ts";

const NOW = new Date("2026-11-21T12:00:00Z");

function setup() {
  const base = mkdtempSync(join(tmpdir(), "kestrel-brief-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  return db;
}

test("a quiet morning says so", () => {
  const db = setup();
  assert.deepEqual(morningBrief(db, NOW), ["Nothing waits. A quiet morning."]);
});

test("what waits is counted: the fresh great match, the open task, the ungraded lesson", () => {
  const db = setup();
  db.prepare(
    `INSERT INTO listings (id, search, source, link, dedupe, status, starred, found, updated, score, match, data)
     VALUES ('g1', 's1', 'made-up', 'https://example.com/1', 'co|keeper', 'new', NULL, ?, ?, 88, 'great', '{}')`,
  ).run(NOW.toISOString(), NOW.toISOString());
  addTask(db, "mend the fence");
  const pack = addPack(db, "A made-up pack");
  const l = addLesson(db, pack, "Smoke first", { check: [{ q: "When?", a: "Before opening." }] }, 1);
  addLesson(db, pack, "Never opened", { check: [{ q: "Why?", a: "Because." }] }, 2); // unread is not "to review"
  db.prepare("INSERT INTO reviews (lesson, due, interval_days, ease, level) VALUES (?, ?, 1, 2.5, 1)").run(
    l.id,
    "2026-11-20T12:00:00Z",
  );
  const lines = morningBrief(db, NOW);
  assert.deepEqual(lines, [
    "1 great match arrived since yesterday.",
    "The Priority list holds 1.",
    "1 lesson is up for review today.",
    "1 task stays open.",
  ]);
});

test("the brief counts every lesson up for review, past the practice queue's first page; Interview prep apart (sweep)", () => {
  const db = setup();
  const pack = addPack(db, "A made-up pack");
  const other = addPack(db, "Made-up answers", "answer-pack"); // Interview prep: not Learn's review
  const put = db.prepare("INSERT INTO reviews (lesson, due, interval_days, ease, level) VALUES (?, ?, 1, 2.5, 1)");
  for (let i = 0; i < 25; i++) {
    const l = addLesson(db, pack, `Lesson ${i}`, { check: [{ q: "When?", a: "Now." }] }, i, `l-${i}`);
    put.run(l.id, "2026-11-20T12:00:00Z");
  }
  const a = addLesson(db, other, "An answer", { say: ["Yes."] }, 1, "a-1");
  put.run(a.id, "2026-11-20T12:00:00Z");
  const lines = morningBrief(db, NOW);
  assert.ok(lines.includes("25 lessons are up for review today."), lines.join(" | "));
});
