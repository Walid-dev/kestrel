// The scrub keeps my budget and my note out of every query: a budget in my own words, one I set, one a must-have
// holds, and one the model wrote into a query are all cut; a note word stays when it is a product word; a query left
// with no product word is skipped; a product's own number (Fen 300) stays whatever my budget is.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Need } from "../../shared/shopping.ts";
import { MADE_UP_NEED } from "./made-up.ts";
import { budgetIn, holdsMine, moneyless, scrubContext, scrubQuery } from "./scrub.ts";

const want = (words: string, budget: number | null = null, note = "") => ({ words, budget, note });

test("a budget in my words, in a must-have and in a model-written query is cut, in every form", () => {
  const inWords = scrubContext(want("a quiet blender under $150 for smoothies"), null);
  assert.equal(scrubQuery("quiet blender under $150 smoothies", inWords), "quiet blender smoothies");
  assert.equal(scrubQuery("quiet blender 150 smoothies", inWords), "quiet blender smoothies");
  const set = scrubContext(want("a robot vacuum for pet hair", 600), MADE_UP_NEED);
  for (const q of [
    "robot vacuum under 600",
    "robot vacuum $600",
    "robot vacuum 600.00",
    "robot vacuum max 600 dollars",
    "robot vacuum budget",
  ])
    assert.equal(scrubQuery(q, set), "robot vacuum", q);
  const hard: Need = { ...MADE_UP_NEED, hard: [{ criterion: "", says: "the price under 450" }] };
  assert.equal(scrubQuery("robot vacuum 450", scrubContext(want("a robot vacuum"), hard)), "robot vacuum");
  assert.equal(moneyless("a robot vacuum for pet hair under $600"), "a robot vacuum for pet hair");
  assert.equal(budgetIn("a laptop under $1,200"), 1200);
  // a size after "under" is a spec, not a price
  assert.equal(scrubQuery("laptop under 2 kg", scrubContext(want("a laptop", 300), null)), "laptop under 2 kg");
});

test("a note word goes unless it is a product word; a query with no product word left is skipped", () => {
  const ctx = scrubContext(
    want("a robot vacuum for carpet", null, "mostly carpet upstairs; the cat is called Pixel"),
    MADE_UP_NEED,
  );
  assert.equal(scrubQuery("robot vacuum carpet cat Pixel upstairs", ctx), "robot vacuum carpet");
  assert.equal(scrubQuery("Pixel the cat", ctx), null);
  assert.equal(scrubQuery("best pizza near me", ctx), null);
});

test("a product's own number stays, its name masked; an address holding my budget or note is caught", () => {
  const ctx = scrubContext(want("a robot vacuum", 300, "for Grandma Ines"), MADE_UP_NEED, [
    { name: "Fen 300", models: ["F300"] },
  ]);
  assert.equal(scrubQuery('"Fen 300" site:store.example', ctx), '"Fen 300" site:store.example');
  assert.equal(scrubQuery("robot vacuum 300", ctx), "robot vacuum");
  assert.equal(holdsMine("https://store.example/search?q=vacuum+under+300", ctx), true);
  assert.equal(holdsMine("https://store.example/gift-for-ines", ctx), true);
  assert.equal(holdsMine("https://store.example/p/fen-300", ctx), false); // the product's own name, not my budget
  assert.equal(holdsMine("https://store.example/deals/300", ctx), true);
  assert.equal(holdsMine("https://store.example/p/f300-robot-vacuum", ctx), false);
});
