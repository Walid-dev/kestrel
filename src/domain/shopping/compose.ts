// Compare, its composing half: what Read kept from each page merged into products, ranked in code, then the reasons
// written by the model and checked twice. The merge: records with a shared code (normalised: case, spaces, dashes,
// colour suffixes, the region's model rules) or the same brand and name are one product; independent sources counted (a
// family once); a product with no tier A or B source dropped; each criterion's value from one source (the one that
// covers most products on it), the others kept as notes and a difference over 10% kept as a conflict. The write: the
// finalists in shuffled order with the labels code gave and their quotes numbered. The check: code first (each ref
// exists; every number in the sentence is in its quotes, the products' names and codes taken out first, so "Fen 300"
// is a name, not a claim), then the checker model, sentence by sentence; if it fails, the code-checked ones stay.
import { callModel, type ModelAnswer, type ModelSettings } from "../../ai/client.ts";
import { checkPrompt, SYSTEM, type WriteProduct, writePrompt } from "../../ai/shopping/prompt.ts";
import { CheckAnswer, WriteAnswer } from "../../ai/shopping/shape.ts";
import type { Evidence, Fact, Need, ProductWords, Said, SourceRef } from "../../shared/shopping.ts";
import { holds, numbersIn } from "../grounding.ts";
import type { Found } from "./compare.ts";
import { type Ranked, rank } from "./rank.ts";
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
  region: Pick<Region, "modelRules">,
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
    const head = g.find((f) => ["A", "B"].includes(src.get(f.source)?.tier ?? "C")) ?? g[0];
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
    const priced = g
      .filter((f) => f.price !== null)
      .sort((a, b) => (src.get(a.source)?.tier ?? "C").localeCompare(src.get(b.source)?.tier ?? "C"));
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
    };
    // pros, cons and who should skip it, in the page's own words (checked to be on it), never the model's summary
    const said = (list: (f: Found) => { text: string; quote: string }[]) =>
      g.flatMap((f) => list(f).map((x) => ({ text: x.quote, refs: [f.source] }))).slice(0, 4);
    const models = [...new Set(g.flatMap((f) => f.models))];
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
      usual: priced[0]?.price ?? null,
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
};

type Ask = {
  models: ModelSettings;
  model: string;
  checkModel: string;
  record: (purpose: string, a: ModelAnswer<unknown>) => void;
  step?: (s: string) => void;
};

// the merged products ranked, their reasons written and checked. price: each product's price for the ranking (cents)
export async function composeList(
  input: {
    seed: string;
    need: Need;
    answers: Record<string, number>;
    budget: number | null;
    merged: Merged[];
    price: (m: Merged) => number | null;
  },
  ask: Ask,
): Promise<Composed> {
  const { need, answers, merged } = input;
  const ranked = rank(
    need,
    answers,
    merged.map((m) => ({ id: m.key, facts: m.facts, price: input.price(m), evidence: m.evidence })),
    input.budget,
  );
  const byKey = new Map(merged.map((m) => [m.key, m]));
  const finalists = ranked.filter((r) => r.place !== null).sort((a, b) => (a.place ?? 0) - (b.place ?? 0));
  const notes: string[] = [];
  const assumptions: Said[] = need.questions
    .filter((q) => answers[q.key] === undefined)
    .map((q) => ({ text: `${q.q} Taken as "${q.options[q.default]?.label ?? ""}" until I answer.`, refs: [] }));
  const conflicts: Said[] = merged.flatMap((m) => m.conflicts).slice(0, 6);
  const words = new Map<string, ProductWords>(merged.map((m) => [m.key, { ...m.words }]));
  if (!finalists.length)
    return { ranked, words, assumptions, changeIf: [], conflicts, checked: false, wrote: 0, notes };

  // the prompt: shuffled, ids that say nothing of the place, every quote numbered
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
  const write = await callModel(
    { ...ask.models, careful: ask.model, fast: ask.model },
    {
      model: ask.model,
      system: SYSTEM,
      prompt: writePrompt(
        {
          name: need.name,
          use: need.use,
          implied: need.implied,
          answers: need.questions
            .filter((q) => answers[q.key] !== undefined)
            .map((q) => `${q.q} ${q.options[answers[q.key]]?.label ?? ""}`),
        },
        products,
      ),
      maxTokens: 8000,
      thinking: true,
    },
    WriteAnswer,
  );
  ask.record("write", write);
  if (!write.ok) {
    notes.push(
      write.why === "out-of-room"
        ? "the writer ran out of room: the reasons are missing"
        : "the reasons couldn't be written",
    );
    return { ranked, words, assumptions, changeIf: [], conflicts, checked: false, wrote: 0, notes };
  }
  const names = finalists.map((r) => byKey.get(r.id) as Merged);
  type Line = {
    product: string | null;
    slot: "why" | "tradeoff" | "notFor" | "assumptions" | "changeIf" | "conflicts";
    text: string;
    refs: string[];
  };
  const lines: Line[] = [];
  const refsOf = (refs: string[]) => refs.map((r) => r.replace(/[[\]\s]/g, "").toLowerCase());
  for (const p of write.value.products) {
    const product = idOf.get(p.id);
    if (!product) continue;
    for (const s of p.why.slice(0, 3)) lines.push({ product, slot: "why", text: s.text, refs: refsOf(s.refs) });
    if (p.tradeoff) lines.push({ product, slot: "tradeoff", text: p.tradeoff.text, refs: refsOf(p.tradeoff.refs) });
    if (p.notFor) lines.push({ product, slot: "notFor", text: p.notFor.text, refs: refsOf(p.notFor.refs) });
  }
  for (const slot of ["assumptions", "changeIf", "conflicts"] as const)
    for (const s of write.value[slot]) lines.push({ product: null, slot, text: s.text, refs: refsOf(s.refs) });
  const wrote = lines.length;
  // the code's check: every ref exists; every number is in the refs' quotes, the names taken out first; a sentence with
  // no ref holds no number
  const passed = lines.filter((l) => {
    if (!l.text) return false;
    if (l.refs.some((r) => !quotes.has(r))) return false;
    if (!l.refs.length) return numbersIn(withoutNames(l.text, names)).length === 0;
    return numbersHold(
      l.text,
      l.refs.map((r) => quotes.get(r)?.quote ?? ""),
      names,
    );
  });
  // the checker: each sentence with its quotes, supported only when they say it
  ask.step?.("Checking");
  let kept = passed;
  let checked = false;
  const toCheck = passed.filter((l) => l.refs.length);
  if (toCheck.length) {
    const check = await callModel(
      { ...ask.models, careful: ask.checkModel, fast: ask.checkModel },
      {
        model: ask.checkModel,
        system: SYSTEM,
        prompt: checkPrompt(
          toCheck.map((l, i) => ({ n: i + 1, text: l.text, quotes: l.refs.map((r) => quotes.get(r)?.quote ?? "") })),
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
      kept = passed.filter((l) => !l.refs.length || !no.has(toCheck.indexOf(l) + 1));
    } else notes.push("the second check didn't run: the reasons kept passed the code's checks only");
  } else checked = true;
  // what is kept, its quote refs turned into its sources
  const said = (l: Line): Said => ({
    text: l.text,
    refs: [...new Set(l.refs.map((r) => quotes.get(r)?.ref ?? "").filter(Boolean))],
  });
  for (const [key, w] of words) {
    const mine = kept.filter((l) => l.product === key);
    words.set(key, {
      ...w,
      why: mine.filter((l) => l.slot === "why").map(said),
      tradeoff: mine.find((l) => l.slot === "tradeoff") ? said(mine.find((l) => l.slot === "tradeoff") as Line) : null,
      notFor: mine.find((l) => l.slot === "notFor") ? said(mine.find((l) => l.slot === "notFor") as Line) : null,
    });
  }
  const general = (slot: Line["slot"]) => kept.filter((l) => l.slot === slot).map(said);
  return {
    ranked,
    words,
    assumptions: [...assumptions, ...general("assumptions")].slice(0, 6),
    changeIf: general("changeIf").slice(0, 4),
    conflicts: [...conflicts, ...general("conflicts")].slice(0, 6),
    checked,
    wrote,
    notes,
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
