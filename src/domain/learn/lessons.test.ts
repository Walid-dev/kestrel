// The shape holds, packs group, search finds, and the spaced rhythm grows and shrinks as graded.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../../db/migrate.ts";
import { addLesson, addPack, getLesson, listLessons, listPacks, searchLessons } from "./lessons.ts";
import { dueLessons, gradeLesson, neverGraded } from "./review.ts";

function setup() {
  const base = mkdtempSync(join(tmpdir(), "kestrel-learn-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  return db;
}
const BODY = {
  say: ["A made-up idea, said plainly.", "One line at a time."],
  explain: ["The longer why."],
  example: "A made-up example.",
  words: [{ w: "idea", m: "a thought" }],
  check: [{ q: "What is the idea?", a: "A thought." }],
};

test("a pack holds its lessons in order, the shape is kept, search finds by word", () => {
  const db = setup();
  const pack = addPack(db, "A made-up pack");
  addLesson(db, pack, "Second", BODY, 2);
  const first = addLesson(db, pack, "First", BODY, 1);
  assert.deepEqual(
    listLessons(db, pack).map((l) => l.title),
    ["First", "Second"],
  );
  assert.equal(getLesson(db, first.id)?.body.say.length, 2);
  assert.equal(listPacks(db)[0].lessons, 2);
  assert.equal(searchLessons(db, "made-up idea").length, 2);
  assert.throws(() => addLesson(db, pack, "  ", BODY), /needs its title/);
});

test("the spaced rhythm: again means tomorrow, good grows 1 then 3 then times ease", () => {
  const db = setup();
  const pack = addPack(db, "P");
  const l = addLesson(db, pack, "L", BODY);
  const now = new Date("2026-11-21T12:00:00Z");
  assert.deepEqual(neverGraded(db), [l.id]); // it has a check, so it is due from birth
  const g1 = gradeLesson(db, l.id, "good", now);
  assert.equal(g1.intervalDays, 1);
  const g2 = gradeLesson(db, l.id, "good", now);
  assert.equal(g2.intervalDays, 3);
  const g3 = gradeLesson(db, l.id, "good", now);
  assert.equal(g3.intervalDays, 7.5);
  assert.deepEqual(dueLessons(db, new Date("2026-12-01T12:00:00Z")), [l.id]);
  const again = gradeLesson(db, l.id, "again", now);
  assert.equal(again.intervalDays, 1);
});

test("a lesson into a pack that was never made is refused in words, not a constraint crash (sweep)", () => {
  const db = setup();
  assert.throws(() => addLesson(db, "no-such-pack", "A title", {}), /no such pack/);
});
