// The run on a stand-in model and a stand-in web: a want end to end; a second one queued and started by the first's
// end; an offers job for two products; a restart (the running want failed, a queued offers job kept and started); a
// failure keeps the last result; a run again keeps my marks and logs a change; one mode finds its offers before it
// reads a review, its card leads with the named product and its log counts those offers; a reader out of room is
// logged and the run goes on; with store reading off a price check reads no page. Made-up pages, stores and products only.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { StoreRead } from "../../ai/shopping/product-data.ts";
import { startStandIn } from "../../ai/stand-in.ts";
import type { Hit } from "../../ai/web.ts";
import { migrate } from "../../db/migrate.ts";
import { finished } from "../../platform/activity.ts";
import type { Settings } from "../../platform/config.ts";
import type { Region } from "./region.ts";
import { checked, idle, type RunDeps, shoppingTick, startNext } from "./run.ts";
import {
  addWant,
  claimNext,
  getProduct,
  getWant,
  offersOf,
  productsOf,
  queueJob,
  setProductMarks,
  setWatch,
  sweepWants,
} from "./store.ts";
import { wantView } from "./view.ts";

// a made-up paragraph: a gathered page must read past 300 characters to count
const FILLER =
  "\nEach robot vacuum ran the same course in the same rooms, on the same made-up carpet and tile, over two weeks of daily runs, with the bin emptied and the brushes cleaned between runs so that no unit had an edge.";
const PAGES: Record<string, { title: string; text: string; answer: unknown }> = {
  "https://labs.example/best": {
    title: "The best robot vacuums, tested",
    text: `## The best robot vacuums, tested\nWe buy every robot vacuum we test and measure each one.\nModel | Carpet | Hard floors | Noise\nBrisk R7 | 92% | 95% | 64 dB\nFen Clean 3 | 88% | 90% | 61 dB\nOrla S20 | 85% | 86% | 66 dB${FILLER}`,
    answer: {
      method: { buysOwn: true, numbers: true, date: "2026-10" },
      products: [
        {
          name: "Brisk R7",
          brand: "Brisk",
          models: ["R7-C"],
          label: "",
          facts: {
            "pickup-carpet": { v: 92, quote: "92%" },
            "pickup-hard": { v: 95, quote: "95%" },
            noise: { v: 64, quote: "64 dB" },
          },
        },
        {
          name: "Fen Clean 3",
          brand: "Fen",
          models: ["FC3"],
          label: "",
          facts: {
            "pickup-carpet": { v: 88, quote: "88%" },
            "pickup-hard": { v: 90, quote: "90%" },
            noise: { v: 61, quote: "61 dB" },
          },
        },
        {
          name: "Orla S20",
          brand: "Orla",
          models: ["S20-CA"],
          label: "",
          facts: {
            "pickup-carpet": { v: 85, quote: "85%" },
            "pickup-hard": { v: 86, quote: "86%" },
            noise: { v: 66, quote: "66 dB" },
          },
        },
      ],
    },
  },
  "https://bench.example/runtime": {
    title: "Robot vacuum runtimes, measured",
    text: `## Robot vacuum runtimes, measured\nWe bought each robot vacuum and timed it.\nModel | Runtime\nFen Clean 3 | 150 min\nOrla S20 | 200 min\nBrisk R7 | 180 min${FILLER}`,
    answer: {
      method: { buysOwn: true, numbers: true, date: "2026-09" },
      products: [
        { name: "Fen Clean 3", brand: "Fen", models: [], label: "", facts: { battery: { v: 150, quote: "150 min" } } },
        { name: "Orla S20", brand: "Orla", models: [], label: "", facts: { battery: { v: 200, quote: "200 min" } } },
        { name: "Brisk R7", brand: "Brisk", models: [], label: "", facts: { battery: { v: 180, quote: "180 min" } } },
      ],
    },
  },
};
const REGION: Region = {
  key: "xx",
  name: "Made-up",
  currency: "CAD",
  searchWords: "made-up",
  stores: [
    {
      domain: "store-a.example",
      name: "Store A",
      groups: ["electronics"],
      read: "page",
      searchUrl: "https://store-a.example/s?q={q}",
    },
    {
      domain: "store-d.example",
      name: "Store D",
      groups: ["electronics"],
      read: "link",
      searchUrl: "https://store-d.example/s?q={q}",
      why: "made-up block",
    },
  ],
  brandStores: {},
  tagRules: {},
  linkTools: [],
  modelRules: [],
  reviewSources: [],
};

async function setup(t: { after: (fn: () => Promise<void>) => void }) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db, ":memory:");
  const calls: string[] = [];
  const state = { down: false, room: "", price: 44_900 };
  const standIn = await startStandIn((body) => {
    const prompt = body.messages?.at(-1)?.content ?? "";
    if (state.down) return { status: 500 };
    if (prompt.startsWith("I need to buy something")) {
      calls.push("understand");
      const one = /MY WANT: the Brisk R7/.test(prompt);
      return {
        content: JSON.stringify({
          mode: one ? "one" : "compare",
          category: "robot-vacuum",
          product: one ? "Brisk R7" : "",
          questions: [],
          searchWords: "robot vacuum",
        }),
      };
    }
    const page = /<<<THE PAGE: .* \((https:\/\/[^)]+)\) \(data/.exec(prompt)?.[1];
    if (prompt.startsWith("Below is a web page") && page) {
      calls.push("read");
      if (state.room && page.includes(state.room)) return { content: "", finish: "length" };
      return { content: JSON.stringify(PAGES[page]?.answer ?? { method: {}, products: [] }) };
    }
    if (prompt.startsWith("Write short reasons")) {
      calls.push("write");
      const id = /^(p\d+) · /m.exec(prompt)?.[1];
      const q = /^ {2}\[(q\d+)\] .+?: "([^"]+)"/m.exec(prompt);
      return {
        content: JSON.stringify({
          products: id && q ? [{ id, why: [{ text: `It reached ${q[2]}.`, refs: [q[1]] }] }] : [],
        }),
      };
    }
    if (prompt.startsWith("Each sentence below")) {
      calls.push("check");
      return { content: JSON.stringify({ verdicts: [{ n: 1, supported: true }] }) };
    }
    return { content: "{}" };
  });
  const order: string[] = [];
  const searched: string[] = [];
  const deps: RunDeps = {
    region: REGION,
    drafts: mkdtempSync(join(tmpdir(), "kestrel-run-")),
    gapMs: 0,
    web: {
      search: async (q): Promise<Hit[]> => {
        searched.push(q);
        const code = /"([^"]+)" site:store-a\.example/.exec(q)?.[1];
        if (code)
          return [
            { title: `Made-up ${code} | Store A`, url: `https://store-a.example/p/${code.toLowerCase()}`, snippet: "" },
          ];
        return Object.entries(PAGES).map(([url, p]) => ({ title: p.title, url, snippet: "" }));
      },
      page: async (url) => PAGES[url]?.text ?? "",
      store: async (url): Promise<StoreRead> => {
        order.push("store");
        calls.push("store");
        return {
          read: "ok",
          method: "jsonld",
          price: url.includes("r7") ? state.price : 39_900,
          regular: null,
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
        };
      },
    },
  };
  const settings = {
    models: { url: standIn.url, careful: "careful-model", fast: "fast-model", contextChars: 400_000 },
    shopping: { read: true },
  } as Settings;
  // closed whatever the test does: a failed assertion must never leave the stand-in holding the check open
  t.after(() => standIn.close());
  return { db, deps, settings, calls, state, searched };
}

test("a want end to end: understood, compared, written, checked, its offers found; every call recorded", async (t) => {
  const { db, deps, settings, calls, searched } = await setup(t);
  const id = addWant(db, {
    words: "a robot vacuum for pet hair",
    budget: 600,
    note: "made-up note: the hall is narrow",
  });
  assert.equal(startNext(db, settings, deps), id);
  await idle();
  const w = getWant(db, id);
  assert.equal(w?.state, "done", w?.error ?? "");
  const products = productsOf(db, id);
  assert.deepEqual(products.map((p) => p.name).sort(), ["Brisk R7", "Fen Clean 3", "Orla S20"]);
  assert.ok(products.some((p) => p.labels.some((l) => l.key === "overall")));
  const r7 = products.find((p) => p.name === "Brisk R7");
  assert.equal(r7?.evidence.sources, 2);
  // no review page states a price: every finalist's offers are read, so the rerank can name best value by price
  assert.ok(
    products.every((p) => offersOf(db, p.id).some((o) => o.read === "ok")),
    JSON.stringify(products.map((p) => [p.name, offersOf(db, p.id).map((o) => o.read)])),
  );
  assert.ok(
    products.some((p) => p.labels.some((l) => l.key === "value")),
    JSON.stringify(products.map((p) => [p.name, p.score, p.labels])),
  );
  assert.ok(products.some((p) => offersOf(db, p.id).some((o) => o.read === "link" && o.store === "store-d.example")));
  // nothing of mine in a search: no budget, no note word
  assert.ok(
    searched.every((q) => !/600|narrow|hall/.test(q)),
    searched.join(" | "),
  );
  assert.deepEqual([...new Set(calls)].sort(), ["check", "read", "store", "understand", "write"]);
  const purposes = (
    db.prepare("SELECT DISTINCT purpose FROM model_calls ORDER BY purpose").all() as { purpose: string }[]
  ).map((r) => r.purpose);
  assert.deepEqual(purposes, ["shopping-check:v1", "shopping-read:v1", "shopping-understand:v1", "shopping-write:v1"]);
  assert.ok(
    w?.log.some((l) => l.kind === "run" && /^Compared 3 products from 2 pages/.test(l.text)),
    JSON.stringify(w?.log),
  );
  assert.ok(finished().some((a) => a.kind === "shopping" && a.outcome === "done" && a.link === `/shopping/${id}`));
});

test("a second want waits and starts when the first ends; an offers job reads only its products", async (t) => {
  const { db, deps, settings, calls } = await setup(t);
  const a = addWant(db, { words: "a robot vacuum" }, new Date("2026-11-25T10:00:00Z"));
  const b = addWant(db, { words: "a quiet robot vacuum" }, new Date("2026-11-25T10:01:00Z"));
  startNext(db, settings, deps);
  assert.equal(startNext(db, settings, deps), null); // one at a time
  await idle();
  assert.deepEqual([getWant(db, a)?.state, getWant(db, b)?.state], ["done", "done"]);
  // Find offers on two products I picked: that step alone, for those two
  const [p1, p2] = productsOf(db, a);
  calls.length = 0;
  queueJob(db, a, { do: "offers", products: [p1.id, p2.id] });
  startNext(db, settings, deps);
  await idle();
  assert.equal(getWant(db, a)?.state, "done");
  assert.equal(calls.filter((c) => c === "store").length, 2);
  assert.ok(!calls.includes("read") && !calls.includes("understand"));
});

test("a restart fails the running want and keeps a queued offers job, which then runs", async (t) => {
  const { db, deps, settings } = await setup(t);
  const a = addWant(db, { words: "a robot vacuum" });
  startNext(db, settings, deps);
  await idle();
  const [p1] = productsOf(db, a);
  const b = addWant(db, { words: "a quiet robot vacuum" });
  claimNext(db); // b runs when kestrel stops
  queueJob(db, a, { do: "offers", products: [p1.id] });
  assert.equal(sweepWants(db), 1);
  assert.match(getWant(db, b)?.error ?? "", /restarted while it ran/);
  assert.deepEqual(getWant(db, a)?.job, { do: "offers", products: [p1.id] });
  startNext(db, settings, deps);
  await idle();
  assert.equal(getWant(db, a)?.state, "done");
});

test("a failure keeps the last result; a run again keeps my marks and logs a change", async (t) => {
  const { db, deps, settings, state } = await setup(t);
  const id = addWant(db, { words: "a robot vacuum" });
  startNext(db, settings, deps);
  await idle();
  const r7 = productsOf(db, id).find((p) => p.name === "Brisk R7");
  assert.ok(r7);
  setProductMarks(db, r7.id, { starred: true, target: 42_000 });
  const before = getWant(db, id)?.result;
  // the model is down: the run fails with its words, and the last good run stays
  state.down = true;
  queueJob(db, id, { do: "full" });
  startNext(db, settings, deps);
  await idle();
  assert.equal(getWant(db, id)?.state, "failed");
  assert.match(getWant(db, id)?.error ?? "", /no source that tests/);
  assert.deepEqual(getWant(db, id)?.result?.sources, before?.sources);
  assert.equal(productsOf(db, id).length, 3);
  // again, with the price lower: my marks kept, the change logged
  state.down = false;
  state.price = 42_900;
  queueJob(db, id, { do: "full" });
  startNext(db, settings, deps);
  await idle();
  const again = productsOf(db, id).find((p) => p.name === "Brisk R7");
  assert.deepEqual([again?.id, again?.starred, again?.target], [r7.id, true, 42_000]);
  assert.ok(
    getWant(db, id)?.log.some((l) => l.text === "Brisk R7: $449 → $429"),
    JSON.stringify(getWant(db, id)?.log),
  );
});

test("one mode finds the named product's offers before any review; a reader out of room is logged", async (t) => {
  const { db, deps, settings, calls, state, searched } = await setup(t);
  state.room = "bench.example";
  const id = addWant(db, { words: "the Brisk R7 robot vacuum" });
  startNext(db, settings, deps);
  await idle();
  const w = getWant(db, id);
  assert.equal(w?.state, "done", w?.error ?? "");
  assert.equal(w?.need?.mode, "one");
  assert.ok(calls.indexOf("store") < calls.indexOf("read"), calls.join(" "));
  assert.ok(w?.result?.notes.includes("the reader ran out of room on bench.example"), JSON.stringify(w?.result?.notes));
  const named = productsOf(db, id).find((p) => p.name === "Brisk R7");
  assert.ok(named && offersOf(db, named.id).some((o) => o.read === "ok"));
  // the named product leads its list, the alternatives after it; its card shows its price, and the log counts its offers
  const view = wantView(db, id);
  assert.equal(view?.products[0]?.name, "Brisk R7");
  assert.deepEqual([view?.best?.name, view?.best?.price], ["Brisk R7", 44_900]);
  const line = w?.log.find((l) => l.kind === "run")?.text ?? "";
  assert.match(line, /^Compared \d+ products? from \d+ pages?; [1-9]\d* offers? read/);
  // searched by its whole name, never a bare "R7"
  assert.ok(
    searched.some((q) => q.startsWith('"Brisk R7" site:')),
    searched.join(" | "),
  );
});

test("with store reading off, a due price check reads no page and the last reading stands", async (t) => {
  const { db, deps, settings, calls } = await setup(t);
  const id = addWant(db, { words: "a robot vacuum" });
  startNext(db, settings, deps);
  await idle();
  const [p] = productsOf(db, id);
  const before = offersOf(db, p.id).map((o) => [o.id, o.price]);
  setWatch(db, p.id, {
    until: "2026-12-31T00:00:00Z",
    everyHours: 24,
    stock: true,
    began: "2026-11-25T00:00:00Z",
    last: null,
    low: null,
    pinged: null,
    wasOut: false,
  });
  calls.length = 0;
  const off = { ...settings, shopping: { read: false } } as Settings;
  assert.equal(
    shoppingTick(db, off, new Date(), true, { ...deps, ping: async () => ({ sent: true, why: "" }) }),
    "watch",
  );
  await checked();
  assert.deepEqual(calls, []);
  assert.ok(getProduct(db, p.id)?.watch?.last);
  assert.deepEqual(
    offersOf(db, p.id).map((o) => [o.id, o.price]),
    before,
  );
});

test("the tick's hook starts a queued want and the due price checks; an application at work holds the run", async (t) => {
  const { db, deps, settings } = await setup(t);
  const first = addWant(db, { words: "a robot vacuum" });
  startNext(db, settings, deps);
  await idle();
  const [p] = productsOf(db, first);
  setWatch(db, p.id, {
    until: "2026-12-31T00:00:00Z",
    everyHours: 24,
    stock: true,
    began: "2026-11-25T00:00:00Z",
    last: null,
    low: null,
    pinged: null,
    wasOut: false,
  });
  // an application holds the model: the run waits, the price check doesn't
  db.prepare(
    "INSERT INTO applications (id, link, title, org, state, started, updated) VALUES ('a1', 'https://jobs.example/1', 'Made-up role', 'Made-up', 'applying', ?, ?)",
  ).run(new Date().toISOString(), new Date().toISOString());
  const second = addWant(db, { words: "a quiet robot vacuum" });
  const pings: string[] = [];
  const ping = async (a: { title: string }) => {
    pings.push(a.title);
    return { sent: true, why: "" };
  };
  assert.equal(shoppingTick(db, settings, new Date(), true, { ...deps, ping }), "watch");
  await checked();
  assert.equal(getWant(db, second)?.state, "queued");
  assert.ok(getProduct(db, p.id)?.watch?.last);
  db.prepare("DELETE FROM applications").run();
  assert.equal(shoppingTick(db, settings, new Date(), false, { ...deps, ping }), "run");
  await idle();
  assert.equal(getWant(db, second)?.state, "done");
});
