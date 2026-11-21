// A task closes only with its note, reopens cleanly, and the old Hub's file carries over without doubling.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../../db/migrate.ts";
import { Refused } from "../notes/documents.ts";
import { addTask, closeTask, importOldTasks, listTasks, reopenTask } from "./tasks.ts";

function setup() {
  const base = mkdtempSync(join(tmpdir(), "kestrel-tasks-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  return db;
}

test("a task lives open, closes with its note, and reopens without losing the words", () => {
  const db = setup();
  const made = addTask(db, "paint the fence", "me");
  assert.throws(() => addTask(db, "   "), Refused);
  assert.equal(listTasks(db, "open").length, 1);
  assert.throws(() => closeTask(db, made.id, ""), Refused); // the note is the point
  assert.throws(() => closeTask(db, "nope", "done"), Refused);
  const closed = closeTask(db, made.id, "two coats, dry by noon");
  assert.equal(closed.done, true);
  assert.equal(closed.note, "two coats, dry by noon");
  assert.ok(closed.closed);
  assert.equal(listTasks(db, "open").length, 0);
  const back = reopenTask(db, made.id);
  assert.equal(back.done, false);
  assert.equal(back.closed, null);
  assert.equal(back.text, "paint the fence");
});

test("the old Hub's file lands once: a rerun updates, junk is skipped by name, other keys ignored", () => {
  const db = setup();
  const OLD = {
    "task:aa": { text: "feed the bees", for: "me", at: "2026-11-01T08:00:00Z", done: false },
    "task:bb": { text: "mend the fence", for: "", at: "2026-11-02T08:00:00Z", done: true },
    "task:cc": { text: "", at: "2026-11-03T08:00:00Z", done: false },
    "note:dd": { text: "not a task" },
  };
  const first = importOldTasks(db, OLD);
  assert.equal(first.landed, 2);
  assert.equal(first.skipped.length, 1);
  assert.equal(listTasks(db).length, 2);
  const again = importOldTasks(db, { ...OLD, "task:aa": { ...OLD["task:aa"], done: true } });
  assert.equal(again.landed, 2);
  assert.equal(listTasks(db).length, 2); // never doubled
  assert.equal(listTasks(db, "done").length, 2); // the old file stayed the authority for done
});
