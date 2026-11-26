// Compare, its reading half: the searches planned in code from the category's testers, the pages gathered with
// Research's gathering (the trusted tiers first; forums, paid seals and blocked sites never read), and each page read by
// the model, then checked by code. A value is kept only when its quote is on the page the model saw and holds its
// number; it is kept as unsure (never ranked) when the quote sits outside the product's own part of the page. A product
// the page never names, a page about another kind and a label the page doesn't give are dropped. Lines that give orders
// to an assistant are taken out of a page before the model sees it.
import { callModel, type ModelAnswer, type ModelSettings } from "../../ai/client.ts";
import { readPrompt, SYSTEM } from "../../ai/shopping/prompt.ts";
import { ReadAnswer } from "../../ai/shopping/shape.ts";
import type { Hit } from "../../ai/web.ts";
import type { FactValue, Need, SourceRef } from "../../shared/shopping.ts";
import { numbersIn } from "../grounding.ts";
import { gatherPages } from "../web-pages.ts";
import { type Host, hostEntry, hostOf, type Region } from "./region.ts";
import { type ScrubContext, scrubQuery, withWords } from "./scrub.ts";

// what Read kept of one product on one page
export type Found = {
  source: string; // the page's ref, "s2"
  name: string;
  brand: string;
  models: string[];
  label: string;
  facts: Record<string, { v: FactValue; unit?: string; quote: string; unsure?: boolean }>;
  pros: { text: string; quote: string }[];
  cons: { text: string; quote: string }[];
  skip: { text: string; quote: string }[];
  price: number | null; // cents in the region's currency, when the page states one
};
export type Method = { buysOwn: boolean; numbers: boolean; date: string | null };
export type PageRead = {
  ok: boolean;
  why: string;
  text: string; // exactly what the model saw: the quote check runs on it
  method: Method;
  products: Found[];
  dropped: number; // lines that gave orders, taken out
};

// text as the checks compare it: Unicode quotes and dashes made plain, the table and markup marks gone, case and runs
// of spaces ignored. Line breaks stay, so a table row is still a line
export const fold = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/[|*#]/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .trim();

// a line that talks to an assistant or tells its reader to drop their instructions: data never gives orders
const ORDERS =
  /\b(?:ignore|disregard|forget)\b.{0,40}\b(?:instructions|rules|prompt)\b|\b(?:ai|language model|llm|chat ?bot)s?\b.{0,20}\b(?:assistants?|agents?|reading|crawlers?)\b|\bassistants? reading\b|\bsystem prompt\b/i;
export function withoutOrders(text: string): { text: string; dropped: number } {
  const lines = text.split("\n");
  const kept = lines.filter((l) => !ORDERS.test(l));
  return { text: kept.join("\n"), dropped: lines.length - kept.length };
}

// a name or code as a pattern on folded text: its letters and digits in order, a dash or a space allowed between, never
// inside a longer word or code
const nameRe = (s: string): RegExp | null => {
  const chars = fold(s).replace(/[^a-z0-9]/g, "");
  if (chars.length < 2) return null;
  return new RegExp(`(?<![a-z0-9])${[...chars].join("[-\\s]?")}(?![a-z0-9])`, "g");
};
const positions = (flat: string, names: string[]): number[] => {
  const out: number[] = [];
  for (const n of names) {
    const re = nameRe(n);
    if (re) for (const m of flat.matchAll(re)) out.push(m.index ?? 0);
  }
  return out;
};
const sameNumber = (v: number, quote: string): boolean =>
  numbersIn(quote, true).some((n) => Math.abs(Number.parseFloat(n.n.replace(/,/g, "")) - v) < 1e-9);

// whether an occurrence at `at` sits in the product's own part: after one of its mentions and before the next product's,
// on a line that names it (a table row, a heading), or inside a quote that names it
function inPart(at: number, folded: string, mine: number[], all: { at: number; who: number }[], who: number): boolean {
  const lineFrom = folded.lastIndexOf("\n", at - 1) + 1;
  const lineTo = folded.indexOf("\n", at);
  const end = lineTo === -1 ? folded.length : lineTo;
  if (mine.some((m) => m >= lineFrom && m < end)) return true;
  const before = all.filter((m) => m.at <= at).sort((a, b) => b.at - a.at)[0];
  return before?.who === who;
}

// the model's answer for one page, checked: see the top of this file
export function checkPage(
  answer: ReadAnswer,
  text: string,
  need: Pick<Need, "name" | "criteria"> & { words?: string[] },
  currency: string,
  source: string,
): Found[] {
  const folded = fold(text);
  const flat = folded.replace(/\n/g, " ");
  // a page about another kind gives no product
  const kindWords = [need.name, ...(need.words ?? [])].map((w) => fold(w)).filter(Boolean);
  if (!kindWords.some((w) => flat.includes(w))) return [];
  const products = answer.products.map((p, who) => ({ p, who, names: [p.name, ...p.models] }));
  const all = products.flatMap((x) => positions(flat, x.names).map((at) => ({ at, who: x.who })));
  const criteria = new Map(need.criteria.map((c) => [c.key, c]));
  const out: Found[] = [];
  for (const { p, who, names } of products) {
    const mine = all.filter((m) => m.who === who).map((m) => m.at);
    if (!mine.length) continue; // the page never names it
    const named = (q: string) => names.some((n) => nameRe(n)?.test(fold(q)));
    const placeOf = (quote: string): "part" | "page" | "none" => {
      const q = fold(quote).replace(/\n/g, " ");
      if (q.length < 2) return "none";
      let at = flat.indexOf(q);
      if (at === -1) return "none";
      if (named(quote)) return "part";
      for (; at !== -1; at = flat.indexOf(q, at + 1)) if (inPart(at, folded, mine, all, who)) return "part";
      return "page";
    };
    const facts: Found["facts"] = {};
    for (const [key, f] of Object.entries(p.facts)) {
      const c = criteria.get(key);
      if (!c) continue;
      if (typeof f.v === "number" && !sameNumber(f.v, f.quote)) continue; // the number isn't in its quote
      if (typeof f.v === "string" && !fold(f.quote).includes(fold(f.v))) continue;
      if (c.type === "bool" && typeof f.v !== "boolean") continue;
      if ((c.type === "number" || c.type === "score") && typeof f.v !== "number") continue;
      const where = placeOf(f.quote);
      if (where === "none") continue; // the quote isn't on the page
      facts[key] = {
        v: f.v,
        ...(f.unit || c.unit ? { unit: f.unit || c.unit } : {}),
        quote: f.quote,
        ...(where === "page" ? { unsure: true } : {}),
      };
    }
    const lines = (list: { text: string; quote: string }[]) =>
      list.filter((x) => placeOf(x.quote) === "part").slice(0, 4);
    const label = p.label && (placeOf(p.label) === "part" || lineWith(folded, p.label, mine)) ? p.label : "";
    const priceOk =
      p.price && (!p.price.currency || p.price.currency.toUpperCase() === currency) && sameNumber(p.price.amount, flat)
        ? Math.round(p.price.amount * 100)
        : null;
    out.push({
      source,
      name: p.name,
      brand: p.brand,
      models: p.models,
      label,
      facts,
      pros: lines(p.pros),
      cons: lines(p.cons),
      skip: lines(p.skip),
      price: priceOk,
    });
  }
  return out;
}

// a label on the same line as one of the product's mentions ("Best overall: Brisk R7")
function lineWith(folded: string, label: string, mine: number[]): boolean {
  const l = fold(label);
  for (const m of mine) {
    const from = folded.lastIndexOf("\n", m) + 1;
    const to = folded.indexOf("\n", m);
    if (folded.slice(from, to === -1 ? undefined : to).includes(l)) return true;
  }
  return false;
}

// one review page through the model (fenced as data, a fixed room) and the code's checks
export async function readReviewPage(
  page: { url: string; title: string; text: string },
  need: Need & { words?: string[] },
  ask: { models: ModelSettings; model: string; record: (a: ModelAnswer<unknown>) => void },
  currency: string,
  source: string,
): Promise<PageRead> {
  const { text, dropped } = withoutOrders(page.text);
  const got = await callModel(
    { ...ask.models, careful: ask.model, fast: ask.model },
    { model: ask.model, system: SYSTEM, prompt: readPrompt({ ...page, text }, need), maxTokens: 6000, thinking: false },
    ReadAnswer,
  );
  ask.record(got);
  const none = { buysOwn: false, numbers: false, date: null };
  if (!got.ok) return { ok: false, why: got.why, text, method: none, products: [], dropped };
  return {
    ok: true,
    why: "",
    text,
    method: got.value.method,
    products: checkPage(got.value, text, need, currency, source),
    dropped,
  };
}

// ── The searches ───────────────────────────────────────────────────────────────────────────────────────────────────

// a source's tier: the source file's, else B when its page states a testing method, else C
export const tierOf = (hosts: Host[], url: string, method?: Method): "A" | "B" | "C" | "never" =>
  hostEntry(hosts, url)?.tier ?? (method && (method.buysOwn || method.numbers) ? "B" : "C");

// the searches, planned in code: one per trusted source of the category (four at most), one open search, one in the
// region; each scrubbed, and one left with no product word is skipped
export function planSearches(need: Need, region: Region, hosts: Host[], scrub: ScrubContext, year: number): string[] {
  const ctx = withWords(scrub, [need.name, ...need.searchWords.split(/\s+/)]);
  const words = need.searchWords || need.name.toLowerCase();
  const trusted = need.sources
    .map((h) => ({ h, e: hosts.find((x) => x.host === h) }))
    .filter((x) => x.e?.tier !== "never" && x.e?.tier !== "C")
    .sort((a, b) => (a.e?.tier ?? "B").localeCompare(b.e?.tier ?? "B"))
    .slice(0, 4);
  const queries = [
    ...trusted.map((x) => `site:${x.h} best ${words}`),
    `best ${words} ${year}`,
    `best ${words} ${region.searchWords}`.trim(),
  ];
  return [...new Set(queries.map((q) => scrubQuery(q, ctx)).filter((q): q is string => Boolean(q)))];
}

// which hits to read, in order: tier A, then B, then hosts the file doesn't know; forums, paid seals, blocked and
// paywalled sites are never read (their snippets stay as sources)
export function readOrder(hits: Hit[], hosts: Host[]): Hit[] {
  const rankOf = (h: Hit) => {
    const e = hostEntry(hosts, h.url);
    if (!e) return 2;
    if (e.tier === "never" || e.tier === "C" || e.access !== "plain") return -1;
    return e.tier === "A" ? 0 : 1;
  };
  return hits
    .map((h, i) => ({ h, i, r: rankOf(h) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.h);
}

export type Reviews = { pages: { url: string; title: string; text: string }[]; snippets: SourceRef[]; hits: Hit[] };

// the reviews gathered: the planned searches through the run's searcher, eight pages read at most, a few spare
export async function gatherReviews(
  queries: string[],
  hosts: Host[],
  how: { search: (q: string) => Promise<Hit[]>; read: (url: string) => Promise<string>; onStep?: (s: string) => void },
  pages = 8,
): Promise<Reviews> {
  const { hits, pages: read } = await gatherPages(queries, {
    search: how.search,
    read: (h) => how.read(h.url),
    pages,
    perSearch: 3,
    order: (all) => readOrder(all, hosts),
    onSearch: (n) => how.onStep?.(`Searching (${n} searches)`),
    onRead: (n) => how.onStep?.(`Reading reviews (${n} pages at most)`),
  });
  const snippets = hits
    .filter((h) => {
      const e = hostEntry(hosts, h.url);
      return e && e.tier !== "never" && e.tier !== "C" && e.access !== "plain";
    })
    .map((h) => ({
      ref: "",
      host: hostOf(h.url),
      url: h.url,
      title: h.title,
      tier: (hostEntry(hosts, h.url)?.tier ?? "B") as "A" | "B",
      date: null,
      read: "snippet" as const,
    }));
  return { pages: read.map((p) => ({ url: p.url, title: p.title, text: p.text })), snippets, hits };
}
