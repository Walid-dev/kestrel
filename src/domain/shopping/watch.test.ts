// The watch on the made-up want: due and not due; only the offers read from a page's data are re-read (never a price
// from the page's words, a link store or another product's page); the target pings once per crossing; a drop since the
// watch began pings; back in stock pings; one ping per want; a page that no longer matches becomes a mismatch; a page
// that didn't open keeps the last reading (no false back-in-stock ping after it); the watch ends on its date with a
// line in the log, no ping. A stand-in store reader and a stand-in phone.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { StoreRead } from "../../ai/shopping/product-data.ts";
import { migrate } from "../../db/migrate.ts";
import type { Alert } from "../../platform/alert.ts";
import type { Watch } from "../../shared/shopping.ts";
import { seedMadeUpWant } from "./made-up.ts";
import type { Region } from "./region.ts";
import { getProduct, getWant, offersOf, productsOf, setProductMarks, setWatch } from "./store.ts";
import { checkWatches, type WatchDeps } from "./watch.ts";

const REGION: Region = {
  key: "xx",
  name: "Made-up",
  currency: "CAD",
  searchWords: "",
  stores: [
    {
      domain: "store-a.example",
      name: "Store A",
      groups: ["electronics"],
      read: "page",
      searchUrl: "https://store-a.example/s?q={q}",
    },
  ],
  brandStores: {},
  tagRules: {},
  linkTools: [],
  modelRules: [],
  reviewSources: [],
};
const T0 = new Date("2026-11-25T12:00:00Z");
const HOUR = 3_600_000;
const read = (price: number | null, extra: Partial<StoreRead> = {}): StoreRead => ({
  read: price === null ? "unreadable" : "ok",
  method: price === null ? "" : "jsonld",
  price,
  regular: 59_900,
  shipping: 0,
  currency: "CAD",
  stock: "in",
  condition: "new",
  seller: "",
  pickup: null,
  validUntil: null,
  gtin: null,
  words: "",
  why: "",
  ...extra,
});

function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db, ":memory:");
  const want = seedMadeUpWant(db, T0);
  const r7 = productsOf(db, want).find((p) => p.name === "Brisk R7");
  assert.ok(r7);
  const watch: Watch = {
    until: new Date(T0.getTime() + 14 * 24 * HOUR).toISOString(),
    everyHours: 24,
    stock: true,
    began: T0.toISOString(),
    last: null,
    low: null,
    pinged: null,
    wasOut: false,
  };
  setWatch(db, r7.id, watch, T0);
  setProductMarks(db, r7.id, { target: 43_000 }, T0);
  const reads: string[] = [];
  const pings: Alert[] = [];
  const at = { now: T0, price: 44_900 as number | null, extra: {} as Partial<StoreRead> };
  const deps: WatchDeps = {
    region: REGION,
    readPage: async (url) => {
      reads.push(url);
      // the blocked store still turns the reader away
      return url.includes("store-c")
        ? read(null, { read: "blocked", why: "the store turned the reader away" })
        : read(at.price, at.extra);
    },
    ping: async (a) => {
      pings.push(a);
      return { sent: true, why: "" };
    },
    page: "https://kestrel.example",
    now: () => at.now,
  };
  const later = (hours: number) => {
    at.now = new Date(at.now.getTime() + hours * HOUR);
  };
  return { db, want, r7, deps, reads, pings, at, later };
}

test("due and not due; only the page-data offers are re-read: never the words' price, a link, another product's page", async () => {
  const { db, deps, reads, later } = setup();
  assert.deepEqual(await checkWatches(db, deps), { checked: 1, pings: 0, ended: 0 });
  assert.deepEqual(reads, ["https://store-a.example/p/brisk-r7-c"]);
  later(1);
  assert.deepEqual(await checkWatches(db, deps), { checked: 0, pings: 0, ended: 0 }); // an hour on: not due
  later(24);
  await checkWatches(db, deps);
  // a day on: the data price again, and the blocked store, rested a day, tried once more
  assert.deepEqual(reads.slice(1).sort(), ["https://store-a.example/p/brisk-r7-c", "https://store-c.example/item/r7c"]);
});

test("the target pings once per crossing; again after it went above and came back", async () => {
  const { db, want, deps, pings, at, later } = setup();
  at.price = 42_900;
  await checkWatches(db, deps);
  assert.equal(pings.length, 1);
  assert.equal(pings[0].title, "Brisk R7 $429 at Store A");
  assert.match(pings[0].message, /^at my target\nMy target: \$430/);
  assert.equal(
    pings[0].click,
    `https://kestrel.example/shopping/${want}?product=${getWant(db, want) && productsOf(db, want).find((p) => p.name === "Brisk R7")?.id}`,
  );
  later(25);
  await checkWatches(db, deps);
  assert.equal(pings.length, 1); // still under: no second ping
  at.price = 44_000;
  later(25);
  await checkWatches(db, deps);
  at.price = 42_900;
  later(25);
  await checkWatches(db, deps);
  assert.equal(pings.length, 2); // it went above and came back
  assert.ok(getWant(db, want)?.log.some((l) => l.kind === "ping" && l.text === "Brisk R7 $429 at Store A"));
});

test("a drop since the watch began pings; so does a return to stock; a page that no longer matches is a mismatch", async () => {
  const { db, r7, deps, pings, at, later } = setup();
  await checkWatches(db, deps); // the watch's first price: $449
  at.price = 44_500; // 0.9% lower: no ping
  later(25);
  await checkWatches(db, deps);
  assert.equal(pings.length, 0);
  at.price = 43_900; // 1.3% and $6 lower than the lowest since it began
  later(25);
  await checkWatches(db, deps);
  assert.equal(pings.length, 1);
  assert.match(pings[0].message, /^price drop: the lowest since the watch began/);
  at.extra = { stock: "out" };
  later(25);
  await checkWatches(db, deps);
  at.extra = {};
  later(25);
  await checkWatches(db, deps);
  assert.equal(pings.length, 2);
  assert.match(pings[1].message, /back in stock/);
  at.extra = { read: "mismatch", why: "the page is another model (R7 Plus)" };
  later(25);
  await checkWatches(db, deps);
  assert.equal(offersOf(db, r7.id).find((o) => o.store === "store-a.example")?.read, "mismatch");
});

test("a page that didn't open keeps the last price: no price gone for a day, no false back-in-stock ping", async () => {
  const { db, r7, deps, pings, at, later } = setup();
  await checkWatches(db, deps); // the watch's first price: $449
  at.extra = { read: "unreadable", price: null, method: "", why: "the page didn't open (a time-out)", offline: true };
  later(25);
  await checkWatches(db, deps);
  const kept = offersOf(db, r7.id).find((o) => o.store === "store-a.example");
  assert.deepEqual([kept?.read, kept?.price], ["ok", 44_900]);
  at.extra = {};
  later(25);
  await checkWatches(db, deps);
  assert.equal(pings.length, 0);
  assert.equal(getProduct(db, r7.id)?.watch?.wasOut, false);
});

test("one ping per want, naming its best; a watch ends on its date with a line in the log and no ping", async () => {
  const { db, want, deps, pings, at, later } = setup();
  const fen = productsOf(db, want).find((p) => p.name === "Fen Clean 3");
  assert.ok(fen);
  const r7 = productsOf(db, want).find((p) => p.name === "Brisk R7");
  setWatch(db, fen.id, getProduct(db, r7?.id ?? "")?.watch ?? null, at.now);
  setProductMarks(db, fen.id, { target: 45_000 }, at.now);
  at.price = 42_900;
  await checkWatches(db, deps);
  assert.equal(pings.length, 1);
  assert.match(pings[0].message, /Also: Fen Clean 3 \$429 \(at my target\)/);
  later(15 * 24);
  const ended = await checkWatches(db, deps);
  assert.deepEqual(ended, { checked: 0, pings: 0, ended: 2 });
  assert.equal(pings.length, 1);
  assert.equal(getProduct(db, fen.id)?.watch, null);
  assert.ok(getWant(db, want)?.log.some((l) => l.kind === "watch" && l.text === "The watch on Brisk R7 ended"));
});
