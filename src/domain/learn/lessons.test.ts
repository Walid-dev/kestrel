// The shape holds, packs group, search finds, and the spaced rhythm grows and shrinks as graded.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../../db/migrate.ts";
import {
  addLesson,
  addPack,
  getLesson,
  LessonBody,
  lessonText,
  listLessons,
  listPacks,
  searchLessons,
  setPackArea,
} from "./lessons.ts";
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

test("the old Learn's ladder: each known climbs 1, 3, 7, 16, 35 days; again starts over tomorrow", () => {
  const db = setup();
  const pack = addPack(db, "P");
  const l = addLesson(db, pack, "L", BODY);
  const now = new Date("2026-11-21T12:00:00Z");
  assert.deepEqual(neverGraded(db, "learn"), [l.id]); // it has a check, so Practice asks it from birth
  const climbs = [1, 2, 3, 4, 5, 6].map(() => gradeLesson(db, l.id, "good", now));
  assert.deepEqual(
    climbs.map((g) => g.intervalDays),
    [1, 3, 7, 16, 35, 35], // the top step holds
  );
  assert.deepEqual(
    climbs.map((g) => g.level),
    [1, 2, 3, 4, 5, 5],
  );
  assert.deepEqual(dueLessons(db, "learn", new Date("2027-01-01T12:00:00Z")), [l.id]);
  const again = gradeLesson(db, l.id, "again", now);
  assert.deepEqual([again.intervalDays, again.level], [1, 0]);
});

test("packs live in an area; moving one is one call, and a missing pack is refused in words", () => {
  const db = setup();
  const a = addPack(db, "Lessons");
  const b = addPack(db, "Answers", "answer-pack");
  assert.deepEqual(
    listPacks(db, "learn").map((p) => p.name),
    ["Lessons"],
  );
  assert.deepEqual(
    listPacks(db, "interview").map((p) => p.name),
    ["Answers"], // an answer-pack starts in Interview prep
  );
  setPackArea(db, a, "interview");
  assert.equal(listPacks(db, "interview").length, 2);
  setPackArea(db, b, "learn");
  assert.deepEqual(
    listPacks(db, "learn").map((p) => p.name),
    ["Answers"],
  );
  assert.throws(() => setPackArea(db, "nope", "learn"), /no such pack/);
});

test("lessonText reads a guide topic's blocks as plain lines, analogies and terms included", () => {
  const text = lessonText(
    LessonBody.parse({
      short: "A lede.",
      blocks: [
        { type: "lines", lines: ["One `code` line.", { like: "Like a box." }, { code: "never read" }] },
        { type: "entry", term: "VPC", full: "Virtual Private Cloud", explain: ["Your **own** network."] },
        { type: "table", head: ["a", "b"], rows: [["k", "v"]] },
      ],
    }),
  );
  assert.deepEqual(text, [
    "A lede.",
    "One code line.",
    "Like a box.",
    "VPC (Virtual Private Cloud)",
    "Your own network.",
    "k: v",
  ]);
});

test("a lesson into a pack that was never made is refused in words, not a constraint crash (sweep)", () => {
  const db = setup();
  assert.throws(() => addLesson(db, "no-such-pack", "A title", {}), /no such pack/);
});
