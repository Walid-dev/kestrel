// Finding offers on a made-up region, a stand-in search and the store fixtures: a link store gets its search link with
// no search; a mismatch is kept apart; a blocked store keeps its link; a brand store the region doesn't list is never
// read; the run's search cap leaves unsearched rows; Best price goes only to a verified new total from the page's data,
// never to a price read from its words; every reading is kept.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { Pacer, readStorePage, type StoreRead } from "../../ai/shopping/product-data.ts";
import type { Hit, Reach } from "../../ai/web.ts";
import { migrate } from "../../db/migrate.ts";
import { MADE_UP_NEED } from "./made-up.ts";
import { findOffers, type OfferDeps } from "./offers.ts";
import type { Region } from "./region.ts";
import { scrubContext } from "./scrub.ts";
import { addWant, offersOf, productsOf, readingsOf, saveProduct, updateWant } from "./store.ts";
import { wantView } from "./view.ts";

const fixture = (name: string) => readFileSync(new URL(`../../ai/shopping/fixtures/${name}`, import.meta.url), "utf8");
const store = (d: string, read: "page" | "link" = "page") => ({
  domain: d,
  name: d.split(".")[0].replace("store-", "Store ").toUpperCase(),
  groups: ["electronics"],
  read,
  searchUrl: `https://${d}/search?q={q}`,
  ...(read === "link" ? { why: "turned a plain reader away" } : {}),
});
const REGION: Region = {
  key: "xx",
  name: "Made-up",
  currency: "CAD",
  searchWords: "",
  stores: [
    store("store-a.example"),
    store("store-b.example"),
    store("store-c.example"),
    store("store-d.example", "link"),
    store("store-e.example"),
    store("store-f.example"),
  ],
  brandStores: {},
  tagRules: {},
  linkTools: [],
  modelRules: [],
  reviewSources: [],
};
const PAGES: Record<string, { status?: number; body: string }> = {
  "https://store-a.example/p/brisk-r7-c": { body: fixture("jsonld-sale.html") },
  "https://store-b.example/brisk-r7": {
    body: '<html lang="en"><head><title>Brisk R7-C | Store B</title></head><body><h1>Brisk R7-C Robot Vacuum</h1><p>Now $399.99 Was $599.99</p></body></html>',
  },
  "https://store-c.example/item/r7c": { status: 403, body: "no" },
  "https://store-e.example/p/brisk-r7-plus": {
    body: '<html lang="en"><head><title>Brisk R7 Plus | Store E</title><script type="application/ld+json">{"@type":"Product","name":"Brisk R7 Plus","sku":"R7P","offers":{"@type":"Offer","price":"529","priceCurrency":"CAD"}}</script></head><body><h1>Brisk R7 Plus</h1></body></html>',
  },
  "https://brisk.example/r7": { body: fixture("jsonld-sale.html") },
};
const HITS: Record<string, Hit> = {
  "store-a.example": {
    title: "Brisk R7-C Robot Vacuum | Store A",
    url: "https://store-a.example/p/brisk-r7-c",
    snippet: "$1 today only",
  },
  "store-b.example": { title: "Brisk R7-C | Store B", url: "https://store-b.example/brisk-r7", snippet: "" },
  "store-c.example": { title: "Brisk R7-C", url: "https://store-c.example/item/r7c", snippet: "" },
  "store-e.example": { title: "Brisk R7 Plus", url: "https://store-e.example/p/brisk-r7-plus", snippet: "" },
};

function setup(cap = 24) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db, ":memory:");
  const want = addWant(db, { words: "a robot vacuum", budget: 600, note: "made-up note" });
  updateWant(db, want, { state: "done", need: MADE_UP_NEED, job: null });
  saveProduct(db, want, {
    key: "brisk r7",
    name: "Brisk R7",
    brand: "Brisk",
    models: ["R7-C"],
    facts: {},
    words: { why: [], tradeoff: null, notFor: null, pros: [], cons: [], skip: [] },
    usual: null,
    evidence: { sources: 2, a: 1, b: 1, newest: null, thin: false, old: false, refs: [] },
  });
  const asked: string[] = [];
  const fetched: string[] = [];
  let left = cap;
  const reach: Reach = { resolve: async () => ["93.184.215.14"], head: async () => ({ status: 200, location: null }) };
  const get = (async (input: string | URL | Request) => {
    const url = String(input);
    fetched.push(url);
    const page = PAGES[url] ?? { status: 404, body: "" };
    return new Response(page.body, { status: page.status ?? 200 });
  }) as typeof fetch;
  const pacer = new Pacer({ sleep: async () => {} });
  const deps: OfferDeps = {
    region: REGION,
    read: true,
    search: async (q) => {
      if (left-- <= 0) return null;
      asked.push(q);
      const site = /site:(\S+)/.exec(q)?.[1];
      return site
        ? HITS[site]
          ? [HITS[site]]
          : []
        : [{ title: "Brisk R7 by Brisk", url: "https://brisk.example/r7", snippet: "" }];
    },
    readPage: (url, wanted, s): Promise<StoreRead> =>
      readStorePage(url, wanted, {
        currency: "CAD",
        storeName: s.name,
        net: { reach, fetch: get },
        pacer,
        textPrice: async () => ({
          price: { amount: 399.99, words: "Now $399.99" },
          regular: { amount: 599.99, words: "Was $599.99" },
          currency: "CAD",
        }),
      }),
    scrub: scrubContext({ words: "a robot vacuum", budget: 600, note: "made-up note" }, MADE_UP_NEED),
    now: () => new Date("2026-11-25T12:00:00Z"),
  };
  return { db, want, deps, asked, fetched };
}

test("each store in its state: read, link, blocked, mismatch; a brand store nobody listed is never read", async () => {
  const { db, want, deps, asked, fetched } = setup();
  const [p] = productsOf(db, want);
  const got = await findOffers(db, [p], MADE_UP_NEED, deps);
  assert.deepEqual(got, { read: 2, links: 2, blocked: 1, unsearched: 0, mismatch: 1 });
  const rows = Object.fromEntries(offersOf(db, p.id).map((o) => [o.store, o]));
  assert.equal(rows["store-d.example"].read, "link");
  assert.equal(rows["store-d.example"].url, "https://store-d.example/search?q=R7-C");
  assert.ok(!asked.some((q) => q.includes("store-d")), "a link store costs no search");
  assert.equal(rows["store-c.example"].read, "blocked");
  assert.equal(rows["store-c.example"].url, "https://store-c.example/item/r7c");
  assert.equal(rows["store-e.example"].read, "mismatch");
  assert.equal(rows["store-a.example"].method, "jsonld");
  assert.equal(rows["store-b.example"].method, "text");
  // Store F has no page in its search: the brand-and-model search runs, finds only the brand's own site, which the
  // region doesn't list, so it is never read and Store F keeps its search link
  assert.equal(rows["store-f.example"].read, "link");
  assert.match(rows["store-f.example"].why, /no page/);
  assert.ok(!fetched.some((u) => u.includes("brisk.example")), "an open search's brand store is never read");
  // the searches: one per readable store, scrubbed (nothing of my budget or note)
  assert.deepEqual(asked, [
    '"R7-C" site:store-a.example',
    '"R7-C" site:store-b.example',
    '"R7-C" site:store-c.example',
    '"R7-C" site:store-e.example',
    '"R7-C" site:store-f.example',
    '"Brisk R7-C"',
  ]);
  // Best price: the verified total from the page's data, never the cheaper price read from the words
  const view = wantView(db, want);
  const r7 = [...(view?.products ?? []), ...(view?.also ?? [])][0];
  assert.equal(r7.best?.store, "store-a.example");
  assert.equal(r7.best?.total, 44999);
  // every reading kept: the data price and the words' price, each with its method
  assert.deepEqual(
    readingsOf(db, p.id)
      .map((r) => [r.store, r.method, r.price])
      .sort(),
    [
      ["store-a.example", "jsonld", 44999],
      ["store-b.example", "text", 39999],
    ],
  );
});

test("the run's search cap leaves the stores after it unsearched, each with its search link", async () => {
  const { db, want, deps, asked } = setup(2);
  const [p] = productsOf(db, want);
  const got = await findOffers(db, [p], MADE_UP_NEED, deps);
  assert.equal(asked.length, 2);
  assert.equal(got.unsearched, 3);
  const unsearched = offersOf(db, p.id).filter((o) => o.read === "unsearched");
  assert.deepEqual(unsearched.map((o) => o.store).sort(), ["store-c.example", "store-e.example", "store-f.example"]);
  assert.match(unsearched[0].url, /\/search\?q=R7-C$/);
  // with store reading off, every store is a link at once, and nothing is searched
  const off = setup();
  const [q] = productsOf(off.db, off.want);
  const none = await findOffers(off.db, [q], MADE_UP_NEED, { ...off.deps, read: false });
  assert.deepEqual([none.links, off.asked.length], [6, 0]);
});
