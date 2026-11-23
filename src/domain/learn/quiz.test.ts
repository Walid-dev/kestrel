// The quiz picks the lessons' own checks first: what I missed lately comes back first, then what is due, then the
// rest; a lesson without a check waits for a made question; the mark reads tolerantly. A quiz is kept as I take it,
// and Ask on a question sees the question, my answer and the lesson. Made-up lessons only.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { explainPrompt } from "../../ai/quiz/prompt.ts";
import { Explained, Grade } from "../../ai/quiz/shape.ts";
import { startStandIn } from "../../ai/stand-in.ts";
import { migrate } from "../../db/migrate.ts";
import type { Settings } from "../../platform/config.ts";
import { addLesson, addPack, setPackGroup } from "./lessons.ts";
import {
  answerQuiz,
  dropQuiz,
  getQuiz,
  keptExplanation,
  listQuizzes,
  makeQuizQuestion,
  moveQuiz,
  pickQuiz,
  quizPage,
  skipQuestion,
  skipQuiz,
  startQuiz,
} from "./quiz.ts";
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

test("I don't know counts as a miss: that lesson comes back first next time", () => {
  const db = setup();
  skipQuestion(db, { lesson: "spout", question: "What does a spout do?" });
  assert.equal(pickQuiz(db, { area: "learn", count: 10 }, new Date(), () => 0.5)[0].lesson, "spout");
  assert.throws(() => skipQuestion(db, { lesson: "nope", question: "x" }), /no such lesson/);
});

test("an explanation is asked as a small lesson and kept by its question; an empty one doesn't read", () => {
  const p = explainPrompt({
    title: "Teapots",
    question: "Why a spout?",
    expected: "It pours.",
    lesson: "A spout pours.",
  });
  for (const part of ["In one line", "Break it down", "Picture it", "In code", "Watch out", '"remember"'])
    assert.ok(p.includes(part), part);
  const db = setup();
  assert.equal(keptExplanation(db, "spout", "Why a spout?"), null);
  const body = { blocks: [{ type: "lines", lines: ["It pours."] }], remember: "Spouts pour." };
  db.prepare("INSERT INTO quiz_explanations (lesson, question, body, model, at) VALUES (?, ?, ?, ?, ?)").run(
    "spout",
    "Why a spout?",
    JSON.stringify(body),
    "made-up-model",
    "2026-11-22T12:00:00Z",
  );
  assert.deepEqual(keptExplanation(db, "spout", "Why a spout?"), body);
  assert.equal(Explained.safeParse({ blocks: [], remember: "x" }).success, false);
});

const settings = (url: string): Settings => ({
  tailscaleLogin: "made-up",
  notes: { folders: [] },
  models: { url, careful: "careful-model", fast: "fast-model", contextChars: 100_000 },
  voice: { url: "http://127.0.0.1:1", name: "made-up" },
  profile: {},
  omlxHome: "",
  apply: { folder: "", skill: "", pdf: "", check: "" },
  links: [],
});

test("a quiz is kept as I take it: answered, skipped, moved on, ended, listed, dropped", async () => {
  const db = setup();
  const s = await startStandIn(() => ({
    content: JSON.stringify({ verdict: "right", why: "Yes.", correct: ["It pours."] }),
  }));
  const quiz = startQuiz(db, { area: "learn", pack: "pack:teapots", count: 3 }, NOW, () => 0.5);
  assert.equal(quiz.scope, "Teapots");
  assert.equal(quiz.items.length, 3);
  assert.deepEqual(quiz.answers, [null, null, null]);
  const skipped = skipQuiz(db, quiz.id, 0);
  assert.equal(skipped.answers[0]?.skipped, true);
  assert.equal(skipped.answers[0]?.verdict, "wrong");
  const answered = await answerQuiz(db, settings(s.url), quiz.id, 1, " it pours ");
  assert.deepEqual(answered.answers[1], {
    answer: "it pours",
    verdict: "right",
    why: "Yes.",
    correct: ["It pours."],
    skipped: false,
  });
  await answerQuiz(db, settings(s.url), quiz.id, 1, "again"); // a second tap: kept as it was, no model asked
  assert.equal(s.calls(), 1);
  await s.close();
  assert.equal(moveQuiz(db, quiz.id, 2).finished, null);
  const ended = moveQuiz(db, quiz.id, 99);
  assert.equal(ended.place, 3);
  assert.ok(ended.finished);
  // a started quiz comes before an ended one
  const other = startQuiz(db, { area: "learn", group: "Kitchen", count: 2 }, NOW);
  const listed = listQuizzes(db);
  assert.deepEqual(
    listed.map((q) => [q.id, q.scope, q.answered, q.right, q.total]),
    [
      [other.id, "Kitchen", 0, 0, 2],
      [quiz.id, "Teapots", 2, 1, 3],
    ],
  );
  dropQuiz(db, other.id);
  assert.equal(getQuiz(db, other.id), null);
  assert.throws(() => startQuiz(db, { area: "interview", count: 5 }, NOW), /No lessons there yet/);
});

test("a lesson without its own check gets its question written once, kept in the quiz", async () => {
  const db = setup();
  const s = await startStandIn(() => ({ content: JSON.stringify({ q: "What is a glaze for?", a: "A smooth coat." }) }));
  const quiz = startQuiz(db, { area: "learn", count: 10 }, NOW, () => 0.5);
  const at = quiz.items.findIndex((i) => i.q === null);
  assert.ok(at >= 0);
  const made = await makeQuizQuestion(db, settings(s.url), quiz.id, at);
  assert.equal(made.items[at].q, "What is a glaze for?");
  await makeQuizQuestion(db, settings(s.url), quiz.id, at);
  assert.equal(s.calls(), 1);
  await s.close();
});

test("Ask on a quiz question sees the question, the lesson's answer, mine and the lesson", () => {
  const db = setup();
  const quiz = startQuiz(db, { area: "learn", pack: "pack:teapots", count: 1 }, NOW, () => 0.5);
  skipQuiz(db, quiz.id, 0);
  const page = quizPage(db, `${quiz.id}:0`);
  const item = quiz.items[0];
  assert.equal(page?.link, `/quiz/${quiz.id}`);
  assert.match(page?.context ?? "", new RegExp(`THE QUESTION: ${item.q}`));
  assert.match(page?.context ?? "", /MY ANSWER: I said I didn't know\./);
  assert.match(page?.context ?? "", new RegExp(`THE LESSON IT COMES FROM \\(${item.lesson}\\)`));
  assert.equal(quizPage(db, `${quiz.id}:7`), null);
  assert.equal(quizPage(db, "nothing:0"), null);
});
