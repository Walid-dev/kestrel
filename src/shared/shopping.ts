// Shopping as the pages and the server share it (v1.2): a want, its need card, its compared products with their
// offers, verdicts and evidence, its sources and log. These shapes are the contract: the engine fills them, the pages
// draw them. Money is in cents. Nothing from Node and no zod: the web imports it.
import { type Field, formatMoney, type KindFilter, type KindSort, type ListKind, type Row } from "./kinds.ts";

export type WantState = "queued" | "running" | "done" | "failed";
export type Mark = "open" | "bought" | "passed";

// ── The need card: what Understand made of my words, with its category's criteria taken along ──────────────────

export type CriterionType = "number" | "score" | "bool" | "enum";
// a score is a source's own scale, and a measured number a lab's own test: both compare within one source only. An
// unmarked number is a stated spec that sources share
export type Criterion = {
  key: string;
  label: string;
  type: CriterionType;
  unit?: string;
  better: "higher" | "lower";
  weight: number;
  how?: string;
  measured?: boolean;
  options?: string[];
};
// a must-have: on a criterion when one fits (a bool to be true, a number within min and max, an enum to be one value)
export type Hard = { criterion: string; says: string; min?: number; max?: number; is?: boolean | string };
// an option's effect: the weights it names replace those criteria's (then all are scaled back to 100), and its
// must-haves join the want's
export type Option = { label: string; weights: Record<string, number>; hard?: Hard[] };
export type Question = { key: string; q: string; options: Option[]; default: number };
export type Need = {
  mode: "compare" | "one";
  category: string;
  name: string; // the category's name ("Robot vacuum")
  draft: boolean; // a category Understand drafted
  words?: string[]; // the words that name the kind ("robot vacuum", "robovac")
  product: string; // the product my words name, in one mode
  use: string; // a key of uses, or ""
  hard: Hard[];
  implied: string[];
  questions: Question[];
  criteria: Criterion[];
  uses: Record<string, Record<string, number>>;
  searchWords: string;
  listSize: number;
  tags: string[];
  traps: string[];
  sources: string[];
  storeGroups: string[];
  refreshMonths: number;
};

// ── A product, its facts and words ────────────────────────────────────────────────────────────────────────────────

// a value, from one source (ref: a source's ref, "s2"), with the page's exact words; unsure when its quote isn't in
// the product's own part of the page (shown with a "?", never ranked); others: other sources' values, as notes
export type FactValue = number | string | boolean;
export type Fact = {
  v: FactValue;
  unit?: string;
  ref: string;
  quote: string;
  unsure?: boolean;
  others?: { v: FactValue; unit?: string; ref: string; quote: string }[];
};
// a checked sentence and the sources it rests on
export type Said = { text: string; refs: string[] };
export type ProductWords = {
  why: Said[];
  tradeoff: Said | null;
  notFor: Said | null;
  pros: Said[];
  cons: Said[];
  skip: Said[];
};
export type Evidence = {
  sources: number; // independent sources (a family counts once)
  a: number; // tier A among them
  b: number;
  newest: string | null; // the newest source's date (YYYY-MM)
  thin: boolean; // one independent source only
  old: boolean; // every source older than 12 months or the category's refresh
  refs: string[];
};
export type LabelKey = "overall" | "value" | "budget" | "premium" | "for";
export type Label = { key: LabelKey; text: string };
export const LABEL_WORDS: Record<Exclude<LabelKey, "for">, string> = {
  overall: "Best overall",
  value: "Best value",
  budget: "Budget",
  premium: "Premium",
};

// ── Offers, the deal and the watch ────────────────────────────────────────────────────────────────────────────────

export type Condition = "new" | "open-box" | "refurbished" | "used" | "marketplace";
export type Stock = "in" | "out" | "preorder" | "unknown";
// how a price was read: the store page's own data first; text is the page's words, read by the model and checked
export type Method = "shopify" | "jsonld" | "meta" | "microdata" | "text" | "link" | "";
// ok: read; blocked: the store turned the reader away; unreadable: no price on the page; link: a store kestrel only
// links to; mismatch: the page is another product; unsearched: the run's searches ran out before this store
export type ReadState = "ok" | "blocked" | "unreadable" | "link" | "mismatch" | "unsearched";
export const DATA_METHODS: Method[] = ["shopify", "jsonld", "meta", "microdata"];

export type OfferView = {
  id: string;
  product: string;
  store: string; // the store's domain
  storeName: string;
  url: string;
  seller: string;
  condition: Condition;
  price: number | null;
  regular: number | null;
  shipping: number | null;
  total: number | null; // price plus shipping when known
  currency: string;
  stock: Stock;
  pickup: boolean | null;
  validUntil: string | null;
  method: Method;
  read: ReadState;
  words: string; // a text price: the page's exact words
  why: string; // a row that isn't read: why, in words
  seen: string;
  best: boolean; // the lowest verified total, new, sold by the store, in stock online
};

export type VerdictWord = "history" | "inflated" | "new-low" | "good" | "high" | "typical";
export const VERDICT_WORDS: Record<VerdictWord, string> = {
  history: "Not enough history",
  inflated: "Inflated discount",
  "new-low": "New low",
  good: "Good price",
  high: "High",
  typical: "Typical",
};
export type Verdict = {
  word: VerdictWord;
  line: string; // facts and the judgement, from code's templates
  policies: string; // who matches the price, who refunds a drop
  links: { label: string; url: string }[]; // outside price histories
};

export type Watch = {
  until: string; // ISO: the watch ends then, with one line in the log
  everyHours: 4 | 12 | 24;
  stock: boolean; // a return to stock pings
  began: string;
  last: string | null; // the last check
  low: number | null; // the lowest best total since the watch began (cents)
  pinged: number | null; // the total the last target ping named; null while above the target
  wasOut: boolean; // out of stock at the last check
};

// ── The views ──────────────────────────────────────────────────────────────────────────────────────────────────────

export type ProductView = {
  id: string;
  want: string;
  key: string;
  name: string;
  brand: string;
  models: string[]; // every code it is sold under, the region's first
  facts: Record<string, Fact>;
  labels: Label[];
  score: number | null; // 0 to 100
  place: number | null; // its place among the finalists, 1 first; null when also considered
  out: string; // why it is only also considered; "" for a finalist
  flags: string[]; // must-haves its sources don't say (an unknown is never a pass)
  words: ProductWords;
  usual: number | null; // a usual price a source states
  evidence: Evidence;
  starred: boolean;
  status: Mark;
  target: number | null;
  watch: Watch | null;
  found: string;
  updated: string;
  price: number | null; // what it ranks on: the best verified total, else the usual price
  priceFrom: "offer" | "usual" | null;
  best: OfferView | null;
  verdict: Verdict | null;
  offers: OfferView[]; // read prices first (by total), then the rest
  reach: { read: number; links: number; blocked: number; text: number };
  budget: "yes" | "no" | "unknown" | null; // within the budget; null when none is set
};

export type SourceRef = {
  ref: string; // "s1"
  host: string;
  url: string;
  title: string;
  tier: "A" | "B" | "C";
  date: string | null;
  read: "page" | "snippet";
};
export type LogLine = { at: string; kind: "run" | "change" | "ping" | "watch"; text: string; product?: string };
export type WantResult = {
  assumptions: Said[];
  changeIf: Said[];
  conflicts: Said[];
  before: string[]; // the "before you buy" checks
  checked: boolean; // the second check ran
  notes: string[]; // what the run couldn't do (a reader out of room, a store left unsearched)
  searches: number;
  pages: number;
};

export type WantSummary = {
  id: string;
  words: string;
  state: WantState;
  step: string;
  status: Mark;
  starred: boolean;
  category: string;
  categoryName: string;
  created: string;
  updated: string;
  ran: string | null;
  error: string;
  budgetSet: boolean;
  currency: string;
  best: { product: string; name: string; price: number | null; store: string; verdict: VerdictWord | null } | null;
  picks: { label: string; name: string }[];
  compared: number;
  storesRead: number;
  blocked: number;
  links: number;
};

export type WantView = WantSummary & {
  budget: number | null; // whole units of the currency
  note: string;
  need: Need | null;
  kind: ListKind; // the compared list's kind: its fields are this want's criteria
  questions: (Question & { picked: number | null })[]; // picked: my answer; null takes the default
  products: ProductView[]; // the finalists, in place order
  also: ProductView[]; // also considered, each with its reason
  deleted: { id: string; name: string; at: string }[];
  sources: SourceRef[];
  log: LogLine[];
  result: WantResult | null;
  rule: string; // how it ranks, printed on the page
  read: boolean; // kestrel reads store pages itself (shopping.read)
};

export type WatchedView = {
  product: string;
  want: string;
  name: string;
  price: number | null;
  target: number | null;
  until: string;
  verdict: VerdictWord | null;
};
export type ShoppingHome = {
  wants: WantSummary[];
  figures: { wants: number; watching: number; drops: number; atTarget: number };
  watching: WatchedView[];
  pings: (LogLine & { want: string })[];
  // the wants I deleted, newest first: the page's foot keeps them with Restore
  deleted: { id: string; words: string; at: string }[];
  lastRead: string | null;
  currency: string;
  rule: string;
};

export const RANK_RULE =
  "Ranked by kestrel's own rule: each criterion's measured or stated value from sources that test, weighted for this kind of product and my answers; must-haves checked one by one; prices from the stores' own page data. No ads, no affiliate links, no paid ranking.";

// ── The two kinds ──────────────────────────────────────────────────────────────────────────────────────────────────

// offers: a fixed kind. In stock, new only and a store are filters; the total sorts
export const OFFER_KIND: ListKind = {
  key: "offer",
  name: "Offers",
  fields: [
    { key: "storeName", label: "Store", type: "text" },
    { key: "total", label: "Total", type: "money", better: "lower" },
    { key: "regular", label: "Regular", type: "money", better: "lower" },
    { key: "stock", label: "Stock", type: "enum" },
    { key: "condition", label: "Condition", type: "enum" },
    { key: "seen", label: "Checked", type: "date" },
    { key: "inStock", label: "In stock", type: "bool" },
    { key: "isNew", label: "New only", type: "bool" },
  ],
  filters: [
    { key: "stock", label: "In stock", field: "inStock", how: "flag" },
    { key: "new", label: "New only", field: "isNew", how: "flag" },
    { key: "store", label: "Store", field: "storeName", how: "is" },
  ],
  sorts: [
    { key: "total", label: "Total", field: "total", dir: "asc" },
    { key: "store", label: "Store", field: "storeName", dir: "asc" },
  ],
  title: "storeName",
  figure: "total",
  facts: ["regular", "stock", "condition"],
  currency: "CAD",
};

// an offer as a row of the offer kind: only a read price counts as a total
export const offerRow = (o: OfferView): Row => ({
  id: o.id,
  values: {
    storeName: o.storeName,
    total: o.read === "ok" ? o.total : null,
    regular: o.regular,
    stock: o.stock,
    condition: o.condition,
    seen: o.seen,
    inStock: o.read === "ok" && o.stock === "in",
    isNew: o.condition === "new",
  },
});

// a want's products: a kind whose fields are the want's criteria. Number criteria filter by "at least" (or "at most"
// when lower is better), a yes-or-no criterion is a flag, the labels and the stores are rows of pills; the sorts are
// score, value, price and each criterion
export function productKind(need: Need | null, currency = "CAD"): ListKind {
  const criteria = [...(need?.criteria ?? [])].sort((a, b) => b.weight - a.weight);
  const fields: Field[] = [
    { key: "name", label: "Product", type: "text" },
    { key: "labels", label: "Labels", type: "list" },
    { key: "price", label: "Price", type: "money", better: "lower" },
    { key: "score", label: "Score", type: "score", better: "higher" },
    { key: "value", label: "Value", type: "number", better: "higher" },
    { key: "stores", label: "Sold at", type: "list" },
    { key: "inStock", label: "In stock", type: "bool" },
    ...criteria.map(
      (c): Field => ({
        key: `c:${c.key}`,
        label: c.label,
        type: c.type === "bool" ? "bool" : c.type === "enum" ? "enum" : c.type === "score" ? "score" : "number",
        ...(c.unit ? { unit: c.unit } : {}),
        better: c.better,
      }),
    ),
  ];
  const filters: KindFilter[] = [
    { key: "label", label: "Labels", field: "labels", how: "is" },
    ...criteria.flatMap((c): KindFilter[] =>
      c.type === "bool"
        ? [{ key: `c:${c.key}`, label: c.label, field: `c:${c.key}`, how: "flag" }]
        : c.type === "enum"
          ? [{ key: `c:${c.key}`, label: c.label, field: `c:${c.key}`, how: "is" }]
          : [
              {
                key: `c:${c.key}`,
                label: c.label,
                field: `c:${c.key}`,
                how: c.better === "lower" ? "atMost" : "atLeast",
              },
            ],
    ),
    { key: "store", label: "Sold at", field: "stores", how: "is" },
    { key: "stock", label: "In stock", field: "inStock", how: "flag" },
  ];
  const sorts: KindSort[] = [
    { key: "score", label: "Score", field: "score" },
    { key: "value", label: "Value", field: "value" },
    { key: "price", label: "Price", field: "price", dir: "asc" },
    ...criteria
      .filter((c) => c.type !== "bool")
      .map((c) => ({ key: `c:${c.key}`, label: c.label, field: `c:${c.key}` })),
  ];
  return {
    key: `product:${need?.category ?? "any"}`,
    name: need?.name ?? "Products",
    fields,
    filters,
    sorts,
    title: "name",
    figure: "price",
    facts: criteria.slice(0, 3).map((c) => `c:${c.key}`),
    currency,
  };
}

// value: score points per hundred dollars, so a cheaper product of the same quality ranks higher
export const valuePer = (score: number | null, price: number | null): number | null =>
  score === null || price === null || price <= 0 ? null : Math.round((score / (price / 10_000)) * 10) / 10;

// a product as a row of its want's kind: a value marked unsure is kept for the "?" and left out of every filter and sort
export function productRow(p: ProductView): Row {
  const values: Row["values"] = {
    name: p.name,
    labels: p.labels.map((l) => l.text),
    price: p.price,
    score: p.score,
    value: valuePer(p.score, p.price),
    stores: [...new Set(p.offers.filter((o) => o.read === "ok" && o.price !== null).map((o) => o.storeName))],
    inStock: p.offers.some((o) => o.read === "ok" && o.stock === "in"),
  };
  const unsure: string[] = [];
  for (const [k, f] of Object.entries(p.facts)) {
    values[`c:${k}`] = f.v;
    if (f.unsure) unsure.push(`c:${k}`);
  }
  return { id: p.id, values, unsure };
}

export const priceText = (cents: number | null, currency = "CAD"): string =>
  cents === null ? "—" : formatMoney(cents, currency);
