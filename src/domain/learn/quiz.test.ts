// The quiz picks the lessons' own checks first: what I missed lately comes back first, then what is due, then the
// rest; a lesson without a check waits for a made question; the mark reads tolerantly. Made-up lessons only.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { Grade } from "../../ai/quiz/shape.ts";
import { migrate } from "../../db/migrate.ts";
import { addLesson, addPack, setPackGroup } from "./lessons.ts";
import { pickQuiz } from "./quiz.ts";
import { gradeLesson } from "./review.ts";

const NOW = new Date("2026-11-22T12:00:00Z");

function setup() {
  const base = mkdtempSync(join(tmpdir(), "kestrel-quiz-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  const pack = addPack(db, "Teapots", "lesson-pack", "pack:teapots");
  setPackGroup(db, pack, "Kitchen");
  const lesson = (id: string, checks: { q: string; a: string }[]) =>
    addLesson(db, pack, `About ${id}`, { say: [`${id} is a thing.`], check: checks }, 0, id);
  lesson("spout", [{ q: "What does a spout do?", a: "It pours." }]);
  lesson("lid", [{ q: "What does a lid do?", a: "It keeps the heat in." }]);
  lesson("handle", [{ q: "What is a handle for?", a: "Holding the pot." }]);
  lesson("glaze", []); // no check of its own
  return db;
}

test("missed lately first, then due, then the rest; a lesson with no check comes last, its question left to make", () => {
  const db = setup();
  db.prepare("INSERT INTO quiz_answers (id, lesson, question, answer, verdict, at) VALUES (?, ?, ?, ?, ?, ?)").run(
    "a1",
    "handle",
    "What is a handle for?",
    "decoration",
    "wrong",
    "2026-11-20T09:00:00Z",
  );
  gradeLesson(db, "lid", "again", new Date("2026-11-20T09:00:00Z")); // due again by now
  const items = pickQuiz(db, { area: "learn", count: 10 }, NOW, () => 0.5);
  assert.deepEqual(
    items.map((i) => i.lesson),
    ["handle", "lid", "spout", "glaze"],
  );
  assert.equal(items[0].q, "What is a handle for?");
  assert.equal(items[0].a, "Holding the pot.");
  assert.equal(items[3].q, null);
  assert.equal(items[0].packName, "Teapots");
});

test("a pack or a group narrows the quiz, and the count is kept between one and thirty", () => {
  const db = setup();
  assert.equal(pickQuiz(db, { area: "learn", group: "Kitchen", count: 2 }, NOW).length, 2);
  assert.equal(pickQuiz(db, { area: "learn", group: "Garden", count: 5 }, NOW).length, 0);
  assert.equal(pickQuiz(db, { area: "learn", pack: "pack:teapots", count: 0 }, NOW).length, 1);
  assert.equal(pickQuiz(db, { area: "interview", count: 5 }, NOW).length, 0);
});

test("a mark reads tolerantly: an odd verdict is partly, one string is one line, a code line stays code", () => {
  const odd = Grade.parse({ verdict: "almost", why: "Close.", correct: "It pours." });
  assert.equal(odd.verdict, "partly");
  assert.deepEqual(odd.correct, ["It pours."]);
  const code = Grade.parse({ verdict: "right", why: "Yes.", correct: ["Like this:", { code: "pour(tea)" }] });
  assert.deepEqual(code.correct, ["Like this:", { code: "pour(tea)" }]);
});
