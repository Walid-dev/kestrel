// Every case's good answer passes; every bad one fails for its named reason.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { type Case, score } from "./score.ts";

const { cases, listings, dealListings } = JSON.parse(
  readFileSync(new URL("./cases.json", import.meta.url), "utf8"),
) as {
  cases: Case[];
  listings: { id: string }[];
  dealListings: { id: string }[];
};
const ids = [...listings, ...dealListings].map((l) => l.id);

for (const c of cases) {
  test(`${c.name}: good passes, bad fails (${c.badWhy})`, () => {
    assert.deepEqual(score(c, c.good, ids), { pass: true, reasons: [] });
    const bad = score(c, c.bad, ids);
    assert.equal(bad.pass, false);
    assert.ok(
      bad.reasons.some((r) => r.includes(c.badWhy)),
      bad.reasons.join(" | "),
    );
  });
}
