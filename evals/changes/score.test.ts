// Every case's hand-written good answer passes, and its bad one fails with the named reason.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { type Case, score } from "./score.ts";

const cases = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url), "utf8")) as Case[];

test("the cases cover the plan's mix", () => {
  assert.ok(cases.length >= 6 && cases.length <= 8);
  assert.ok(cases.filter((c) => c.documents.length >= 2).length >= 2);
  assert.ok(cases.some((c) => c.documents.some((d) => d.text.length > 25_000)));
});

for (const c of cases) {
  test(`${c.name}: the good answer passes, the bad one fails for the right reason`, () => {
    const good = score(c, c.good);
    assert.deepEqual(good, { pass: true, reasons: [] });
    const bad = score(c, c.bad);
    assert.equal(bad.pass, false);
    assert.ok(
      bad.reasons.some((r) => r.includes(c.badWhy)),
      `wanted "${c.badWhy}" among: ${bad.reasons.join(" | ")}`,
    );
  });
}
