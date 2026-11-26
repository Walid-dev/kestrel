// The scrub (pure): nothing of mine goes into a search. The prompts ask the model to keep my budget and my note out of
// a query, but a local model can still write "under 600", and a budget often sits inside the want's own words ("a robot
// vacuum for pet hair under $600"). So code takes them out of every query Shopping sends, and of every search Ask
// makes on a want, whatever the prompt said:
// - every money amount and its words: a currency sign or code with a number, "under N", "below N", "max N", "N dollars",
//   and the word "budget";
// - every number my budget is, in any form ("600", "600.00", "$600"), whether I set it or my words say it;
// - every word of my note, except one that is also a product word (the category's words, the want's own words with the
//   money taken out, the names of the products searched for), so a note that repeats "carpet" doesn't empty the query.
// A query left with no product word is no search at all.
import type { Need } from "../../shared/shopping.ts";

export type ScrubContext = {
  budgets: string[]; // the numbers my budget is, as digits ("600")
  note: string[]; // my note's words, lowercase
  keep: string[]; // product words, lowercase: never taken out, and one must be left
  phrases: string[]; // product names and codes searched for: their numbers are a name, never a budget
};

const STOP = new Set(
  "a an the and or of to in on for with my me i is it at by be from this that best top review reviews vs versus new buy cheap good great site com www http https".split(
    " ",
  ),
);
const CUR = String.raw`(?:C\$|CA\$|US\$|\$|€|£)`;
const CODE = "(?:CAD|USD|EUR|GBP)";
// a number whole: never cut short to make the rule fit ("under 25 cm" is not "under 2")
const NUM = String.raw`\d[\d,.]*(?![\d,.])(?:\s?k\b)?`;
const UNITS = "kg|g|lbs?|cm|mm|m|in|inch|inches|ft|l|ml|w|v|mah|gb|tb|hz|db|h|hours?|min|minutes?|nits|°c|years?";
// money as words: the amount with its sign or code, the amount with "dollars", and the words that bound a price
const MONEY = new RegExp(
  [
    String.raw`(?:\b(?:under|below|less than|max(?:imum)?|up to|at most|no more than|around|about|within|budget(?: of| is)?)\s+)?${CUR}\s?${NUM}`,
    String.raw`(?:\b(?:under|below|less than|max(?:imum)?|up to|at most|no more than|around|about|within|budget(?: of| is)?)\s+)?\b${CODE}\s?${NUM}`,
    String.raw`(?:\b(?:under|below|less than|max(?:imum)?|up to|at most|no more than|around|about|within|budget(?: of| is)?)\s+)?\b${NUM}\s?(?:${CUR}|${CODE}\b|dollars?\b|bucks\b|euros?\b|pounds\b)`,
    // "under 600" is a price; "under 2 kg" or "under 9 cm" is a size, and stays
    String.raw`\b(?:under|below|less than|max(?:imum)?|up to|at most|no more than|budget(?: of| is)?)\s+${NUM}(?!\s?(?:${UNITS})\b|\s?["'°%])`,
    String.raw`\bbudget\b`,
  ].join("|"),
  "gi",
);
const wordsOf = (s: string): string[] =>
  s
    .toLowerCase()
    .split(/[^a-z0-9à-ÿ]+/)
    .filter(Boolean);
const digitsOf = (s: string): string | null => {
  const m = /\d[\d,.]*/.exec(s);
  if (!m) return null;
  const n = Number.parseFloat(m[0].replace(/,(?=\d{3}\b)/g, "").replace(/,/g, "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(/k\b/i.test(s) ? Math.round(n * 1000) : Math.round(n));
};

// the want's words with every money phrase taken out (Ask's page shows them so)
export const moneyless = (words: string): string =>
  words
    .replace(MONEY, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

// the amounts my words give as a budget ("under $150" is 150)
export const amountsIn = (words: string): string[] =>
  [...words.matchAll(MONEY)].map((m) => digitsOf(m[0])).filter((n): n is string => n !== null);

// a budget my words state, when I set none: the smallest amount in them, in whole units
export function budgetIn(words: string): number | null {
  const n = amountsIn(words)
    .map(Number)
    .filter((x) => x > 0);
  return n.length ? Math.min(...n) : null;
}

// what the scrub needs: my budget (set, or in my words or a must-have about price), my note, and the product words
export function scrubContext(
  want: { words: string; budget: number | null; note: string },
  need: Need | null,
  products: { name: string; brand?: string; models?: string[] }[] = [],
): ScrubContext {
  const budgets = new Set<string>(amountsIn(want.words));
  if (want.budget !== null) budgets.add(String(want.budget));
  for (const h of need?.hard ?? [])
    if (/budget|price|cost|\$|dollar|under|below|max/i.test(h.says)) for (const a of amountsIn(h.says)) budgets.add(a);
  const phrases = products.flatMap((p) => [p.name, ...(p.models ?? [])]).filter((s) => s.trim().length > 1);
  const keep = new Set<string>();
  for (const w of [
    ...wordsOf(moneyless(want.words)),
    ...(need ? [need.name, ...need.criteria.map((c) => c.label)].flatMap(wordsOf) : []),
    ...wordsOf(need?.searchWords ?? ""),
    ...products.flatMap((p) => [p.name, p.brand ?? "", ...(p.models ?? [])]).flatMap(wordsOf),
  ])
    if (!STOP.has(w) && !/^\d+$/.test(w)) keep.add(w);
  for (const p of phrases) for (const w of wordsOf(p)) keep.add(w);
  return { budgets: [...budgets], note: [...new Set(wordsOf(want.note))], keep: [...keep], phrases };
}
// the category's own words join the product words
export const withWords = (ctx: ScrubContext, words: string[]): ScrubContext => ({
  ...ctx,
  keep: [...new Set([...ctx.keep, ...words.flatMap(wordsOf).filter((w) => !STOP.has(w))])],
});

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// a query with nothing of mine in it, or null when no product word is left (the search is then skipped)
export function scrubQuery(query: string, ctx: ScrubContext): string | null {
  // a product's name or code is masked first: its number names it ("Fen 300"), whatever my budget is
  const masks: string[] = [];
  let q = query;
  for (const p of [...ctx.phrases].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(?<![\\w])${esc(p)}(?![\\w])`, "gi");
    q = q.replace(re, (m) => {
      masks.push(m);
      return `${masks.length - 1}`;
    });
  }
  q = q.replace(MONEY, " ");
  for (const b of ctx.budgets) {
    const n = Number(b);
    const forms = [b, `${b}.00`, `${b},00`, n >= 1000 ? `${b.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}` : ""].filter(
      Boolean,
    );
    for (const f of forms) q = q.replace(new RegExp(`(?<![\\w.,])${esc(f)}(?![\\w]|[.,]\\d)`, "g"), " ");
  }
  const keep = new Set(ctx.keep);
  for (const w of ctx.note)
    if (!keep.has(w) && !STOP.has(w))
      q = q.replace(new RegExp(`(?<![\\p{L}\\p{N}])${esc(w)}(?![\\p{L}\\p{N}])`, "giu"), " ");
  q = q
    .replace(/(\d+)/g, (_, i: string) => masks[Number(i)] ?? "")
    .replace(/""|''/g, " ")
    .replace(/\bsite:(?=\s|$)/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,;:.\-–—]+|[\s,;:\-–—]+$/g, "")
    .trim();
  const left = wordsOf(q.replace(/\bsite:\S+/gi, " "));
  return left.some((w) => keep.has(w)) ? q : null;
}

// a web address that carries something of mine: a budget number or a note word, as a word of the address
export function holdsMine(url: string, ctx: ScrubContext): boolean {
  let path = url.replace(/\+/g, " ");
  try {
    path = decodeURIComponent(path);
  } catch {
    // a broken escape: the address is read as it is written
  }
  path = path.replace(/^https?:\/\/[^/]+/i, " ");
  // a product's name or code in the address names the product, as in a query ("fen-300" is Fen 300)
  for (const p of ctx.phrases) {
    const chars = p.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (chars.length >= 2)
      path = path.replace(new RegExp(`(?<![a-z0-9])${[...chars].join("[-\\s_]?")}(?![a-z0-9])`, "gi"), " ");
  }
  const parts = wordsOf(path);
  const keep = new Set(ctx.keep);
  return parts.some((w) => ctx.budgets.includes(w) || (ctx.note.includes(w) && !keep.has(w) && !STOP.has(w)));
}
