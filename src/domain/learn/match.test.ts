// The matcher with made-up questions: the near one wins, a ramble doesn't win on volume, a miss says null.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../../db/migrate.ts";
import { addLesson, addPack } from "./lessons.ts";
import { bestAnswer, scoreMatch } from "./match.ts";

function setup() {
  const base = mkdtempSync(join(tmpdir(), "kestrel-match-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  const pack = addPack(db, "A made-up interview", "answer-pack");
  addLesson(db, pack, "Why did you pick cedar for the boxes?", { say: ["Cedar stays light."] }, 1, "l-cedar");
  addLesson(
    db,
    pack,
    "How do you calm the hive?",
    { say: ["Two puffs of smoke."], check: [{ q: "What does the smoker do?", a: "It masks the alarm smell." }] },
    2,
    "l-smoke",
  );
  const lessons = addPack(db, "A lesson pack", "lesson-pack");
  addLesson(db, lessons, "Why did you pick cedar for the boxes?", { say: ["Never matched: not an answer-pack."] }, 1);
  return db;
}

test("the heard question finds its prepared answer, through the title or a check question", () => {
  const db = setup();
  assert.equal(bestAnswer(db, "so why did you pick cedar for the boxes")?.lesson, "l-cedar");
  assert.equal(bestAnswer(db, "what does the smoker actually do")?.lesson, "l-smoke");
});

test("a question with no near answer returns null instead of a guess", () => {
  const db = setup();
  assert.equal(bestAnswer(db, "tell me about your favourite colour"), null);
  assert.equal(bestAnswer(db, ""), null);
});

test("only answer-packs are searched, and the score prefers shared words over volume", () => {
  const db = setup();
  const hit = bestAnswer(db, "cedar boxes");
  assert.equal(hit?.lesson, "l-cedar"); // the lesson-pack twin never answers
  assert.ok(
    scoreMatch("Why cedar boxes?", "why cedar boxes") >
      scoreMatch("Why cedar boxes?", "cedar and many other unrelated words piled on and on"),
  );
  assert.equal(scoreMatch("", "anything"), 0);
});
