// A made-up want for the tests, the development seed and the screen checks: a robot vacuum compared on six criteria,
// eight fictional products from .example sources, offers in every read state and 40 days of readings. Nothing here
// is real: the brands, the stores, the numbers and the quotes are invented.
import type { DatabaseSync } from "node:sqlite";
import type { Need, SourceRef } from "../../shared/shopping.ts";
import {
  addLog,
  addWant,
  type Kept,
  NO_WORDS,
  type OfferInput,
  type ProductInput,
  saveOffer,
  saveProduct,
  updateWant,
} from "./store.ts";
import { rerank } from "./view.ts";

export const MADE_UP_NEED: Need = {
  mode: "compare",
  category: "robot-vacuum",
  name: "Robot vacuum",
  draft: false,
  product: "",
  use: "",
  hard: [],
  implied: ["a tangle-resistant brushroll"],
  questions: [
    {
      key: "floors",
      q: "Mostly carpet or hard floors?",
      options: [
        { label: "Mostly carpet", weights: { "pickup-carpet": 40 } },
        { label: "Mostly hard floors", weights: { "pickup-hard": 40 } },
        { label: "A mix", weights: {} },
      ],
      default: 2,
    },
    {
      key: "pets",
      q: "Pets that shed?",
      options: [
        { label: "Yes", weights: { tangle: 30 } },
        { label: "No", weights: {} },
      ],
      default: 1,
    },
  ],
  criteria: [
    {
      key: "pickup-carpet",
      label: "Carpet pickup",
      type: "score",
      better: "higher",
      weight: 25,
      how: "share of hair picked up from low carpet",
    },
    { key: "pickup-hard", label: "Hard-floor pickup", type: "score", better: "higher", weight: 20 },
    { key: "tangle", label: "Hair tangle", type: "score", better: "higher", weight: 15 },
    { key: "battery", label: "Battery", type: "number", unit: "min", better: "higher", weight: 15 },
    { key: "noise", label: "Noise", type: "number", unit: "dB", measured: true, better: "lower", weight: 10 },
    { key: "mop", label: "Mop", type: "bool", better: "higher", weight: 15 },
  ],
  uses: { carpet: { "pickup-carpet": 35, tangle: 15 } },
  searchWords: "robot vacuum pet hair",
  listSize: 8,
  tags: ["mains-powered"],
  traps: ["the same line sold under a value brand is not the same product"],
  sources: ["labs.example", "handson.example"],
  storeGroups: ["electronics", "home"],
  refreshMonths: 9,
};

export const MADE_UP_SOURCES: SourceRef[] = [
  {
    ref: "s1",
    host: "labs.example",
    url: "https://labs.example/best-robot-vacuums",
    title: "The best robot vacuums, tested",
    tier: "A",
    date: "2026-10",
    read: "page",
  },
  {
    ref: "s2",
    host: "handson.example",
    url: "https://handson.example/robot-vacuums",
    title: "Robot vacuums we lived with",
    tier: "B",
    date: "2026-09",
    read: "page",
  },
  {
    ref: "s3",
    host: "paywall.example",
    url: "https://paywall.example/robot-vacuum-ratings",
    title: "Robot vacuum ratings",
    tier: "A",
    date: "2026-08",
    read: "snippet",
  },
];

type Made = {
  name: string;
  brand: string;
  models: string[];
  facts: [string, number | boolean, string?][];
  usual?: number;
};
const MADE: Made[] = [
  {
    name: "Brisk R7",
    brand: "Brisk",
    models: ["R7-C", "R7"],
    facts: [
      ["pickup-carpet", 92],
      ["pickup-hard", 95],
      ["tangle", 88],
      ["battery", 180],
      ["noise", 64],
      ["mop", true],
    ],
  },
  {
    name: "Fen Clean 3",
    brand: "Fen",
    models: ["FC3"],
    facts: [
      ["pickup-carpet", 85],
      ["pickup-hard", 90],
      ["tangle", 90],
      ["battery", 150],
      ["noise", 61],
      ["mop", false],
    ],
    usual: 39900,
  },
  {
    name: "Orla S20",
    brand: "Orla",
    models: ["S20-CA"],
    facts: [
      ["pickup-carpet", 88],
      ["pickup-hard", 86],
      ["tangle", 70],
      ["battery", 200],
      ["noise", 66],
      ["mop", true],
    ],
  },
  {
    name: "Nimbo Swift",
    brand: "Nimbo",
    models: ["NS-1"],
    facts: [
      ["pickup-carpet", 70],
      ["pickup-hard", 82],
      ["tangle", 65],
      ["battery", 120],
      ["noise", 63],
      ["mop", false],
    ],
    usual: 22900,
  },
  {
    name: "Tidal T9",
    brand: "Tidal",
    models: ["T9"],
    facts: [
      ["pickup-carpet", 90],
      ["pickup-hard", 93],
      ["tangle", 80],
      ["battery", 170],
      ["noise", 68],
      ["mop", true],
    ],
    usual: 89900,
  },
  {
    name: "Brisk R5",
    brand: "Brisk",
    models: ["R5-C"],
    facts: [
      ["pickup-carpet", 80],
      ["pickup-hard", 84],
      ["tangle", 75],
      ["battery", 140],
      ["noise", 62],
      ["mop", false],
    ],
    usual: 29900,
  },
  {
    name: "ZapVac Z1",
    brand: "ZapVac",
    models: ["Z1"],
    facts: [
      ["pickup-carpet", 60],
      ["pickup-hard", 70],
      ["tangle", 50],
      ["battery", 100],
      ["noise", 70],
      ["mop", false],
    ],
    usual: 14900,
  },
  {
    name: "Fen 300",
    brand: "Fen",
    models: ["F300"],
    facts: [
      ["pickup-carpet", 78],
      ["pickup-hard", 80],
      ["tangle", 85],
      ["battery", 130],
      ["noise", 60],
      ["mop", false],
    ],
    usual: 26900,
  },
];

const UNIT: Record<string, string> = { battery: "min", noise: "dB" };
export const madeUpProducts = (): ProductInput[] =>
  MADE.map((m) => ({
    key: `${m.brand} ${m.name.slice(m.brand.length).trim()}`.toLowerCase().replace(/\s+/g, " "),
    name: m.name,
    brand: m.brand,
    models: m.models,
    facts: Object.fromEntries(
      m.facts.map(([k, v]) => [
        k,
        {
          v,
          ...(UNIT[k] ? { unit: UNIT[k] } : {}),
          ref: k === "noise" || k === "battery" ? "s1" : "s2",
          quote: `${m.name}: ${k} ${typeof v === "boolean" ? (v ? "with a mop" : "no mop") : `${v}${UNIT[k] ? ` ${UNIT[k]}` : ""}`}`,
        },
      ]),
    ),
    words: {
      ...NO_WORDS,
      why: [{ text: `It picked up the most hair on carpet in the lab's test.`, refs: ["s1"] }],
      notFor: { text: "Not for a home with deep rugs: it stalls on thick pile.", refs: ["s2"] },
    },
    usual: m.usual ?? null,
    evidence: {
      sources: 2,
      a: 1,
      b: 1,
      newest: "2026-10",
      thin: false,
      old: false,
      refs: ["s1", "s2"],
    },
  }));

// Brisk R7's offers, one in each read state; the other products get one data price each
const R7_OFFERS: OfferInput[] = [
  {
    store: "store-a.example",
    url: "https://store-a.example/p/brisk-r7-c",
    seller: "",
    condition: "new",
    price: 44900,
    regular: 59900,
    shipping: 0,
    currency: "CAD",
    stock: "in",
    pickup: true,
    validUntil: "2026-12-01",
    method: "jsonld",
    read: "ok",
    words: "",
    why: "",
  },
  {
    store: "store-b.example",
    url: "https://store-b.example/brisk-r7",
    seller: "",
    condition: "new",
    price: 46900,
    regular: null,
    shipping: null,
    currency: "CAD",
    stock: "unknown",
    pickup: null,
    validUntil: null,
    method: "text",
    read: "ok",
    words: "Now $469 — Brisk R7-C robot vacuum",
    why: "",
  },
  {
    store: "store-c.example",
    url: "https://store-c.example/item/r7c",
    seller: "",
    condition: "new",
    price: null,
    regular: null,
    shipping: null,
    currency: "",
    stock: "unknown",
    pickup: null,
    validUntil: null,
    method: "",
    read: "blocked",
    words: "",
    why: "the store turned the reader away",
  },
  {
    store: "store-d.example",
    url: "https://store-d.example/search?q=R7-C",
    seller: "",
    condition: "new",
    price: null,
    regular: null,
    shipping: null,
    currency: "",
    stock: "unknown",
    pickup: null,
    validUntil: null,
    method: "link",
    read: "link",
    words: "",
    why: "this store turns automated readers away",
  },
  {
    store: "store-e.example",
    url: "https://store-e.example/brisk-r7-plus",
    seller: "",
    condition: "new",
    price: 52900,
    regular: null,
    shipping: null,
    currency: "CAD",
    stock: "in",
    pickup: null,
    validUntil: null,
    method: "jsonld",
    read: "mismatch",
    words: "",
    why: "the page is another model (R7 Plus)",
  },
];

// the made-up want, written into a database: its need, products, offers and 40 days of readings for Brisk R7 at the
// first store (the price fell from $599 to $449). Returns the want's id
export function seedMadeUpWant(db: DatabaseSync, now = new Date("2026-11-25T12:00:00Z")): string {
  const id = addWant(
    db,
    { words: "a robot vacuum for pet hair", budget: 600, note: "made-up note: the hall is narrow" },
    now,
  );
  const result: Kept = {
    assumptions: [{ text: "Floors taken as a mix of carpet and hard floors.", refs: [] }],
    changeIf: [{ text: "Mostly carpet would put carpet pickup first.", refs: [] }],
    conflicts: [],
    before: ["A recognised safety mark (CSA, cUL or cETL) on the product itself."],
    checked: true,
    notes: [],
    searches: 6,
    pages: 3,
    sources: MADE_UP_SOURCES,
  };
  updateWant(db, id, { state: "done", step: "", need: MADE_UP_NEED, result, ran: now.toISOString(), job: null }, now);
  const ids = madeUpProducts().map((p) => saveProduct(db, id, p, now) as string);
  for (const o of R7_OFFERS) {
    if (o.method !== "jsonld" || o.read !== "ok") {
      saveOffer(db, ids[0], o, now);
      continue;
    }
    // a reading a day: $599 for three weeks, then $499, then $449 for the last six days
    for (let day = 39; day >= 0; day--) {
      const price = day > 18 ? 59900 : day > 5 ? 49900 : 44900;
      saveOffer(db, ids[0], { ...o, price }, new Date(now.getTime() - day * 86_400_000));
    }
  }
  ids.slice(1).forEach((pid, i) => {
    const price = [41900, 52900, 21900, 84900, 27900, 13900, 25900][i];
    saveOffer(
      db,
      pid,
      {
        store: "store-a.example",
        url: `https://store-a.example/p/made-up-${i + 2}`,
        seller: "",
        condition: "new",
        price,
        regular: price + 5000,
        shipping: 0,
        currency: "CAD",
        stock: i === 2 ? "out" : "in",
        pickup: null,
        validUntil: null,
        method: "jsonld",
        read: "ok",
        words: "",
        why: "",
      },
      now,
    );
  });
  addLog(db, id, { kind: "run", text: "Compared 8 products from 2 sources; 1 store read, 1 blocked, 1 link" }, now);
  rerank(db, id);
  return id;
}
