// Compare, its composing half: what Read kept from each page merged into products, ranked in code, then the reasons
// written by the model and checked twice. The merge: records with a shared code (normalised: case, spaces, dashes,
// colour suffixes, the region's model rules) or the same brand and name are one product; independent sources counted (a
// family once); a product with no tier A or B source dropped; each criterion's value from one source (the one that
// covers most products on it), the others kept as notes and a difference over 10% kept as a conflict. The write: the
// finalists in shuffled order, three a call, with the labels code gave and their quotes numbered; a finalist whose
// reasons were all lost shows its sources' own words, and the loss is logged. The check: code first (each ref
// exists; every number in the sentence is in its quotes, the products' names and codes taken out first, so "Fen 300"
// is a name, not a claim), then the checker model, sentence by sentence; if it fails, the code-checked ones stay.
import { callModel, type ModelAnswer, type ModelSettings } from "../../ai/client.ts";
import { distinctive } from "../../ai/shopping/product-data.ts";
import { checkPrompt, SYSTEM, type WriteProduct, writePrompt } from "../../ai/shopping/prompt.ts";
import { CheckAnswer, WriteAnswer } from "../../ai/shopping/shape.ts";
import type { Evidence, Fact, Need, ProductWords, Said, SourceRef } from "../../shared/shopping.ts";
import { holds, numbersIn } from "../grounding.ts";
import type { Found } from "./compare.ts";
import { type Ranked, rank, unmeasured, weightsFor } from "./rank.ts";
import type { Region } from "./region.ts";
import type { ProductInput } from "./store.ts";
import { NO_WORDS } from "./store.ts";

export type Source = SourceRef & { family: string };
export type Merged = ProductInput & { conflicts: Said[] };

const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
// a code as it is matched: case, spaces and dashes gone, a colour suffix (/B, -BLK) dropped, and another region's
// suffix read as this region's (by the region's rules), so the same product sold under two codes is one
export function normCode(code: string, brand: string, region?: Pick<Region, "modelRules">): string {
  let c = code
    .toUpperCase()
    .replace(/\/[A-Z]{1,3}$/, "")
    .replace(/-(BLK|WHT|BLACK|WHITE|SLV|GRY)$/, "");
  for (const r of region?.modelRules ?? [])
    if (r.brand.toLowerCase() === brand.toLowerCase())
      for (const e of r.elsewhere) if (c.endsWith(e.toUpperCase())) c = c.slice(0, c.length - e.length) + r.here;
  return plain(c);
}
// brands compared as letters only, accents and marks aside ("Fjällräven" is "Fjallraven", "Arc'teryx" is "Arcteryx")
const letters = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
// a product's name with its brand first: a page often names the model alone ("L40 Ultra", "Nuuk Parka"), and a name
// without its maker can't be searched or recognised in a store
export function withBrand(brand: string, name: string): string {
  const b = brand.trim();
  if (!b || letters(name).startsWith(letters(b))) return name.trim();
  return `${b} ${name.trim()}`;
}
// a known brand a name starts with, or that stands right before it on the page ("Dreame L40 Ultra" for "L40 Ultra")
export function brandIn(name: string, brands: string[], before = ""): string {
  const n = letters(name);
  const tail = letters(before.slice(-40));
  const long = [...brands].sort((a, b) => b.length - a.length);
  return (
    long.find((b) => letters(b).length > 1 && n.startsWith(letters(b))) ??
    long.find((b) => letters(b).length > 1 && tail.endsWith(letters(b))) ??
    ""
  );
}

// a product's key: its brand and its name without the brand, so a run again finds it
export const keyOf = (brand: string, name: string): string => {
  const b = brand.trim().toLowerCase();
  const n = name.trim().toLowerCase();
  const rest = b && n.startsWith(b) ? n.slice(b.length).trim() : n;
  return `${b} ${rest}`.replace(/\s+/g, " ").trim();
};

const months = (date: string | null, now: Date) => {
  if (!date || !/^\d{4}-\d{2}/.test(date)) return null;
  const [y, m] = date.split("-").map(Number);
  return (now.getUTCFullYear() - y) * 12 + (now.getUTCMonth() + 1 - m);
};

// the records merged into products, each with its facts from one source per criterion, its evidence and its usual
// price; a product no tier A or B source tested is gone
export function mergeFound(
  found: Found[],
  sources: Source[],
  need: Need,
  region: Pick<Region, "modelRules"> & { currency?: string },
  now: Date,
): Merged[] {
  const src = new Map(sources.map((s) => [s.ref, s]));
  const groups: Found[][] = [];
  for (const f of found) {
    const codes = f.models.map((m) => normCode(m, f.brand, region)).filter((c) => c.length >= 2);
    const key = keyOf(f.brand, f.name);
    const g = groups.find((x) =>
      x.some(
        (y) =>
          keyOf(y.brand, y.name) === key ||
          (codes.length > 0 && y.models.some((m) => codes.includes(normCode(m, y.brand, region)))),
      ),
    );
    if (g) g.push(f);
    else groups.push([f]);
  }
  // each criterion's chosen source: the one that covers most products on it, ties to the category's source order
  const order = (ref: string) => {
    const i = need.sources.indexOf(src.get(ref)?.host ?? "");
    return i === -1 ? need.sources.length : i;
  };
  const chosen = new Map<string, string>();
  for (const c of need.criteria) {
    const cover = new Map<string, number>();
    for (const g of groups)
      for (const ref of new Set(g.filter((f) => f.facts[c.key] && !f.facts[c.key].unsure).map((f) => f.source)))
        cover.set(ref, (cover.get(ref) ?? 0) + 1);
    const best = [...cover.entries()].sort((a, b) => b[1] - a[1] || order(a[0]) - order(b[0]))[0];
    if (best) chosen.set(c.key, best[0]);
  }
  const out: Merged[] = [];
  for (const g of groups) {
    const refs = [...new Set(g.map((f) => f.source))];
    const testers = refs.filter((r) => ["A", "B"].includes(src.get(r)?.tier ?? "C"));
    if (!testers.length) continue; // no source that tests: a forum or a listicle alone never brings a product
    const families = new Set(testers.map((r) => src.get(r)?.family || src.get(r)?.host || r));
    const first = g.find((f) => ["A", "B"].includes(src.get(f.source)?.tier ?? "C")) ?? g[0];
    // the brand from any of its sources, else a known maker its name starts with; the name shown and searched with it
    const brand = g.find((f) => f.brand.trim())?.brand.trim() || brandIn(first.name, need.brands ?? []);
    const head = { ...first, brand, name: withBrand(brand, first.name) };
    const facts: Record<string, Fact> = {};
    const conflicts: Said[] = [];
    for (const c of need.criteria) {
      const all = g.filter((f) => f.facts[c.key]).map((f) => ({ ...f.facts[c.key], ref: f.source }));
      if (!all.length) continue;
      const spec = c.type !== "score" && !c.measured;
      const pick =
        all.find((x) => x.ref === chosen.get(c.key) && !x.unsure) ??
        all.find((x) => x.ref === chosen.get(c.key)) ??
        (spec ? (all.find((x) => !x.unsure) ?? all[0]) : undefined);
      const others = all.filter((x) => x !== pick).map(({ v, unit, ref, quote }) => ({ v, unit, ref, quote }));
      if (pick) {
        facts[c.key] = {
          v: pick.v,
          ...(pick.unit ? { unit: pick.unit } : {}),
          ref: pick.ref,
          quote: pick.quote,
          ...(pick.unsure ? { unsure: true } : {}),
          ...(others.length ? { others } : {}),
        };
        for (const o of others)
          if (
            typeof o.v === "number" &&
            typeof pick.v === "number" &&
            pick.v !== 0 &&
            Math.abs(o.v - pick.v) / Math.abs(pick.v) > 0.1
          )
            conflicts.push({
              text: `${head.name}: ${c.label} reads ${pick.v}${c.unit ? ` ${c.unit}` : ""} in one source and ${o.v}${c.unit ? ` ${c.unit}` : ""} in another.`,
              refs: [pick.ref, o.ref],
            });
      } else if (others.length) facts[c.key] = { ...others[0], unsure: true, others: others.slice(1) };
    }
    const dates = refs.map((r) => src.get(r)?.date ?? null);
    const ages = dates.map((d) => months(d, now)).filter((m): m is number => m !== null);
    // the list price a testing source states, the region's currency first, then the better tier
    const priced = g
      .filter((f) => f.price !== null && ["A", "B"].includes(src.get(f.source)?.tier ?? "C"))
      .sort(
        (a, b) =>
          Number(b.price?.currency === region.currency) - Number(a.price?.currency === region.currency) ||
          (src.get(a.source)?.tier ?? "C").localeCompare(src.get(b.source)?.tier ?? "C"),
      );
    const list = priced[0]?.price
      ? {
          price: priced[0].price.cents,
          currency: priced[0].price.currency,
          ref: priced[0].source,
          quote: priced[0].price.quote,
        }
      : null;
    const evidence: Evidence = {
      sources: families.size,
      a: testers.filter((r) => src.get(r)?.tier === "A").length,
      b: testers.filter((r) => src.get(r)?.tier === "B").length,
      newest:
        dates
          .filter((d): d is string => Boolean(d))
          .sort()
          .at(-1) ?? null,
      thin: families.size < 2,
      old: ages.length > 0 && ages.every((m) => m > Math.min(12, need.refreshMonths)),
      refs,
      ...(list ? { list } : {}),
    };
    // pros, cons and who should skip it, in the page's own words (checked to be on it), never the model's summary
    const said = (list: (f: Found) => { text: string; quote: string }[]) =>
      g.flatMap((f) => list(f).map((x) => ({ text: x.quote, refs: [f.source] }))).slice(0, 4);
    // the codes it is sold under, only those that tell it apart: "850" or "Heritage" alone is no model to show or match
    const models = [...new Set(g.flatMap((f) => f.models))].filter(distinctive);
    out.push({
      key: keyOf(head.brand, head.name),
      name: head.name,
      brand: head.brand,
      models: sortModels(models, head.brand, region),
      facts,
      words: {
        ...NO_WORDS,
        pros: said((f) => f.pros),
        cons: said((f) => f.cons),
        skip: said((f) => f.skip),
      },
      usual: list && list.currency === region.currency ? list.price : null,
      evidence,
      conflicts,
    });
  }
  return out;
}

// the region's own code first (by the region's rules), then the rest
function sortModels(models: string[], brand: string, region: Pick<Region, "modelRules">): string[] {
  const here = region.modelRules
    .filter((r) => r.brand.toLowerCase() === brand.toLowerCase())
    .map((r) => r.here.toUpperCase());
  return [...models].sort(
    (a, b) =>
      Number(here.some((h) => b.toUpperCase().endsWith(h))) - Number(here.some((h) => a.toUpperCase().endsWith(h))),
  );
}

// ── Write and check ────────────────────────────────────────────────────────────────────────────────────────────────

// a want's own shuffle: the same want always shuffles the same way, so a run can be checked again
function shuffled<T>(list: T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rnd = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// the products' names, brands and codes taken out of a sentence before its numbers are checked
export function withoutNames(sentence: string, products: { name: string; brand: string; models: string[] }[]): string {
  let s = sentence;
  // codes first (R5-C before Brisk R5, so no "-C" is left behind), then names, then brands
  const byLength = (l: string[]) => [...l].sort((a, b) => b.length - a.length);
  const names = [
    ...byLength(products.flatMap((p) => p.models)),
    ...byLength(products.map((p) => p.name)),
    ...byLength(products.map((p) => p.brand)),
  ];
  for (const n of names) {
    const chars = n.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (chars.length < 2) continue;
    s = s.replace(new RegExp(`(?<![a-z0-9])${[...chars].join("[-\\s]?")}(?![a-z0-9])`, "gi"), " ");
  }
  return s;
}

// a sentence's numbers all in its quotes, the names taken out first
export function numbersHold(
  sentence: string,
  quotes: string[],
  products: { name: string; brand: string; models: string[] }[],
): boolean {
  const source = numbersIn(quotes.join(" "), true);
  return numbersIn(withoutNames(sentence, products)).every((x) => holds(source, x));
}

export type Composed = {
  ranked: Ranked[];
  words: Map<string, ProductWords>; // by product key
  assumptions: Said[];
  changeIf: Said[];
  conflicts: Said[];
  checked: boolean;
  wrote: number; // sentences the model wrote, before any check
  notes: string[];
  lost: string; // where the reasons were lost, in one line for the run's log; "" when none was
};

type Ask = {
  models: ModelSettings;
  model: string;
  checkModel: string;
  record: (purpose: string, a: ModelAnswer<unknown>) => void;
  step?: (s: string) => void;
};

// products per write call: a small answer fits its room with no thinking, and one answer that can't be read loses three
// products' reasons, not the list's (the first live run's single call ran out of room twice in three wants)
export const WRITE_BATCH = 3;
const WRITE_ROOM = 4000;

// a sentence's refs as the model gave them, made the prompt's own: "q3", "Q3", "[q3]", 3 and "3" are q3; a source's
// ref ("s1") stands for the product's quotes from that source; refs written inside the text count too and leave it:
// "… [q3]", "… (q3, q4)", "… (source: q4)", "… [refs: q1, q2]", and q-numbers alone at the sentence's end ("… q5.")
export function refsOf(raw: string[], text: string, bySource: Map<string, string[]>): { refs: string[]; text: string } {
  // inside square brackets a bare number is a ref ("[3]"); inside parentheses only a q or s one is ("(q3)"), so "(40)"
  // in a sentence stays a number. A label may come first ("source:", "refs:", "quotes:", "see")
  const LABEL = "(?:(?:refs?|references?|sources?|quotes?|citations?|see)\\s*[:=]?\\s*)?";
  const listOf = (item: string) => `((?:${item}\\s*(?:[,;&]|and)?\\s*)+)`;
  const REF = new RegExp(`\\[\\s*${LABEL}${listOf("[qs]?\\d+")}\\]|\\(\\s*${LABEL}${listOf("[qs]\\d+")}\\)`, "gi");
  // the prompt's q-numbers alone at the end, lowercase only: "Samsung Q80" is a TV, "q80" is a ref
  const TAIL = /(?:\s|^)((?:q\d+\s*(?:[,;&]|and)?\s*)+)([.!?]?)\s*$/;
  const inline = [...text.matchAll(REF)].flatMap((m) => (m[1] ?? m[2] ?? "").split(/[\s,;&]+|and/i));
  let clean = text.replace(new RegExp(`\\s*(?:${REF.source})`, "gi"), "");
  const tail = TAIL.exec(clean);
  if (tail) {
    inline.push(...tail[1].split(/[\s,;&]+|and/));
    clean = `${clean.slice(0, tail.index).trimEnd()}${tail[2]}`;
  }
  clean = clean.replace(/\s+([.,;:!?])/g, "$1").trim();
  const refs: string[] = [];
  for (const r of [...raw, ...inline].map((x) => x.replace(/[[\]()\s]/g, "").toLowerCase()).filter(Boolean)) {
    const q = /^q?(\d+)$/.exec(r);
    if (q) refs.push(`q${Number(q[1])}`);
    else if (/^s\d+$/.test(r)) refs.push(...(bySource.get(r) ?? []));
  }
  return { refs: [...new Set(refs)], text: clean };
}

// reasons from the sources themselves, for a finalist whose written ones were all lost: its values on the criteria that
// weigh most, each in its source's words, then a pro in the page's words. A product on the list always says why
export function sourcesWhy(m: Pick<Merged, "facts" | "words">, need: Need, weights: Record<string, number>): Said[] {
  const out: Said[] = [];
  const quoted = new Set<string>();
  const order = [...need.criteria].sort((a, b) => (weights[b.key] ?? 0) - (weights[a.key] ?? 0));
  for (const c of order) {
    const f = m.facts[c.key];
    if (!f || f.unsure || out.length >= 2 || quoted.has(f.quote)) continue;
    quoted.add(f.quote);
    // the criterion named once: "Warmth 8.5" says what it is, "93% of embedded sand" needs "Carpet pickup:" before it
    const says = f.quote.toLowerCase().includes(c.label.toLowerCase());
    out.push({ text: says ? `“${f.quote}”` : `${c.label}: “${f.quote}”`, refs: [f.ref] });
  }
  for (const p of m.words.pros)
    if (out.length < 3 && !quoted.has(p.text)) {
      quoted.add(p.text);
      out.push({ text: `“${p.text}”`, refs: p.refs });
    }
  return out;
}

// the merged products ranked, their reasons written and checked. price: each product's price for the ranking (cents)
export async function composeList(
  input: {
    seed: string;
    need: Need;
    answers: Record<string, number>;
    budget: number | null;
    merged: Merged[];
    price: (m: Merged) => number | null;
    other?: (m: Merged) => { price: number; currency: string } | null;
  },
  ask: Ask,
): Promise<Composed> {
  const { need, answers, merged } = input;
  const ranked = rank(
    need,
    answers,
    merged.map((m) => ({
      id: m.key,
      facts: m.facts,
      price: input.price(m),
      other: input.other?.(m) ?? null,
      evidence: m.evidence,
    })),
    input.budget,
  );
  const byKey = new Map(merged.map((m) => [m.key, m]));
  const finalists = ranked.filter((r) => r.place !== null).sort((a, b) => (a.place ?? 0) - (b.place ?? 0));
  const notes: string[] = [];
  // under half the kind's weight measured by any source: no label is earned, and the page says what went unmeasured
  const gap = unmeasured(need, answers, merged);
  if (finalists.length && gap.share < 0.5 - 1e-9) {
    const names = gap.missing.map((c) => c.label.toLowerCase());
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names.at(-1)}` : names[0];
    notes.push(`measure ${list}: no source gave a value, so the list is ranked on the rest and earns no label`);
  }
  const assumptions: Said[] = need.questions
    .filter((q) => answers[q.key] === undefined)
    .map((q) => ({ text: `${q.q} Taken as "${q.options[q.default]?.label ?? ""}" until I answer.`, refs: [] }));
  const conflicts: Said[] = merged.flatMap((m) => m.conflicts).slice(0, 6);
  const words = new Map<string, ProductWords>(merged.map((m) => [m.key, { ...m.words }]));
  if (!finalists.length)
    return { ranked, words, assumptions, changeIf: [], conflicts, checked: false, wrote: 0, notes, lost: "" };

  // the prompt: shuffled, ids that say nothing of the place, every quote numbered across the whole list
  ask.step?.("Writing");
  const order = shuffled(finalists, input.seed);
  const quotes = new Map<string, { quote: string; ref: string; product: string }>();
  const products: WriteProduct[] = order.map((r, i) => {
    const m = byKey.get(r.id) as Merged;
    const lines: WriteProduct["quotes"] = [];
    const add = (what: string, quote: string, ref: string) => {
      const q = `q${quotes.size + 1}`;
      quotes.set(q, { quote, ref, product: m.key });
      lines.push({ q, what, quote, ref });
    };
    for (const c of need.criteria) {
      const f = m.facts[c.key];
      if (f && !f.unsure) add(c.key, f.quote, f.ref);
    }
    for (const [what, list] of [
      ["pro", m.words.pros],
      ["con", m.words.cons],
      ["skip", m.words.skip],
    ] as const)
      for (const x of list) add(what, x.text, x.refs[0] ?? "");
    return {
      id: `p${i + 1}`,
      name: m.name,
      labels: r.labels.map((l) => l.text),
      evidence: `${m.evidence.sources} independent ${m.evidence.sources === 1 ? "source" : "sources"} (${m.evidence.a} tier A)`,
      quotes: lines,
    };
  });
  const idOf = new Map(products.map((p, i) => [p.id, order[i].id]));
  // an id as a model may write it: "p3", "P3", 3, or the product's name (with or without its brand, in any case)
  const productOf = (id: string): string | undefined => {
    const n = /^p?(\d+)$/i.exec(id.trim())?.[1];
    if (n) return idOf.get(`p${Number(n)}`);
    const want = plain(id);
    if (want.length < 3) return undefined;
    const named =
      products.find((p) => plain(p.name) === want) ??
      products.find((p) => plain(p.name).endsWith(want) || want.endsWith(plain(p.name)));
    return named ? idOf.get(named.id) : undefined;
  };
  const needWords = {
    name: need.name,
    use: need.use,
    implied: need.implied,
    answers: need.questions
      .filter((q) => answers[q.key] !== undefined)
      .map((q) => `${q.q} ${q.options[answers[q.key]]?.label ?? ""}`),
  };
  type Line = {
    product: string | null;
    slot: "why" | "tradeoff" | "notFor" | "assumptions" | "changeIf" | "conflicts";
    text: string;
    refs: string[];
  };
  const lines: Line[] = [];
  let unread = 0; // products whose batch's answer couldn't be read
  let stray = 0; // sentences written for a product id the batch doesn't hold
  let roomOut = false;
  for (let at = 0; at < products.length; at += WRITE_BATCH) {
    const batch = products.slice(at, at + WRITE_BATCH);
    const write = await callModel(
      { ...ask.models, careful: ask.model, fast: ask.model },
      {
        model: ask.model,
        system: SYSTEM,
        prompt: writePrompt(needWords, batch, at === 0),
        maxTokens: WRITE_ROOM,
        thinking: false,
      },
      WriteAnswer,
    );
    ask.record("write", write);
    if (!write.ok) {
      unread += batch.length;
      if (write.why === "out-of-room") roomOut = true;
      continue;
    }
    const inBatch = new Set(batch.map((p) => idOf.get(p.id)));
    // a source's ref ("s1") stands for the product's quotes from that source (the list's: this batch's products')
    const sourcesOf = (product: string | null) => {
      const by = new Map<string, string[]>();
      for (const [q, x] of quotes)
        if (product === null ? inBatch.has(x.product) : x.product === product)
          by.set(x.ref, [...(by.get(x.ref) ?? []), q]);
      return by;
    };
    const push = (product: string | null, slot: Line["slot"], s: { text: string; refs: string[] }) => {
      const r = refsOf(s.refs, s.text, sourcesOf(product));
      lines.push({ product, slot, text: r.text, refs: r.refs });
    };
    for (const p of write.value.products) {
      const product = productOf(p.id);
      if (!product || !inBatch.has(product)) {
        stray += p.why.length + (p.tradeoff ? 1 : 0) + (p.notFor ? 1 : 0);
        continue;
      }
      for (const s of p.why.slice(0, 3)) push(product, "why", s);
      if (p.tradeoff) push(product, "tradeoff", p.tradeoff);
      if (p.notFor) push(product, "notFor", p.notFor);
    }
    if (at === 0)
      for (const slot of ["assumptions", "changeIf", "conflicts"] as const)
        for (const s of write.value[slot]) push(null, slot, s);
  }
  if (unread)
    notes.push(
      roomOut
        ? `the writer ran out of room for ${unread} ${unread === 1 ? "product" : "products"}: their reasons are their sources' own words`
        : `the writer's answer for ${unread} ${unread === 1 ? "product" : "products"} couldn't be read: their reasons are their sources' own words`,
    );
  const wrote = lines.filter((l) => l.text).length + stray;
  const names = finalists.map((r) => byKey.get(r.id) as Merged);
  // the code's check: every sentence rests on a quote kestrel gave, every ref exists, and every number is in its quotes
  // (the names taken out first). A sentence with no ref is never kept: nothing would check it
  const dropped = { refs: 0, numbers: 0, checker: 0 };
  const passed = lines.filter((l) => {
    if (!l.text) return false;
    if (!l.refs.length || l.refs.some((r) => !quotes.has(r))) {
      dropped.refs++;
      return false;
    }
    if (
      !numbersHold(
        l.text,
        l.refs.map((r) => quotes.get(r)?.quote ?? ""),
        names,
      )
    ) {
      dropped.numbers++;
      return false;
    }
    return true;
  });
  // the checker: each sentence with its quotes, supported only when they say it
  ask.step?.("Checking");
  let kept = passed;
  let checked = false;
  if (passed.length) {
    const check = await callModel(
      { ...ask.models, careful: ask.checkModel, fast: ask.checkModel },
      {
        model: ask.checkModel,
        system: SYSTEM,
        prompt: checkPrompt(
          passed.map((l, i) => ({ n: i + 1, text: l.text, quotes: l.refs.map((r) => quotes.get(r)?.quote ?? "") })),
        ),
        maxTokens: 3000,
        thinking: false,
      },
      CheckAnswer,
    );
    ask.record("check", check);
    if (check.ok) {
      checked = true;
      const no = new Set(check.value.verdicts.filter((v) => !v.supported).map((v) => v.n));
      kept = passed.filter((_l, i) => !no.has(i + 1));
      dropped.checker = passed.length - kept.length;
    } else notes.push("the second check didn't run: the reasons kept passed the code's checks only");
  } else checked = true;
  // what is kept, its quote refs turned into its sources
  const said = (l: Line): Said => ({
    text: l.text,
    refs: [...new Set(l.refs.map((r) => quotes.get(r)?.ref ?? "").filter(Boolean))],
  });
  const weights = weightsFor(need, answers);
  const lead = finalists.find((r) => r.labels.some((l) => l.key === "overall"))?.id;
  let fromSources = 0;
  for (const r of finalists) {
    const m = byKey.get(r.id) as Merged;
    const w = words.get(r.id) as ProductWords;
    const mine = kept.filter((l) => l.product === r.id);
    const one = (slot: Line["slot"]) => mine.find((l) => l.slot === slot);
    let why = mine.filter((l) => l.slot === "why").map(said);
    if (!why.length) {
      why = sourcesWhy(m, need, weights);
      fromSources++;
    }
    const tradeoff = one("tradeoff");
    const notFor = one("notFor");
    words.set(r.id, {
      ...w,
      why,
      // with none written, the page's own words stand in: its first con as the trade-off, who should skip it
      tradeoff: tradeoff ? said(tradeoff) : r.id !== lead && m.words.cons[0] ? m.words.cons[0] : null,
      notFor: notFor ? said(notFor) : (m.words.skip[0] ?? null),
    });
  }
  const general = (slot: Line["slot"]) => kept.filter((l) => l.slot === slot).map(said);
  // where the reasons were lost, never silent: the page's notes and the run's log say it
  const lostParts = [
    stray && `${stray} for a product id it wasn't given`,
    dropped.refs && `${dropped.refs} cited no quote kestrel gave`,
    dropped.numbers && `${dropped.numbers} held a number their quotes don't`,
    dropped.checker && `${dropped.checker} the checker found unsupported`,
    unread && `${unread} ${unread === 1 ? "product" : "products"} unread`,
  ].filter(Boolean);
  const lost =
    lostParts.length || fromSources
      ? `Reasons: ${wrote} written, ${kept.length} kept${lostParts.length ? ` (${lostParts.join(", ")})` : ""}${
          fromSources
            ? `; ${fromSources} ${fromSources === 1 ? "product shows its" : "products show their"} sources' own words instead`
            : ""
        }`
      : "";
  return {
    ranked,
    words,
    assumptions: [...assumptions, ...general("assumptions")].slice(0, 6),
    changeIf: general("changeIf").slice(0, 4),
    conflicts: [...conflicts, ...general("conflicts")].slice(0, 6),
    checked,
    wrote,
    notes,
    lost,
  };
}

// the "before you buy" checks: each tag's rule in the region, the category's traps, the must-haves no criterion holds
export function beforeYouBuy(need: Need, region: Pick<Region, "tagRules">): string[] {
  return [
    ...need.tags.flatMap((t) => (region.tagRules[t] ? [region.tagRules[t]] : [])),
    ...need.traps.map((t) => `Watch for: ${t}.`),
    ...need.hard
      .filter((h) => h.says && !need.criteria.some((c) => c.key === h.criterion) && !/budget|price|\$/i.test(h.says))
      .map((h) => `Check it says: ${h.says}.`),
  ];
}
