// A made-up old folder converts into packs, a rerun updates instead of doubling, and junk is skipped by name.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../../db/migrate.ts";
import { importAnswers, importGuide, importOldLearn } from "./import-learn.ts";
import { getLesson, listLessons, listPacks } from "./lessons.ts";

function setup() {
  const base = mkdtempSync(join(tmpdir(), "kestrel-import-learn-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  return db;
}

const OLD = [
  {
    id: "smoke-first",
    topic: "hive care",
    title: "Smoke before opening",
    short: "Smoke calms the hive.",
    say: ["Puff twice at the door.", "Wait a minute before lifting the lid."],
    explain: ["The smell masks the alarm signal."],
    example: "Two puffs, one minute, a calm box.",
    words: [{ w: "smoker", m: "the can that makes cool smoke" }],
    check: [{ q: "What do you do before opening?", a: "Smoke the door and wait a minute." }],
    related: ["dropped-on-purpose"],
  },
  { id: "water-near", topic: "hive care", title: "Water within reach", say: ["Keep water close."] },
  { id: "winter-weight", topic: "seasons", title: "Weigh before winter", explain: ["A light hive starves."] },
  { topic: "seasons", say: ["No title here."] },
];

test("the old lessons become packs by topic, the short opens the explanation, a rerun never doubles", () => {
  const db = setup();
  const first = importOldLearn(db, OLD);
  assert.deepEqual([first.packs, first.lessons], [2, 3]);
  assert.equal(first.skipped.length, 1); // the titleless one, by name
  const packs = listPacks(db);
  assert.deepEqual(
    packs.map((p) => [p.name, p.kind, p.lessons]),
    [
      ["hive care", "lesson-pack", 2],
      ["seasons", "lesson-pack", 1],
    ],
  );
  const lesson = getLesson(db, "old:hive-care/smoke-first");
  assert.ok(lesson);
  assert.deepEqual(lesson.body.explain, ["Smoke calms the hive.", "The smell masks the alarm signal."]);
  assert.deepEqual(lesson.body.words, [{ w: "smoker", m: "the can that makes cool smoke" }]);
  // the rerun lands an edit, not a twin
  const edited = structuredClone(OLD);
  edited[0].title = "Smoke first, always";
  const again = importOldLearn(db, edited);
  assert.equal(again.lessons, 3);
  assert.equal(listLessons(db, "old:hive-care").length, 2);
  assert.equal(getLesson(db, "old:hive-care/smoke-first")?.title, "Smoke first, always");
});

const GUIDE = {
  meta: { title: "Beekeeping terms" },
  parts: [
    {
      sections: [
        {
          blocks: [
            { type: "lines", lines: ["prose that stays in the old page"] },
            {
              type: "entry",
              id: "brood",
              term: "Brood",
              explain: ["The unhatched young.", { like: "Like a nursery floor of the hive." }],
              example: ["The middle frames hold the brood."],
              check: { q: "Where does the brood sit?", a: "On the middle frames." },
            },
            { type: "entry", term: "", explain: ["skipped: no term"] },
          ],
        },
      ],
    },
  ],
  glossary: [
    { term: "super", meaning: "the box where honey is stored" },
    { term: "frame", meaning: "one hanging comb holder" },
  ],
};

test("a guide's entries become lessons, the analogy line reads plain, the glossary closes the pack", () => {
  const db = setup();
  const got = importGuide(db, GUIDE);
  assert.deepEqual([got.packs, got.lessons, got.skipped.length], [1, 2, 1]);
  const brood = getLesson(db, "guide:beekeeping-terms/brood");
  assert.ok(brood);
  assert.deepEqual(brood.body.explain, ["The unhatched young.", "Like a nursery floor of the hive."]);
  assert.deepEqual(brood.body.check, [{ q: "Where does the brood sit?", a: "On the middle frames." }]);
  const words = getLesson(db, "guide:beekeeping-terms/words");
  assert.equal(words?.body.words.length, 2);
  assert.equal(importGuide(db, GUIDE).lessons, 2); // the rerun updates in place
  assert.equal(listLessons(db, "guide:beekeeping-terms").length, 2);
});

const ANSWERS = `Q: Why did you pick cedar for the boxes?
W: material choices
M: They want to know why you chose this wood.
P: Light and it does not rot.
A: Cedar stays light when the box is full.
A: And it shrugs off rain without paint.
K: no paint needed

Q: How do you find the queen?
A: I look for the longest back on the busiest frame,
   checking the brood frames first.

K: a key point without its question or answer
`;

test("an answer file becomes an answer-pack: say lines, the checked point, a junk block skipped by name", () => {
  const db = setup();
  const got = importAnswers(db, "made-up interview", ANSWERS);
  assert.deepEqual([got.packs, got.lessons], [1, 2]);
  assert.equal(got.skipped.length, 1);
  const packs = listPacks(db);
  assert.deepEqual(
    packs.map((p) => [p.name, p.kind]),
    [["made-up interview", "answer-pack"]],
  );
  const cedar = getLesson(db, "answers:made-up-interview/why-did-you-pick-cedar-for-the-boxes");
  assert.ok(cedar);
  assert.deepEqual(cedar.body.say, [
    "Cedar stays light when the box is full.",
    "And it shrugs off rain without paint.",
  ]);
  assert.deepEqual(cedar.body.explain, [
    "They want to know why you chose this wood.",
    "Light and it does not rot.",
    "They check: material choices",
  ]);
  assert.equal(cedar.body.example, "no paint needed");
  assert.deepEqual(cedar.body.check, [
    { q: "Why did you pick cedar for the boxes?", a: "Cedar stays light when the box is full." },
  ]);
  // a continuation line folds into its A line
  const queen = getLesson(db, "answers:made-up-interview/how-do-you-find-the-queen");
  assert.equal(
    queen?.body.say[0],
    "I look for the longest back on the busiest frame, checking the brood frames first.",
  );
});

test("two sources minting one id collide: the later is skipped by name, counted once (sweep)", () => {
  const db = setup();
  const twins = [
    { id: "same", topic: "hive care", title: "First words", say: ["one"] },
    { id: "same", topic: "hive care", title: "Second words", say: ["two"] },
  ];
  const got = importOldLearn(db, twins);
  assert.equal(got.lessons, 1);
  assert.equal(got.skipped.length, 1);
  assert.match(got.skipped[0], /same/);
  assert.equal(getLesson(db, "old:hive-care/same")?.title, "First words"); // the first stands
  const answers = "Q: One question?\nA: First answer.\n\nQ: One question?\nA: Second answer.\n";
  const a = importAnswers(db, "made-up twins", answers);
  assert.equal(a.lessons, 1);
  assert.equal(a.skipped.length, 1);
});
