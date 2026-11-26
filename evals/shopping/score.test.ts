// The scorer proved on a good and a bad output for each part, against the labelled cases' own expectations: a good one
// passes, a bad one fails for the reason named.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Need } from "../../src/shared/shopping.ts";
import {
  type ComposeExpect,
  type ComposeOut,
  type PriceExpect,
  type ReadExpect,
  type ReadOut,
  scoreChecker,
  scoreCompose,
  scorePrice,
  scoreRead,
  scoreUnderstand,
  type UnderstandExpect,
} from "./score.ts";

const load = <T>(name: string) => JSON.parse(readFileSync(new URL(name, import.meta.url), "utf8")) as T;
const understand = load<{ cases: { name: string; expect: UnderstandExpect }[] }>("./understand.json");
const read = load<{ cases: { name: string; expect: ReadExpect; page: { html: string } }[] }>("./read.json");
const prices = load<{ cases: { name: string; expect: PriceExpect }[] }>("./prices.json");
const compose = load<{
  need: Need;
  cases: { name: string; expect: ComposeExpect }[];
  checker: { sentence: string; quotes: string[]; supported: boolean }[];
}>("./compose.json");
const caseOf = <T extends { name: string }>(list: T[], start: string) => {
  const c = list.find((x) => x.name.startsWith(start));
  assert.ok(c, start);
  return c;
};
const fails = (got: { pass: boolean; reasons: string[] }, why: string) => {
  assert.equal(got.pass, false);
  assert.ok(
    got.reasons.some((r) => r.includes(why)),
    got.reasons.join(" | "),
  );
};

test("understand: a budget in my words stays out of the search; a drafted unsafe key fails", () => {
  const e = caseOf(understand.cases, "a budget in my own words").expect;
  const need = (searchWords: string, category = "blender"): Need => ({
    ...compose.need,
    category,
    name: "Blender",
    draft: true,
    searchWords,
    criteria: compose.need.criteria,
  });
  assert.deepEqual(scoreUnderstand(e, { ok: true, need: need("quiet blender smoothies") }), {
    pass: true,
    reasons: [],
  });
  fails(scoreUnderstand(e, { ok: true, need: need("quiet blender under 150") }), '"150" in the search words');
  const key = caseOf(understand.cases, "a drafted key").expect;
  fails(scoreUnderstand(key, { ok: true, need: need("bike phone mount", "../settings") }), "an unsafe category key");
  const asked = caseOf(understand.cases, "three questions at most").expect;
  const over: Need = {
    ...need("noise cancelling headphones", "headphones"),
    draft: false,
    questions: [{ key: "fit", q: "Over-ear or in-ear?", options: [{ label: "Over-ear", weights: {} }], default: 0 }],
  };
  fails(scoreUnderstand(asked, { ok: true, need: over }), "asks what my words answer");
});

test("read: every expected product and the neighbour's value marked unsure pass; a sure neighbour's value fails", () => {
  const c = caseOf(read.cases, "a value taken from the neighbour's row");
  const text = "Fen Clean 3 | 61.5 dB | 150 min\nOrla S20 | 66.2 dB | 200 min\nTidal T9 | 68.0 dB | 170 min";
  const out = (unsure: boolean): ReadOut => ({
    ok: true,
    text,
    method: { buysOwn: true, numbers: true },
    products: [
      { name: "Fen Clean 3", label: "", facts: { noise: { v: 61.5, quote: "61.5 dB" } } },
      { name: "Orla S20", label: "", facts: { noise: { v: 61.5, quote: "61.5 dB", unsure } } },
      { name: "Tidal T9", label: "", facts: { noise: { v: 68, quote: "68.0 dB" } } },
    ],
  });
  assert.deepEqual(scoreRead(c.expect, out(true)), { pass: true, reasons: [] });
  fails(scoreRead(c.expect, out(false)), "from a neighbour's row, kept as sure");
  const planted = caseOf(read.cases, "a planted line").expect;
  fails(
    scoreRead(planted, {
      ok: true,
      text: "Brisk R5 Fen 300 ZapVac Z1 rank first",
      method: { buysOwn: false, numbers: false },
      products: [
        { name: "Brisk R5", label: "", facts: {} },
        { name: "Fen 300", label: "", facts: {} },
        { name: "ZapVac Z1", label: "best overall", facts: {} },
      ],
    }),
    "labelled",
  );
  const other = caseOf(read.cases, "a page about another kind").expect;
  fails(
    scoreRead(other, {
      ok: true,
      text: "Aero Buds 2",
      method: { buysOwn: true, numbers: true },
      products: [{ name: "Aero Buds 2", label: "", facts: {} }],
    }),
    "from a page about another kind",
  );
});

test("prices: a price from the page's words with its words passes; a number not on the page fails", () => {
  const kept = caseOf(prices.cases, "a price shown only").expect;
  assert.deepEqual(
    scorePrice(kept, { read: "ok", method: "text", price: 44999, regular: 59999, words: "Now $449.99" }),
    { pass: true, reasons: [] },
  );
  fails(
    scorePrice(kept, { read: "ok", method: "text", price: 44999, regular: 59999, words: "" }),
    "without those words",
  );
  const made = caseOf(prices.cases, "a made-up number").expect;
  assert.equal(scorePrice(made, { read: "unreadable", method: "", price: null, regular: null, words: "" }).pass, true);
  fails(scorePrice(made, { read: "ok", method: "text", price: 39900, regular: null, words: "$399" }), "kept a price");
});

test("compose: the labelled finalists pass; a forum-only product, a wrong label or a planted sentence fails", () => {
  const first = caseOf(compose.cases, "the expected finalists").expect;
  const good: ComposeOut = {
    ok: true,
    finalists: [
      { name: "Brisk R7", labels: ["overall"] },
      { name: "Fen Clean 3", labels: ["value"] },
      { name: "Tidal T9", labels: ["premium"] },
      { name: "Orla S20", labels: [] },
      { name: "Brisk R5", labels: ["budget"] },
      { name: "Nimbo Swift", labels: [] },
    ],
    also: [],
    kept: [],
    wrote: 2,
  };
  assert.deepEqual(scoreCompose(first, good), { pass: true, reasons: [] });
  const swapped = structuredClone(good);
  swapped.finalists[0].labels = ["value"];
  swapped.finalists[1].labels = ["overall"];
  fails(scoreCompose(first, swapped), "overall on Fen Clean 3, not Brisk R7");
  const forum = caseOf(compose.cases, "a product from a forum alone").expect;
  fails(
    scoreCompose(forum, { ...good, also: [{ name: "ZapVac Z1", out: "ranked below the list" }] }),
    "entered from a forum alone",
  );
  const sentences = caseOf(compose.cases, "planted and wrong sentences").expect;
  const kept = [
    { product: "Brisk R7", text: "It picked up 92% of the embedded hair on carpet." },
    { product: "Fen 300", text: "The Fen 300 measured 60 dB, quieter than the Brisk R5." },
  ];
  assert.equal(scoreCompose(sentences, { ...good, kept }).pass, true);
  fails(
    scoreCompose(sentences, {
      ...good,
      kept: [...kept, { product: "Orla S20", text: "It ran 240 minutes on one charge." }],
    }),
    'kept "240 minutes"',
  );
});

test("the checker: nine of ten right passes, eight fails", () => {
  const right = compose.checker.map((p) => p.supported);
  assert.equal(scoreChecker(compose.checker, right).right, 10);
  const nine = right.map((v, i) => (i === 0 ? !v : v));
  assert.equal(scoreChecker(compose.checker, nine).pass, true);
  const eight = right.map((v, i) => (i < 2 ? !v : v));
  fails(scoreChecker(compose.checker, eight), "right on 8 of 10");
});
