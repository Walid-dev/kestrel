// The first live run, replayed end to end (fixtures/replay.ts): its three wants through Understand, the searches, the
// readers, the merge, the ranking, the writer and its checks, the offers and the store pages, on a stand-in door that
// answers in the real models' shapes and a stand-in web that answers with tonight's hits and pages. Each of the run's
// failures is looked for on the want page that comes out.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { startStandIn } from "../../ai/stand-in.ts";
import { migrate } from "../../db/migrate.ts";
import type { Settings } from "../../platform/config.ts";
import type { ProductView, WantView } from "../../shared/shopping.ts";
import { replayDoor, replayWeb, WANTS } from "./fixtures/replay.ts";
import { loadRegion, placeOf } from "./region.ts";
import { idle, startNext } from "./run.ts";
import { addWant, getWant } from "./store.ts";
import { wantView } from "./view.ts";

async function replay(t: { after: (fn: () => Promise<void>) => void }, door_: Parameters<typeof replayDoor>[0] = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db, ":memory:");
  const door = await startStandIn(replayDoor(door_));
  t.after(() => door.close());
  const region = loadRegion();
  const searched: string[] = [];
  const settings = {
    models: { url: door.url, careful: "careful-model", fast: "fast-model", contextChars: 400_000 },
    shopping: { read: true },
  } as Settings;
  const ids = {
    vacuum: addWant(db, WANTS.vacuum, new Date("2026-11-26T05:04:00Z")),
    headphones: addWant(db, WANTS.headphones, new Date("2026-11-26T05:05:00Z")),
    jacket: addWant(db, WANTS.jacket, new Date("2026-11-26T05:06:00Z")),
  };
  startNext(db, settings, {
    region,
    web: replayWeb(region, searched),
    gapMs: 0,
    drafts: mkdtempSync(join(tmpdir(), "kestrel-replay-")),
  });
  await idle(60_000);
  const view = (id: string) => {
    const w = getWant(db, id);
    assert.equal(w?.state, "done", w?.error ?? "");
    return wantView(db, id, { place: placeOf(region) }) as WantView;
  };
  return { db, ids, view, searched };
}
const parkaOf = (v: WantView) => named(v, "REI Co-op Stormhenge 850 Down Hybrid Parka");
const named = (v: WantView, name: string): ProductView => {
  const p = [...v.products, ...v.also].find((x) => x.name === name);
  assert.ok(p, `${name} isn't on the page: ${[...v.products, ...v.also].map((x) => x.name).join(", ")}`);
  return p;
};

test("the three wants of the first live run, replayed: each failure looked for on its page", async (t) => {
  const { ids, view, searched } = await replay(t);
  const vacuum = view(ids.vacuum);
  const phones = view(ids.headphones);
  const jacket = view(ids.jacket);

  // 1. no ad is a source, on any want
  for (const v of [vacuum, phones, jacket])
    assert.ok(
      v.sources.every((s) => !/bing\.com/.test(s.host)),
      v.sources.map((s) => s.host).join(", "),
    );
  assert.deepEqual(
    vacuum.sources.map((s) => s.host),
    ["vacuumwars.com"],
  );

  // 2. every product on a list says why, from its sources; what the writer lost is in the log, never silent
  for (const v of [vacuum, phones, jacket]) {
    for (const p of v.products) {
      assert.ok(p.words.why.length, `${p.name} has no why`);
      assert.ok(
        p.words.why.every((s) => s.refs.length > 0),
        `${p.name}: ${JSON.stringify(p.words.why)}`,
      );
    }
  }
  assert.ok(
    [vacuum, phones, jacket].some((v) => v.log.some((l) => /^Reasons: \d+ written, \d+ kept/.test(l.text))),
    "a lost reason is logged",
  );

  // 3. the best measured product leads; a missing value is never perfect; the order agrees with the labels
  assert.equal(phones.products[0]?.name, "Sony WH-1000XM6");
  assert.equal(phones.products[0]?.labels[0]?.key, "overall");
  for (const v of [vacuum, phones, jacket])
    assert.ok(v.products.every((p) => (p.score ?? 0) <= (v.products[0]?.score ?? 0)));
  assert.match(named(phones, "JBL Live 780NC").out, /no source measured it|too little measured/);

  // 4. no weight as a comfort score; a weight in pounds in grams; weather resistance never the hood's score
  for (const p of [...phones.products, ...phones.also]) assert.equal(p.facts.comfort, undefined, p.name);
  assert.deepEqual(
    [named(jacket, "Fjallraven Nuuk Parka").facts.weight?.v, named(jacket, "Fjallraven Nuuk Parka").facts.weight?.unit],
    [2086.52, "g"],
  );
  assert.equal(named(jacket, "Canada Goose Expedition Parka Heritage").facts.hood, undefined);
  assert.equal(named(jacket, "Carhartt Men's 103826 Bartlett Jacket").facts.weight?.unit, "g");
  // "Water resistant" and "Weatherproof" name the weather, and neither says waterproof: no yes from them
  assert.equal(parkaOf(jacket).facts.waterproof, undefined);
  assert.equal(named(jacket, "Canada Goose Expedition Parka Heritage").facts.waterproof, undefined);
  assert.equal(named(jacket, "Fjallraven Nuuk Parka").facts.waterproof?.v, true);

  // 5. prices: an out-of-stock store price is the price level, a review's list price is kept in its own currency, a
  // search result's price is marked as one, and none of them is where to buy now
  const xm4 = named(phones, "Sony WH-1000XM4C");
  assert.deepEqual([xm4.price, xm4.priceFrom, xm4.best], [27_800, "stock", null]);
  const xm6 = named(phones, "Sony WH-1000XM6");
  assert.deepEqual([xm6.price, xm6.priceFrom], [47_800, "stock"]);
  assert.equal(xm6.offers.find((o) => o.store === "costco.ca")?.stock, "unknown");
  const bestbuy = xm6.offers.find((o) => o.store === "bestbuy.ca");
  assert.deepEqual([bestbuy?.read, bestbuy?.price], ["link", 49_999]);
  // a label needs half the kind's weight measured: the XM4C, known on battery, weight and multipoint alone (30 of 100),
  // carries none, though it is the cheaper (the second live run labelled a pair on battery alone)
  assert.deepEqual(named(phones, "Sony WH-1000XM4C").labels, []);
  const heritage = named(jacket, "Canada Goose Expedition Parka Heritage");
  assert.equal(heritage.evidence.list?.currency, "USD");
  assert.equal(
    heritage.priceNote,
    "US$1,895 list price in outdoorgearlab.com's review (USD, not checked against my budget)",
  );
  assert.equal(heritage.budget, "unknown", "a price in US dollars is never checked against my budget");
  // US list prices name Best value only by name ("US list prices"), never Budget: my budget is in Canadian dollars
  const jacketLabels = jacket.products.flatMap((p) => p.labels);
  assert.ok(!jacketLabels.some((l) => l.key === "budget"), JSON.stringify(jacketLabels));
  assert.ok(
    jacketLabels.filter((l) => l.key === "value").every((l) => l.text === "Best value (US list prices)"),
    JSON.stringify(jacketLabels),
  );
  // the page says which prices it has, and what they can't name
  assert.equal(
    jacket.pricing,
    jacketLabels.some((l) => l.key === "value")
      ? "Best value compares the reviews' US list prices: no CAD price is known for these products yet. Budget waits for CAD prices, since my budget is in CAD."
      : "Only the reviews' US list prices are known here. Budget needs CAD prices, since my budget is in CAD; Best value needs two products near the top priced alike.",
  );

  // 6. the parka never matched the keyboard: searched by its brand and model, and no offer from that page
  const parka = parkaOf(jacket);
  assert.ok(!parka.offers.some((o) => /incase|keyboard/i.test(o.url)));
  assert.ok(!searched.some((q) => /^"850"/.test(q)));
  assert.ok(searched.some((q) => q.startsWith('"REI Co-op Stormhenge 850 Down Hybrid Parka"')));

  // 7. every name keeps its brand
  assert.ok(named(vacuum, "Dreame L60 Pro Ultra"));
  for (const v of [vacuum, phones, jacket])
    for (const p of [...v.products, ...v.also]) assert.ok(p.brand, `${p.name} has no brand`);

  // 8. a jacket is looked for where jackets sell
  const stores = new Set(parka.offers.map((o) => o.storeName));
  for (const s of ["MEC", "Sport Chek", "Sail", "Altitude Sports", "Simons"]) assert.ok(stores.has(s), s);
  for (const s of ["Home Depot", "Costco"]) assert.ok(!stores.has(s), s);

  // 9. one implied need once; hair wrap 0% reads as the best
  assert.equal(vacuum.need?.implied.length, 1, JSON.stringify(vacuum.need?.implied));
  const pe = named(vacuum, "Dreame L60 Ultra PE");
  assert.deepEqual([pe.facts.tangle?.v, pe.facts.tangle?.unit], [0, "%"]);
  assert.equal(vacuum.kind.fields.find((f) => f.key === "c:tangle")?.better, "lower");
});

test("a checker that finds every sentence unsupported: the loss is logged, and each product still says why", async (t) => {
  const { ids, view } = await replay(t, { checker: "reject" });
  const lines: string[] = [];
  for (const id of Object.values(ids)) {
    const v = view(id);
    for (const p of v.products) {
      assert.ok(p.words.why.length, `${p.name} has no why`);
      assert.ok(
        p.words.why.every((s) => s.refs.length > 0 && s.text.includes("“")),
        `${p.name}: ${JSON.stringify(p.words.why)}`,
      );
    }
    const line = v.log.find((l) => /^Reasons: \d+ written, 0 kept/.test(l.text));
    if (v.products.length) assert.ok(line, v.log.map((l) => l.text).join(" | "));
    lines.push(line?.text ?? "");
  }
  // the checker's refusals are counted where its answer was read (one want's only write is the cut-off one)
  assert.ok(
    lines.some((l) => /\d+ the checker found unsupported/.test(l)),
    lines.join(" | "),
  );
});
