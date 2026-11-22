// An old deal spec becomes a kestrel search that runs the old collector through node with the old engine's knobs,
// and anything that isn't a deal run by a collector is skipped. Made-up specs only.
import assert from "node:assert/strict";
import { test } from "node:test";
import { dealSpecFromV1 } from "./convert-v1-specs.ts";

const SPEC = `spec_version: 1
kind: deal
fetch: script
collector: made-up-market
hunt: Teapots
category: Copper
term: copper teapot
require: teapot, kettle
min_price: 40
max_price: 300
max_age_days: 5
exclude: lid only, replica
pages: 3
schedule: 09:00,21:00
---
Somewhere near Made-up Town. A copper teapot in good shape.
`;

test("an old deal spec becomes a search run only when asked, with the old knobs and rules", () => {
  const made = dealSpecFromV1(SPEC, "/old/specs/copper-teapot.md", "/old/collectors");
  assert.ok(made);
  assert.equal(made.id, "copper-teapot");
  assert.equal(made.spec.name, "Copper · made-up-market");
  assert.deepEqual(made.spec.args, ["node", "/old/collectors/made-up-market.mjs", "/old/specs/copper-teapot.md"]);
  assert.equal(made.spec.auto, false);
  assert.equal(made.spec.everyMinutes, 720);
  assert.equal(made.spec.env.HUNT_TERM, "copper teapot");
  assert.equal(made.spec.env.HUNT_PAGES, "3");
  assert.equal(made.spec.env.HUNT_MAX_PRICE, "300");
  assert.equal(made.spec.limits.timeoutMs, 180_000);
  assert.deepEqual(made.spec.scoring, {
    title: { want: ["teapot", "kettle"], avoid: ["lid only", "replica"] },
    price: { cap: 300, floor: 40 },
    freshDays: 5,
  });
  assert.equal(made.spec.hunt, "Teapots");
});

test("a spec that isn't a deal run by a collector is skipped", () => {
  assert.equal(dealSpecFromV1(SPEC.replace("kind: deal", "kind: job"), "/x/a.md", "/c"), null);
  assert.equal(dealSpecFromV1(SPEC.replace("fetch: script", "fetch: web"), "/x/a.md", "/c"), null);
});
