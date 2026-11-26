// The ranking on made-up products: the finalists by gate and score, coverage breaking a tie, the rest below the list;
// each label's rule, best value never under the quality floor; a must-have failed or unknown; coverage under half bars
// the top label; option weights replace the category's and scale back to 100; a draft's six; an answer re-ranks; a
// close trio scored by ratio, Budget never dearer than the best overall, a question that never moves the top.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Evidence, Fact, Need } from "../../shared/shopping.ts";
import { deciding, type RankProduct, rank, weightsFor } from "./rank.ts";

const NEED: Need = {
  mode: "compare",
  category: "made-up",
  name: "Made-up vacuum",
  draft: false,
  product: "",
  use: "",
  hard: [],
  implied: [],
  questions: [
    {
      key: "quiet",
      q: "Does noise matter?",
      options: [
        { label: "A lot", weights: { noise: 60 } },
        { label: "Not much", weights: {} },
      ],
      default: 1,
    },
  ],
  criteria: [
    { key: "a", label: "Carpet", type: "score", better: "higher", weight: 40 },
    { key: "b", label: "Hard floors", type: "score", better: "higher", weight: 30 },
    { key: "noise", label: "Noise", type: "number", unit: "dB", measured: true, better: "lower", weight: 10 },
    { key: "mop", label: "Mop", type: "bool", better: "higher", weight: 20 },
  ],
  uses: { quiet: { noise: 40 } },
  searchWords: "made-up vacuum",
  listSize: 3,
  tags: [],
  traps: [],
  sources: [],
  storeGroups: [],
  refreshMonths: 12,
};
const EV: Evidence = { sources: 2, a: 1, b: 1, newest: "2026-10", thin: false, old: false, refs: ["s1", "s2"] };
const fact = (v: number | boolean): Fact => ({ v, ref: "s1", quote: String(v) });
const p = (
  id: string,
  f: Partial<Record<"a" | "b" | "noise" | "mop", number | boolean>>,
  price: number | null,
): RankProduct => ({
  id,
  facts: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, fact(v as number | boolean)])),
  price,
  evidence: EV,
});
const FIVE = [
  p("P1", { a: 90, b: 90, noise: 60, mop: true }, 50_000),
  p("P2", { a: 85, b: 88, noise: 62, mop: true }, 40_000),
  p("P3", { a: 70, b: 60, noise: 65, mop: false }, 20_000),
  p("P4", { a: 100, b: 80, noise: 70, mop: true }, 90_000),
  p("P5", { a: 40, b: 30, noise: 50, mop: false }, 9_000),
];
const byId = (r: ReturnType<typeof rank>) => Object.fromEntries(r.map((x) => [x.id, x]));

test("finalists by gate and score, the rest below the list; best overall, value, budget and premium by their rules", () => {
  const r = byId(rank(NEED, {}, FIVE));
  assert.deepEqual(
    ["P1", "P4", "P2"].map((id) => r[id].place),
    [1, 2, 3],
  );
  assert.equal(r.P3.out, "ranked below the list's 3");
  assert.equal(r.P5.place, null);
  assert.deepEqual(
    r.P1.labels.map((l) => l.key),
    ["overall"],
  );
  // value: near the top and cheaper than the best overall; budget: the cheapest above the floor (two labels at most)
  assert.deepEqual(
    r.P2.labels.map((l) => l.key),
    ["value", "budget"],
  );
  // premium: clearly better on the criterion that weighs most, for more money
  assert.deepEqual(
    r.P4.labels.map((l) => l.key),
    ["premium"],
  );
});

test("best value and budget are never named under the quality floor", () => {
  const r = byId(
    rank(NEED, {}, [
      p("P1", { a: 90, b: 90, noise: 60, mop: true }, 50_000),
      p("P6", { a: 40, b: 30, noise: 50, mop: false }, 9_000),
    ]),
  );
  assert.deepEqual(r.P6.labels, []);
  assert.equal(r.P6.place, 2);
});

test("a must-have failed sends a product to also considered with its reason; an unknown is a flag, never a pass", () => {
  const need: Need = { ...NEED, listSize: 8, hard: [{ criterion: "mop", says: "must mop", is: true }] };
  const r = byId(
    rank(
      need,
      {},
      [
        p("P1", { a: 90, b: 90, noise: 60, mop: true }, 50_000),
        p("P3", { a: 70, b: 60, noise: 65, mop: false }, 20_000),
        p("P8", { a: 80, b: 80, noise: 61 }, null),
        p("P4", { a: 100, b: 80, noise: 70, mop: true }, 90_000),
      ],
      600,
    ),
  );
  assert.equal(r.P3.out, "no mop");
  assert.equal(r.P4.out, "over the budget");
  assert.equal(r.P8.out, "");
  assert.deepEqual(r.P8.flags, ["price unknown: the budget can't be checked", "must mop: no source says"]);
  assert.equal(r.P1.place, 1);
});

test("coverage under half bars the top label; coverage breaks a tie in score", () => {
  const r = byId(
    rank({ ...NEED, listSize: 8 }, {}, [
      p("Q1", { noise: 50 }, 30_000),
      p("Q2", { a: 90, b: 90, noise: 60, mop: true }, 40_000),
      p("Q3", { a: 70, b: 50, noise: 70, mop: false }, 20_000),
    ]),
  );
  assert.equal(r.Q1.place, 1); // its one known value is the best: a perfect score on a tenth of the weight
  assert.deepEqual(r.Q1.labels, []);
  assert.equal(r.Q2.labels[0]?.key, "overall");
  const tie = byId(
    rank({ ...NEED, listSize: 8 }, {}, [
      p("T1", { a: 80 }, null),
      p("T2", { a: 80, b: 70 }, null),
      p("T3", { a: 60, b: 70 }, null),
    ]),
  );
  assert.ok((tie.T2.place ?? 9) < (tie.T1.place ?? 9));
});

test("a use's and an answer's weights replace the category's and scale back to 100", () => {
  assert.deepEqual(weightsFor({ ...NEED, use: "quiet" }, { quiet: 1 }), {
    a: 30.76923076923077,
    b: 23.076923076923077,
    noise: 30.76923076923077,
    mop: 15.384615384615385,
  });
  const w = weightsFor(NEED, { quiet: 0 });
  assert.equal(Math.round(w.noise), 40);
  assert.equal(Math.round(Object.values(w).reduce((x, y) => x + y, 0)), 100);
});

test("a draft's six finalists; an answer re-ranks; best for the need an answer names", () => {
  const eight = Array.from({ length: 8 }, (_, i) =>
    p(`D${i}`, { a: 50 + i * 5, b: 90 - i * 5, noise: 50 + i, mop: i % 2 === 0 }, 20_000 + i * 5000),
  );
  const draft = rank({ ...NEED, draft: true, listSize: 6 }, {}, eight);
  assert.equal(draft.filter((r) => r.place !== null).length, 6);
  assert.equal(draft.filter((r) => r.out === "ranked below the list's 6").length, 2);
  const before = rank({ ...NEED, listSize: 8 }, {}, FIVE)
    .sort((x, y) => (x.place ?? 9) - (y.place ?? 9))
    .map((r) => r.id);
  const after = rank({ ...NEED, listSize: 8 }, { quiet: 0 }, FIVE);
  assert.notDeepEqual(
    after.sort((x, y) => (x.place ?? 9) - (y.place ?? 9)).map((r) => r.id),
    before,
  );
  // noise named by my answer: its best finalist that isn't the best overall is best for it
  const quiet = byId(after);
  const lead = after.find((r) => r.labels.some((l) => l.key === "overall"))?.id;
  const forNoise = after.find((r) => r.labels.some((l) => l.text === "Best for noise"));
  assert.ok(forNoise && forNoise.id !== lead, JSON.stringify(after.map((r) => [r.id, r.labels])));
  assert.equal(
    quiet.P5.labels.some((l) => l.text === "Best for noise"),
    true,
  );
});

test("by ratio, not by spread: a nearly-as-good cheaper product is best value, the lowest of three close ones isn't 0", () => {
  const two = { ...NEED, criteria: NEED.criteria.slice(0, 2), questions: [] };
  const r = byId(
    rank(two, {}, [
      p("X1", { a: 90, b: 90 }, 50_000),
      p("X2", { a: 88, b: 88 }, 30_000),
      p("X3", { a: 87, b: 87 }, 25_000),
    ]),
  );
  assert.equal(r.X1.labels[0]?.key, "overall");
  assert.ok((r.X3.score ?? 0) > 90, `X3 scored ${r.X3.score}`);
  assert.ok(
    [...r.X2.labels, ...r.X3.labels].some((l) => l.key === "value"),
    JSON.stringify([r.X2.labels, r.X3.labels]),
  );
});

test("Budget never goes to a product dearer than the best overall", () => {
  const two = { ...NEED, criteria: NEED.criteria.slice(0, 2), questions: [] };
  const r = byId(
    rank(two, {}, [
      p("LEAD", { a: 90, b: 90 }, 30_000),
      p("X", { a: 89, b: 89 }, 45_000),
      p("Y", { a: 70, b: 70 }, 60_000),
    ]),
  );
  assert.equal(r.LEAD.labels[0]?.key, "overall");
  assert.ok(!r.X.labels.some((l) => l.key === "budget"), JSON.stringify(r.X.labels));
  assert.ok(!r.Y.labels.some((l) => l.key === "budget"), JSON.stringify(r.Y.labels));
});

test("a question whose every option keeps the same top pick doesn't decide; one that moves it does", () => {
  const need: Need = {
    ...NEED,
    questions: [
      ...NEED.questions,
      {
        key: "mop",
        q: "Mop too?",
        options: [
          { label: "Yes", weights: { mop: 25 } },
          { label: "No", weights: { mop: 15 } },
        ],
        default: 0,
      },
    ],
  };
  const products = [
    p("A", { a: 95, b: 90, noise: 70, mop: true }, 50_000),
    p("B", { a: 80, b: 80, noise: 45, mop: true }, 40_000),
  ];
  assert.deepEqual([...deciding(need, {}, products)], ["quiet"]);
});
