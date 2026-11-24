// The quiz picks the lessons' own checks first: what I missed lately comes back first, then what is due, then the
// rest; a lesson without a check waits for a made question; the mark reads tolerantly. Picked packs and lessons narrow
// it, and nothing outside them gets in. A quiz is kept as I take it, archived or deleted when I'm done with it, and
// Ask on a question sees the question, my answer and the lesson. Made-up lessons only.
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { explainPrompt, makePrompt } from "../../ai/quiz/prompt.ts";
import { Explained, Grade } from "../../ai/quiz/shape.ts";
import { startStandIn } from "../../ai/stand-in.ts";
import { migrate } from "../../db/migrate.ts";
import type { Settings } from "../../platform/config.ts";
import { questionsIn } from "../../shared/quiz.ts";
import { addLesson, addPack, setPackArea, setPackGroup } from "./lessons.ts";
import {
  answerQuiz,
  archiveQuiz,
  deleteQuiz,
  getQuiz,
  keptExplanation,
  listQuizzes,
  makeQuizQuestion,
  moveQuiz,
  pickQuiz,
  quizLessons,
  quizPage,
  restoreQuiz,
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

test("new questions: every lesson's question is left for the model, which is told the lesson's own to avoid", () => {
  const db = setup();
  // a whole topic asks each lesson once, new questions or not: four lessons make four questions, even for ten
  const items = pickQuiz(db, { area: "learn", count: 10, fresh: true }, NOW, () => 0.5);
  assert.equal(items.length, 4);
  assert.ok(items.every((i) => i.q === null && i.a === null));
  assert.equal(questionsIn([{ checks: 1 }, { checks: 1 }, { checks: 1 }, { checks: 0 }], 10, true, false), 4);
  // picked lessons go round: up to three new questions each
  const two = pickQuiz(db, { area: "learn", lessons: ["spout", "glaze"], count: 10, fresh: true }, NOW, () => 0.5);
  assert.equal(two.length, 6);
  for (const l of ["spout", "glaze"]) assert.equal(two.filter((i) => i.lesson === l).length, 3, l);
  assert.equal(questionsIn([{ checks: 1 }, { checks: 0 }], 10, true, true), 6);
  const prompt = makePrompt("Steeping", "How long to steep.", false, ["How long does green tea steep?"]);
  assert.match(prompt, /already asked[^\n]*\n- How long does green tea steep\?/);
  assert.doesNotMatch(makePrompt("Steeping", "How long to steep."), /already asked/);
});

test("a pack or a group narrows the quiz, and the count is kept between one and thirty", () => {
  const db = setup();
  assert.equal(pickQuiz(db, { area: "learn", group: "Kitchen", count: 2 }, NOW).length, 2);
  assert.equal(pickQuiz(db, { area: "learn", group: "Garden", count: 5 }, NOW).length, 0);
  assert.equal(pickQuiz(db, { area: "learn", packs: ["pack:teapots"], count: 0 }, NOW).length, 1);
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

test("a quiz is kept as I take it: answered, skipped, moved on, ended, listed, deleted", async () => {
  const db = setup();
  const s = await startStandIn(() => ({
    content: JSON.stringify({ verdict: "right", why: "Yes.", correct: ["It pours."] }),
  }));
  const quiz = startQuiz(db, { area: "learn", packs: ["pack:teapots"], count: 3 }, NOW, () => 0.5);
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
  deleteQuiz(db, other.id);
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
  const quiz = startQuiz(db, { area: "learn", packs: ["pack:teapots"], count: 1 }, NOW, () => 0.5);
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

// a second topic beside the teapots: cups, two lessons with two checks each, and an interview pack elsewhere
function withCups(db: DatabaseSync) {
  const cups = addPack(db, "Cups", "lesson-pack", "pack:cups");
  setPackGroup(db, cups, "Kitchen");
  const two = (id: string) =>
    addLesson(
      db,
      cups,
      `About ${id}`,
      {
        say: [`${id} is a thing.`],
        check: [
          { q: `What is a ${id}?`, a: "A thing." },
          { q: `Why a ${id}?`, a: "To drink." },
        ],
      },
      0,
      id,
    );
  two("mug");
  two("saucer");
  two("beaker");
  const prep = addPack(db, "Kettles", "lesson-pack", "pack:kettles");
  setPackArea(db, prep, "interview");
  addLesson(db, prep, "About whistles", { say: ["It whistles."], check: [{ q: "Why?", a: "Steam." }] }, 0, "whistle");
}

test("picked lessons narrow the quiz to them, going round their checks; nothing outside the pick gets in", () => {
  const db = setup();
  withCups(db);
  const items = pickQuiz(db, { area: "learn", group: "Kitchen", lessons: ["mug", "saucer"], count: 10 }, NOW);
  assert.deepEqual([...new Set(items.map((i) => i.lesson))].sort(), ["mug", "saucer"]);
  // two lessons, two checks each: four questions, none asked twice
  assert.equal(items.length, 4);
  assert.equal(new Set(items.map((i) => i.q)).size, 4);
  // what the start page promises is what is drawn
  assert.equal(questionsIn([{ checks: 2 }, { checks: 2 }], 10, false, true), 4);
  assert.equal(pickQuiz(db, { area: "learn", lessons: ["mug"], count: 1 }, NOW).length, 1);
  // picked packs: only their lessons
  const cups = pickQuiz(db, { area: "learn", packs: ["pack:cups"], count: 30 }, NOW);
  assert.ok(cups.every((i) => i.packName === "Cups"));
  // an id that isn't there, or sits in another area or topic, is refused rather than quietly dropped
  assert.throws(() => pickQuiz(db, { area: "learn", lessons: ["mug", "nope"], count: 5 }, NOW), /isn't in this topic/);
  assert.throws(() => pickQuiz(db, { area: "learn", lessons: ["whistle"], count: 5 }, NOW), /isn't in this topic/);
  assert.throws(() => pickQuiz(db, { area: "learn", group: "Garden", lessons: ["mug"], count: 5 }, NOW), /isn't in/);
  assert.throws(
    () => pickQuiz(db, { area: "learn", packs: ["pack:cups"], lessons: ["spout"], count: 5 }, NOW),
    /isn't in this topic/,
  );
  assert.throws(() => pickQuiz(db, { area: "learn", packs: ["pack:kettles"], count: 5 }, NOW), /pack isn't in/);
  assert.throws(() => pickQuiz(db, { area: "learn", group: "Garden", packs: ["pack:cups"], count: 5 }, NOW), /pack/);
  // the pills' list: every lesson of the area with its checks
  const listed = quizLessons(db, "learn", NOW);
  assert.equal(listed.length, 7);
  assert.deepEqual(
    listed.find((l) => l.id === "mug"),
    {
      id: "mug",
      title: "About mug",
      pack: "pack:cups",
      due: false,
      checks: 2,
    },
  );
});

test("a quiz is named after what it was drawn from", () => {
  const db = setup();
  withCups(db);
  const name = (o: Parameters<typeof startQuiz>[1]) => startQuiz(db, o, NOW).scope;
  assert.equal(name({ area: "learn", count: 5 }), "Everything");
  assert.equal(name({ area: "learn", group: "Kitchen", count: 5 }), "Kitchen");
  assert.equal(name({ area: "learn", group: "Kitchen", lessons: ["mug"], count: 5 }), "About mug");
  // two lessons by their titles, so quizzes on different pairs stay apart; three or more by their count
  assert.equal(
    name({ area: "learn", group: "Kitchen", lessons: ["mug", "saucer"], count: 5 }),
    "About mug + About saucer",
  );
  assert.equal(name({ area: "learn", lessons: ["saucer", "beaker"], count: 1 }), "About saucer + About beaker");
  assert.equal(
    name({ area: "learn", group: "Kitchen", lessons: ["mug", "saucer", "beaker"], count: 5 }),
    "Kitchen · 3 lessons",
  );
  assert.equal(
    name({ area: "learn", packs: ["pack:cups"], lessons: ["mug", "saucer", "beaker"], count: 5 }),
    "Cups · 3 lessons",
  );
  assert.equal(name({ area: "learn", packs: ["pack:cups", "pack:teapots"], count: 5 }), "Cups + Teapots");
});

test("archive takes a quiz off the list and keeps it; restore brings it back; delete keeps what I missed", () => {
  const db = setup();
  // no cap: fourteen quizzes, fourteen on the list
  const quizzes = Array.from({ length: 14 }, () => startQuiz(db, { area: "learn", count: 2 }, NOW));
  assert.equal(listQuizzes(db).length, 14);
  const [a, b] = quizzes;
  const archived = archiveQuiz(db, a.id, new Date("2026-11-23T08:00:00Z"));
  assert.equal(archived.archived, "2026-11-23T08:00:00.000Z");
  assert.equal(archiveQuiz(db, a.id).archived, "2026-11-23T08:00:00.000Z"); // twice: the first moment stays
  assert.ok(!listQuizzes(db).some((q) => q.id === a.id));
  assert.deepEqual(
    listQuizzes(db, { archived: true }).map((q) => q.id),
    [a.id],
  );
  assert.equal(getQuiz(db, a.id)?.items.length, 2); // kept whole
  assert.equal(restoreQuiz(db, a.id).archived, null);
  assert.equal(listQuizzes(db).length, 14);
  assert.equal(listQuizzes(db, { archived: true }).length, 0);

  // delete: the quiz and its Ask talk go; my miss stays, so its lesson still comes back first
  const missed = b.items[0];
  skipQuiz(db, b.id, 0);
  db.prepare(
    "INSERT INTO ask_messages (id, app, ref, role, text, state, at) VALUES ('m1', 'quiz', ?, 'me', 'Why?', 'done', '2026-11-22T12:00:00Z')",
  ).run(`${b.id}:0`);
  deleteQuiz(db, b.id);
  assert.equal(getQuiz(db, b.id), null);
  assert.equal(db.prepare("SELECT count(*) AS n FROM ask_messages").get()?.n, 0);
  assert.equal(pickQuiz(db, { area: "learn", count: 1 }, new Date())[0].lesson, missed.lesson);
  assert.throws(() => archiveQuiz(db, b.id), /isn't there any more/);
  assert.throws(() => deleteQuiz(db, b.id), /isn't there any more/);
});

test("migration 025 lands on a database that already holds quizzes: each stays on the list", () => {
  const base = mkdtempSync(join(tmpdir(), "kestrel-quiz-mig-"));
  const file = join(base, "t.db");
  const db = new DatabaseSync(file);
  // the database as it was before 025: every migration up to 024, and a quiz in it
  const before = join(base, "before");
  mkdirSync(before);
  const all = fileURLToPath(new URL("../../db/migrations/", import.meta.url));
  for (const f of readdirSync(all).filter((f) => Number.parseInt(f, 10) <= 24))
    copyFileSync(join(all, f), join(before, f));
  migrate(db, file, before);
  db.prepare(
    "INSERT INTO quizzes (id, area, scope, items, answers, place, started, updated) VALUES ('q1', 'learn', 'Old', '[]', '[]', 0, ?, ?)",
  ).run(NOW.toISOString(), NOW.toISOString());
  migrate(db, file);
  assert.equal(getQuiz(db, "q1")?.archived, null);
  assert.deepEqual(
    listQuizzes(db).map((q) => q.scope),
    ["Old"],
  );
});
