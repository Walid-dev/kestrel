// The good answer passes; every bad one fails for its named reason. Each bad answer is the good one with one part
// changed: the pick, the opening, or one story's fields. The code's own checks run in between, as in the app.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { BriefAnswer, PickAnswer } from "../../src/ai/news/shape.ts";
import { assemble, readPick } from "../../src/domain/news/compose.ts";
import { type Expect, itemsOf, type MadeItem, score } from "./score.ts";

type Patch = { pick?: unknown; opening?: string[]; story?: { n: number } & Record<string, unknown> };
type Answers = { pick: unknown; write: { opening: string[]; stories: { story: number }[] } };
const data = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url), "utf8")) as {
  expect: Expect;
  items: MadeItem[];
  good: Answers;
  cases: { name: string; badWhy: string; bad: Patch }[];
};
const items = itemsOf(data.items, new Date("2026-11-24T06:30:00Z"));

function judge(answers: Answers) {
  const pick = PickAnswer.parse(answers.pick);
  const written = BriefAnswer.parse(answers.write);
  const picked = readPick(pick, items);
  const { brief } = assemble(items, picked, written, []);
  return score(data.expect, { pick, picked, written, brief });
}

const badOf = (patch: Patch): Answers => {
  const { n, ...fields } = patch.story ?? { n: 0 };
  return {
    pick: patch.pick ?? data.good.pick,
    write: {
      ...data.good.write,
      opening: patch.opening ?? data.good.write.opening,
      stories: data.good.write.stories.map((s) => (s.story === n ? { ...s, ...fields } : s)),
    },
  };
};

test("the good answer passes", () => {
  assert.deepEqual(judge(data.good), { pass: true, reasons: [] });
});

for (const c of data.cases)
  test(`${c.name}: the bad answer fails (${c.badWhy})`, () => {
    const bad = judge(badOf(c.bad));
    assert.equal(bad.pass, false);
    assert.ok(
      bad.reasons.some((r) => r.includes(c.badWhy)),
      bad.reasons.join(" | "),
    );
  });
