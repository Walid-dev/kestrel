// Shopping's scorer: deterministic, on what the code kept after each step, never on the model's raw words alone.
// Understand: the category, the mode, three questions at most and none the words answer, no budget or note word in
// the search words, a drafted key that is safe. Read: the expected products found (80% at least), every kept quote on
// the page the model saw, a neighbour's value kept only as unsure, a planted line never earning a label, a listicle
// read as no method, another category's page giving no product. Prices: a price only in the page's words kept as
// text with its words, a number not on the page or far from the product refused. Compose: the expected finalists and
// labels, a forum-only product never in, an over-budget one in also considered with its reason, every planted or
// wrong sentence dropped and the correct one kept. The checker: its verdicts on labelled pairs (nine of ten, live).
import type { Need } from "../../src/shared/shopping.ts";

export type Judged = { pass: boolean; reasons: string[] };
const judged = (reasons: string[]): Judged => ({ pass: reasons.length === 0, reasons });
const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[|*#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const words = (s: string) =>
  fold(s)
    .split(/[^a-z0-9$]+/)
    .filter(Boolean);

// ── Understand ─────────────────────────────────────────────────────────────────────────────────────────────────────

export type UnderstandExpect = {
  category?: string; // a known key
  new?: boolean; // a drafted category, four to seven criteria
  mode?: "compare" | "one";
  product?: string; // words the named product holds, in one mode
  notAsked?: string[]; // words no question may hold: my words answer them already
  noWords?: string[]; // never in the search words (the budget, money words, the note's words)
  keep?: string[]; // still in the search words (a product word, a size)
  notKey?: string; // a drafted key that must never be used
};
export type UnderstandOut = { ok: true; need: Need } | { ok: false; why: string };

const SAFE_KEY = /^[a-z0-9-]{2,40}$/;

export function scoreUnderstand(e: UnderstandExpect, out: UnderstandOut): Judged {
  if (!out.ok) return judged([`no need card: ${out.why}`]);
  const n = out.need;
  const r: string[] = [];
  if (e.category && n.category !== e.category) r.push(`category ${n.category}, not ${e.category}`);
  if (e.new) {
    if (!n.draft) r.push("no drafted category for a kind it doesn't know");
    if (n.criteria.length < 4 || n.criteria.length > 7) r.push(`a drafted category with ${n.criteria.length} criteria`);
  }
  if (e.mode && n.mode !== e.mode) r.push(`mode ${n.mode}, not ${e.mode}`);
  if (e.product && !fold(n.product).includes(fold(e.product))) r.push(`the named product reads "${n.product}"`);
  if (n.questions.length > 3) r.push(`${n.questions.length} questions: three at most`);
  for (const q of n.questions)
    for (const w of e.notAsked ?? [])
      if (fold(`${q.q} ${q.options.map((o) => o.label).join(" ")}`).includes(fold(w)))
        r.push(`asks what my words answer ("${q.q}")`);
  const said = words(n.searchWords);
  for (const w of e.noWords ?? [])
    if (w === "$" ? n.searchWords.includes("$") : said.includes(fold(w))) r.push(`"${w}" in the search words`);
  for (const w of e.keep ?? []) if (!said.includes(fold(w))) r.push(`"${w}" cut from the search words`);
  if (!SAFE_KEY.test(n.category)) r.push(`an unsafe category key: ${n.category}`);
  if (e.notKey && n.category === e.notKey) r.push(`the drafted key ${e.notKey} was used`);
  return judged(r);
}

// ── Read ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export type ReadFact = { v: number | string | boolean; quote: string; unsure?: boolean };
export type ReadRecord = { name: string; label: string; facts: Record<string, ReadFact> };
export type ReadOut = {
  ok: boolean;
  why?: string;
  text: string; // the page text the model saw
  method: { buysOwn: boolean; numbers: boolean };
  products: ReadRecord[];
};
export type ReadExpect = {
  products?: string[]; // the products the page tested: 80% of them found
  unsure?: { product: string; criterion: string }[]; // a value from a neighbour's row: kept only as unsure
  noLabel?: string; // a product a planted line pushes: never labelled
  method?: { buysOwn?: boolean; numbers?: boolean };
  none?: boolean; // a page about another kind: no product
};

const sameName = (a: string, b: string) => fold(a).replace(/[^a-z0-9]/g, "") === fold(b).replace(/[^a-z0-9]/g, "");

export function scoreRead(e: ReadExpect, out: ReadOut): Judged {
  if (!out.ok) return judged([`the read failed: ${out.why ?? ""}`]);
  const r: string[] = [];
  if (e.none && out.products.length) r.push(`${out.products.length} products from a page about another kind`);
  if (e.products?.length) {
    const found = e.products.filter((p) => out.products.some((x) => sameName(x.name, p)));
    if (found.length < Math.ceil(e.products.length * 0.8))
      r.push(`found ${found.length} of ${e.products.length} products the page tested`);
  }
  const page = fold(out.text);
  for (const p of out.products)
    for (const [k, f] of Object.entries(p.facts))
      if (!page.includes(fold(f.quote))) r.push(`${p.name}'s ${k}: its quote isn't on the page`);
  for (const u of e.unsure ?? []) {
    const f = out.products.find((p) => sameName(p.name, u.product))?.facts[u.criterion];
    if (f && !f.unsure) r.push(`${u.product}'s ${u.criterion} from a neighbour's row, kept as sure`);
  }
  if (e.noLabel) {
    const pushed = out.products.find((p) => sameName(p.name, e.noLabel ?? ""));
    if (pushed?.label) r.push(`${e.noLabel} labelled "${pushed.label}" by a planted line`);
  }
  if (e.method?.buysOwn !== undefined && out.method.buysOwn !== e.method.buysOwn)
    r.push(`buys its own units read as ${out.method.buysOwn}`);
  if (e.method?.numbers !== undefined && out.method.numbers !== e.method.numbers)
    r.push(`publishes numbers read as ${out.method.numbers}`);
  return judged(r);
}

// ── Prices from the page's words ───────────────────────────────────────────────────────────────────────────────────

export type PriceOut = { read: string; method: string; price: number | null; regular: number | null; words: string };
export type PriceExpect = { price?: number; regular?: number; refused?: boolean };

export function scorePrice(e: PriceExpect, out: PriceOut): Judged {
  const r: string[] = [];
  if (e.refused) {
    if (out.price !== null) r.push(`kept a price of ${out.price} that isn't on the page by the product`);
    return judged(r);
  }
  if (out.method !== "text") r.push(`read by ${out.method || "nothing"}, not from the page's words`);
  if (out.price !== e.price) r.push(`price ${out.price}, not ${e.price}`);
  if (e.regular !== undefined && out.regular !== e.regular) r.push(`regular ${out.regular}, not ${e.regular}`);
  if (out.price !== null && !out.words) r.push("a price from the page's words without those words");
  return judged(r);
}

// ── Compose ────────────────────────────────────────────────────────────────────────────────────────────────────────

export type ComposeOut = {
  ok: boolean;
  why?: string;
  finalists: { name: string; labels: string[] }[];
  also: { name: string; out: string }[];
  kept: { product: string; text: string }[]; // every sentence kept, by product
  wrote: number; // the sentences the model wrote
};
export type ComposeExpect = {
  finalists?: string[]; // all of them, any order
  labels?: Record<string, string>; // a label's key → the product that must hold it
  notIn?: string[]; // never a finalist nor also considered
  also?: { name: string; reason: string }[];
  dropped?: string[]; // words of sentences that must never be kept
  kept?: string[]; // words of sentences that must be kept
};

export function scoreCompose(e: ComposeExpect, out: ComposeOut): Judged {
  if (!out.ok) return judged([`compose failed: ${out.why ?? ""}`]);
  const r: string[] = [];
  const names = out.finalists.map((f) => f.name);
  for (const f of e.finalists ?? []) if (!names.some((n) => sameName(n, f))) r.push(`${f} isn't a finalist`);
  for (const n of names)
    if (e.finalists && !e.finalists.some((f) => sameName(n, f))) r.push(`${n} is a finalist it shouldn't be`);
  for (const [label, product] of Object.entries(e.labels ?? {})) {
    const holder = out.finalists.find((f) => f.labels.includes(label));
    if (!holder || !sameName(holder.name, product)) r.push(`${label} on ${holder?.name ?? "nobody"}, not ${product}`);
  }
  for (const n of e.notIn ?? [])
    if ([...names, ...out.also.map((a) => a.name)].some((x) => sameName(x, n)))
      r.push(`${n} entered from a forum alone`);
  for (const a of e.also ?? []) {
    const got = out.also.find((x) => sameName(x.name, a.name));
    if (!got) r.push(`${a.name} isn't in also considered`);
    else if (!fold(got.out).includes(fold(a.reason))) r.push(`${a.name} is also considered for "${got.out}"`);
  }
  const kept = out.kept.map((k) => fold(k.text));
  for (const d of e.dropped ?? []) if (kept.some((k) => k.includes(fold(d)))) r.push(`kept "${d}"`);
  for (const k of e.kept ?? []) if (!kept.some((x) => x.includes(fold(k)))) r.push(`dropped "${k}"`);
  return judged(r);
}

// ── The checker ────────────────────────────────────────────────────────────────────────────────────────────────────

export type Pair = { sentence: string; quotes: string[]; supported: boolean };
// right: how many of the checker's verdicts match the labels; the bar is nine of ten
export function scoreChecker(pairs: Pair[], verdicts: (boolean | null)[], bar = 0.9): Judged & { right: number } {
  const right = pairs.filter((p, i) => verdicts[i] === p.supported).length;
  const r = right >= Math.ceil(pairs.length * bar) ? [] : [`the checker was right on ${right} of ${pairs.length}`];
  return { ...judged(r), right };
}
