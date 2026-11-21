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
  addLesson(db, pack, "Smoke first", { check: [{ q: "When?", a: "Before opening." }] }, 1);
  const lines = morningBrief(db, NOW);
  assert.deepEqual(lines, [
    "1 great match arrived since yesterday.",
    "The Priority list holds 1.",
    "1 lesson is due to practice.",
    "1 task stays open.",
  ]);
});
