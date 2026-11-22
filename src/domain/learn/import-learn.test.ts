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
import { importOldProgress } from "./review.ts";

function setup() {
  const base = mkdtempSync(join(tmpdir(), "kestrel-import-learn-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  return db;
}

const OLD = [
  {
    id: "smoke-first",
    topic: "care",
    title: "Smoke before opening",
    short: "Smoke calms the hive.",
    say: ["Puff twice at the door.", "Wait a minute before lifting the lid."],
    explain: ["The smell masks the alarm signal."],
    example: "Two puffs, one minute, a calm box.",
    words: [{ w: "smoker", m: "the can that makes cool smoke" }],
    check: [{ q: "What do you do before opening?", a: "Smoke the door and wait a minute." }],
    related: ["dropped-on-purpose"],
  },
  { id: "water-near", topic: "care", title: "Water within reach", say: ["Keep water close."] },
  { id: "my-yard", topic: "yard", title: "My own yard", explain: ["About my yard."] },
  { topic: "yard", say: ["No title here."] },
];

test("the old lessons become packs named by their labels; a topic can go to Interview prep; a rerun never doubles", () => {
  const db = setup();
  const first = importOldLearn(db, OLD, { labels: { care: "Hive care" }, interviewTopics: ["yard"] });
  assert.deepEqual([first.packs, first.lessons], [2, 3]);
  assert.equal(first.skipped.length, 1); // the titleless one, by name
  assert.deepEqual(
    listPacks(db).map((p) => [p.name, p.area, p.lessons]),
    [
      ["Hive care", "learn", 2],
      ["Yard", "interview", 1], // no label: the first letter goes up
    ],
  );
  const lesson = getLesson(db, "old:care/smoke-first");
  assert.ok(lesson);
  assert.equal(lesson.body.short, "Smoke calms the hive."); // the lede, apart from the explanation
  assert.deepEqual(lesson.body.explain, ["The smell masks the alarm signal."]);
  assert.equal(lesson.body.eyebrow, "Hive care");
  const edited = structuredClone(OLD);
  edited[0].title = "Smoke first, always";
  assert.equal(importOldLearn(db, edited).lessons, 3);
  assert.equal(listLessons(db, "old:care").length, 2);
  assert.equal(getLesson(db, "old:care/smoke-first")?.title, "Smoke first, always");
});

test("the old progress lands on the imported lessons by their own id; a stranger is named", () => {
  const db = setup();
  importOldLearn(db, OLD);
  const got = importOldProgress(db, {
    "p:smoke-first": { level: 2, due: "2026-11-25", seen: "2026-11-22" },
    "p:nowhere": { level: 1, due: "2026-11-23" },
    "note:other": {},
  });
  assert.equal(got.landed, 1);
  assert.equal(got.skipped.length, 1);
  const r = db.prepare("SELECT level, interval_days FROM reviews WHERE lesson = 'old:care/smoke-first'").get() as {
    level: number;
    interval_days: number;
  };
  assert.equal(r.level, 2);
  assert.equal(r.interval_days, 3);
});

const GUIDE = {
  meta: { title: "Beekeeping terms" },
  intro: { id: "start", title: "How to use this guide", blocks: [{ type: "lines", lines: ["Read one topic a day."] }] },
  parts: [
    {
      title: "The hive",
      sections: [
        {
          id: "inside",
          num: "1",
          title: "Inside the hive",
          short: "What lives where.",
          blocks: [
            { type: "lines", lines: ["The hive is a stack of boxes."] },
            {
              type: "entry",
              id: "brood",
              term: "Brood",
              explain: ["The unhatched young.", { like: "Like a nursery floor of the hive." }],
              example: ["The middle frames hold the brood."],
              diagram: { w: 300, h: 100, nodes: [{ x: 10, y: 10, w: 80, h: 40, t: "Brood" }], edges: [] },
              check: { q: "Where does the brood sit?", a: ["On the middle frames."] },
            },
          ],
        },
      ],
    },
  ],
  glossary: [
    { term: "super", meaning: "the box where honey is stored" },
    { term: "frame", meaning: "one hanging comb holder" },
  ],
  references: [{ title: "A made-up handbook", url: "https://example.com/handbook" }],
};

test("a guide becomes its topic pages: blocks and diagrams kept, checks gathered, glossary and references close it", () => {
  const db = setup();
  const got = importGuide(db, GUIDE);
  assert.deepEqual([got.packs, got.lessons], [1, 4]); // intro, one topic, glossary, references
  const topic = getLesson(db, "guide:beekeeping-terms/inside");
  assert.ok(topic);
  assert.equal(topic.body.part, "Part I · The hive");
  assert.equal(topic.body.eyebrow, "Part I · Topic 1");
  assert.equal(topic.body.short, "What lives where.");
  assert.equal(topic.body.blocks.length, 2);
  assert.ok((topic.body.blocks[1] as { diagram?: unknown }).diagram, "the diagram travels with its entry");
  assert.deepEqual(topic.body.check, [{ q: "Where does the brood sit?", a: "On the middle frames." }]);
  assert.equal(getLesson(db, "guide:beekeeping-terms/words")?.body.words.length, 2);
  assert.equal(getLesson(db, "guide:beekeeping-terms/references")?.body.blocks.length, 1);
  assert.equal(importGuide(db, GUIDE).lessons, 4); // the rerun updates in place
  assert.equal(listLessons(db, "guide:beekeeping-terms").length, 4);
});

test("a guide owns its pack: a lesson it no longer mints goes", () => {
  const db = setup();
  importGuide(db, GUIDE);
  db.prepare(
    "INSERT INTO lessons (id, pack, position, title, body, added_at) VALUES ('guide:beekeeping-terms/brood', 'guide:beekeeping-terms', 9, 'An older entry lesson', '{}', '2026-11-01')",
  ).run();
  const again = importGuide(db, GUIDE);
  assert.equal(getLesson(db, "guide:beekeeping-terms/brood"), null);
  assert.match(again.skipped.join(" "), /replaced/);
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

test("an answer file becomes an answer-pack in Interview prep: say lines, the checked point, a junk block named", () => {
  const db = setup();
  const got = importAnswers(db, "made-up interview", ANSWERS);
  assert.deepEqual([got.packs, got.lessons], [1, 2]);
  assert.equal(got.skipped.length, 1);
  assert.deepEqual(
    listPacks(db).map((p) => [p.name, p.kind, p.area]),
    [["Made-up interview", "answer-pack", "interview"]],
  );
  const cedar = getLesson(db, "answers:made-up-interview/why-did-you-pick-cedar-for-the-boxes");
  assert.ok(cedar);
  assert.deepEqual(cedar.body.say, [
    "Cedar stays light when the box is full.",
    "And it shrugs off rain without paint.",
  ]);
  assert.equal(cedar.body.eyebrow, "material choices");
  assert.equal(cedar.body.short, "They want to know why you chose this wood.");
  assert.deepEqual(cedar.body.explain, ["Light and it does not rot."]);
  assert.equal(cedar.body.example, "no paint needed");
  assert.deepEqual(cedar.body.check, [
    { q: "Why did you pick cedar for the boxes?", a: "Cedar stays light when the box is full." },
  ]);
  const queen = getLesson(db, "answers:made-up-interview/how-do-you-find-the-queen");
  assert.equal(
    queen?.body.say[0],
    "I look for the longest back on the busiest frame, checking the brood frames first.",
  );
});

test("two sources minting one id collide: the later is skipped by name, counted once (sweep)", () => {
  const db = setup();
  const twins = [
    { id: "same", topic: "care", title: "First words", say: ["one"] },
    { id: "same", topic: "care", title: "Second words", say: ["two"] },
  ];
  const got = importOldLearn(db, twins);
  assert.equal(got.lessons, 1);
  assert.equal(got.skipped.length, 1);
  assert.match(got.skipped[0], /same/);
  assert.equal(getLesson(db, "old:care/same")?.title, "First words"); // the first stands
  const answers = "Q: One question?\nA: First answer.\n\nQ: One question?\nA: Second answer.\n";
  const a = importAnswers(db, "made-up twins", answers);
  assert.equal(a.lessons, 1);
  assert.equal(a.skipped.length, 1);
});
