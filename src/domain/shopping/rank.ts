// The ranking, in code (pure): the want's need card, my answers, my budget, the products' facts, evidence and prices in;
// each product's score, place, labels and, for one only also considered, its reason out. A model never ranks.
// - Weights: the category's, then the use's and my answers' (the weights they name replace those criteria's), all
//   scaled back to 100.
// - Each criterion is scaled by its ratio to the best value (v/best when higher is better, best/v when lower is), so a
//   product nearly as good scores nearly as much; a score or a measured number holds one source's values only (the merge
//   chose it), so scales never mix. A missing or unsure value gives its weight to the known ones; coverage is the share
//   of weight known.
// - Must-haves are checked one by one, the check kept: one failed sends the product to also considered with its reason;
//   an unknown is a flag, never a pass. Over the budget is a failed must-have; an unknown price is a flag.
// - The finalists are the top scores that pass, up to the list's size, coverage breaking ties; the rest are also
//   considered, each with why.
// - Labels: best overall (the top finalist with half its weight known or more), best value, budget, premium and best
//   for a need, two at most a product, and none for a product with under half its weight known. Best value and budget
//   sit above a quality floor of 70% of the top score.
import type { Criterion, Evidence, Fact, Hard, Label, Need } from "../../shared/shopping.ts";

// premium: better on the criterion that weighs most by 3% of the best value at least (3 points on a lab's 100-point
// score: past a lab's noise; a tenth, under ratio scaling, asked for more than a top score leaves room for)
const PREMIUM = 0.03;

export type RankProduct = { id: string; facts: Record<string, Fact>; price: number | null; evidence: Evidence };
export type Ranked = {
  id: string;
  score: number | null;
  place: number | null;
  labels: Label[];
  out: string;
  flags: string[];
  coverage: number;
};

// the weights: the category's, then the use's and my answers' (the weights they name replace those criteria's), all
// scaled back to a sum of 100
export function weightsFor(need: Need, answers: Record<string, number>): Record<string, number> {
  const w: Record<string, number> = Object.fromEntries(need.criteria.map((c) => [c.key, c.weight]));
  const replace = (named: Record<string, number> | undefined) => {
    for (const [k, v] of Object.entries(named ?? {})) if (k in w && Number.isFinite(v) && v >= 0) w[k] = v;
  };
  replace(need.uses[need.use]);
  for (const q of need.questions) replace(q.options[answers[q.key] ?? q.default]?.weights);
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  return sum > 0 ? Object.fromEntries(Object.entries(w).map(([k, v]) => [k, (v * 100) / sum])) : w;
}

// a value the ranking may use: there, not unsure, and a number or a yes-or-no
const usable = (f: Fact | undefined): number | null => {
  if (!f || f.unsure) return null;
  if (typeof f.v === "number" && Number.isFinite(f.v)) return f.v;
  if (typeof f.v === "boolean") return f.v ? 1 : 0;
  return null;
};

// each product's place on one criterion, 0 to 1 with 1 the best; null when unknown. By ratio to the best, not by the
// spread: 87 against 90 is 0.97, never 0 because it is the lowest of three close ones. Values at or under zero have no
// ratio, so they fall back to the spread
function scaled(c: Criterion, products: RankProduct[]): Map<string, number> {
  const known = products.flatMap((p) => {
    const v = usable(p.facts[c.key]);
    return v === null ? [] : [{ id: p.id, v }];
  });
  const out = new Map<string, number>();
  if (!known.length) return out;
  const lo = Math.min(...known.map((k) => k.v));
  const hi = Math.max(...known.map((k) => k.v));
  const ratio = lo > 0;
  for (const k of known) {
    if (c.type === "bool") out.set(k.id, k.v);
    else if (hi === lo) out.set(k.id, 1);
    else if (ratio) out.set(k.id, c.better === "lower" ? lo / k.v : k.v / hi);
    else out.set(k.id, c.better === "lower" ? (hi - k.v) / (hi - lo) : (k.v - lo) / (hi - lo));
  }
  return out;
}

const unitOf = (c: Criterion | undefined) => (c?.unit ? ` ${c.unit}` : "");

// one must-have against one product: its reason when it fails, a flag when no source says, nothing when it passes
function check(h: Hard, c: Criterion | undefined, f: Fact | undefined): { fail?: string; flag?: string } {
  if (!c) return {};
  if (!f || f.unsure) return { flag: `${h.says || c.label}: no source says` };
  if (c.type === "bool") {
    const want = h.is === undefined ? true : h.is === true || h.is === "true";
    return f.v === want ? {} : { fail: want ? `no ${c.label.toLowerCase()}` : `has ${c.label.toLowerCase()}` };
  }
  if (c.type === "enum") return h.is === undefined || String(f.v) === String(h.is) ? {} : { fail: `not ${h.is}` };
  const v = typeof f.v === "number" ? f.v : Number.NaN;
  if (Number.isNaN(v)) return { flag: `${h.says || c.label}: no source says` };
  if (h.min !== undefined && v < h.min) return { fail: `${c.label.toLowerCase()} under ${h.min}${unitOf(c)}` };
  if (h.max !== undefined && v > h.max) return { fail: `${c.label.toLowerCase()} over ${h.max}${unitOf(c)}` };
  return {};
}

// the must-haves: my words' and those my answers add
export function hardsOf(need: Need, answers: Record<string, number>): Hard[] {
  const fromAnswers = need.questions.flatMap((q) => q.options[answers[q.key] ?? q.default]?.hard ?? []);
  return [...need.hard, ...fromAnswers];
}

// the criteria a need names: an implied need's words, or the option I picked (its biggest weight)
function namedCriteria(need: Need, answers: Record<string, number>): Criterion[] {
  const out: Criterion[] = [];
  for (const text of need.implied.map((i) => i.toLowerCase()))
    for (const c of need.criteria)
      if (text.includes(c.key.replace(/-/g, " ")) || text.includes(c.label.toLowerCase())) out.push(c);
  for (const q of need.questions) {
    const picked = answers[q.key];
    const w = picked === undefined ? undefined : q.options[picked]?.weights;
    const top = Object.entries(w ?? {}).sort((a, b) => b[1] - a[1])[0];
    const c = top && need.criteria.find((x) => x.key === top[0]);
    if (c) out.push(c);
  }
  return [...new Set(out)];
}

export function rank(
  need: Need,
  answers: Record<string, number>,
  products: RankProduct[],
  budget: number | null = null,
): Ranked[] {
  const weights = weightsFor(need, answers);
  const scales = new Map(need.criteria.map((c) => [c.key, scaled(c, products)]));
  const hards = hardsOf(need, answers);
  const byKey = new Map(need.criteria.map((c) => [c.key, c]));
  const rows = products.map((p) => {
    let total = 0;
    let known = 0;
    for (const c of need.criteria) {
      const s = scales.get(c.key)?.get(p.id);
      if (s === undefined) continue;
      total += s * (weights[c.key] ?? 0);
      known += weights[c.key] ?? 0;
    }
    const fails: string[] = [];
    const flags: string[] = [];
    if (budget !== null) {
      if (p.price === null) flags.push("price unknown: the budget can't be checked");
      else if (p.price > budget * 100) fails.push("over the budget");
    }
    for (const h of hards) {
      const got = check(h, byKey.get(h.criterion), p.facts[h.criterion]);
      if (got.fail) fails.push(got.fail);
      if (got.flag) flags.push(got.flag);
    }
    return {
      p,
      score: known > 0 ? (total / known) * 100 : null,
      coverage: known / 100,
      fails,
      flags,
    };
  });
  // all scored, then gated: a mediocre product with many sources never pushes out a better one with fewer
  const passing = rows
    .filter((r) => !r.fails.length && r.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.coverage - a.coverage);
  const finalists = passing.slice(0, need.listSize);
  const labels = new Map<string, Label[]>(finalists.map((r) => [r.p.id, []]));
  // a label needs half the weight known at least: a product judged on one criterion is labelled for nothing
  const sure = new Set(finalists.filter((r) => r.coverage >= 0.5).map((r) => r.p.id));
  const give = (id: string | undefined, label: Label) => {
    const held = id && sure.has(id) ? labels.get(id) : undefined;
    if (held && held.length < 2 && !held.some((l) => l.key === label.key && l.text === label.text)) held.push(label);
  };
  const lead = finalists.find((r) => r.coverage >= 0.5);
  if (lead) {
    give(lead.p.id, { key: "overall", text: "Best overall" });
    const top = lead.score ?? 0;
    // the quality floor: 70% of the top score. Ratio scaling sits every score higher than min-max did (the weakest of a
    // close list scores 55, not 0), so the first build's 60% let clearly weaker products carry Budget and Best value
    const floor = 0.7 * top;
    const priced = finalists.filter(
      (r) => r !== lead && sure.has(r.p.id) && r.p.price !== null && (r.score ?? 0) >= floor,
    );
    // best value: the best score per dollar among those near the top and cheaper than the best overall; when none is
    // cheaper, among those 20% or more under the finalists' median price. It waits for a price
    const prices = finalists.flatMap((r) => (r.p.price === null ? [] : [r.p.price])).sort((a, b) => a - b);
    const median = prices.length ? (prices[(prices.length - 1) >> 1] + prices[prices.length >> 1]) / 2 : null;
    const near = priced.filter(
      (r) => (r.score ?? 0) >= 0.9 * top && (lead.p.price === null || (r.p.price ?? 0) < lead.p.price),
    );
    const pool = near.length ? near : median === null ? [] : priced.filter((r) => (r.p.price ?? 0) <= 0.8 * median);
    const value = [...pool].sort((a, b) => (b.score ?? 0) / (b.p.price ?? 1) - (a.score ?? 0) / (a.p.price ?? 1))[0];
    if (value) give(value.p.id, { key: "value", text: "Best value" });
    // budget: the cheapest above the quality floor, cheaper than the best overall and not above the finalists' median
    // (a Budget dearer than the best overall would mislead)
    const cheap = priced.filter(
      (r) =>
        (lead.p.price === null || (r.p.price ?? 0) < lead.p.price) && (median === null || (r.p.price ?? 0) <= median),
    );
    const cheapest = [...cheap].sort((a, b) => (a.p.price ?? 0) - (b.p.price ?? 0))[0];
    if (cheapest) give(cheapest.p.id, { key: "budget", text: "Budget" });
    // premium: clearly better on the criterion that weighs most, for more money
    const decisive = need.criteria.reduce((a, b) => ((weights[b.key] ?? 0) > (weights[a.key] ?? 0) ? b : a));
    const s = scales.get(decisive.key);
    const leadOn = s?.get(lead.p.id);
    if (s && leadOn !== undefined && lead.p.price !== null) {
      const better = finalists
        .filter((r) => r !== lead && sure.has(r.p.id) && r.p.price !== null && (r.p.price ?? 0) > (lead.p.price ?? 0))
        .filter((r) => (s.get(r.p.id) ?? -1) - leadOn >= PREMIUM - 1e-9)
        .sort((a, b) => (s.get(b.p.id) ?? 0) - (s.get(a.p.id) ?? 0))[0];
      if (better) give(better.p.id, { key: "premium", text: "Premium" });
    }
    // best for a need: the top on a criterion an implied need or my answer names, when that isn't the best overall
    for (const c of namedCriteria(need, answers)) {
      const on = scales.get(c.key);
      const best = finalists
        .filter((r) => sure.has(r.p.id) && on?.get(r.p.id) !== undefined)
        .sort((a, b) => (on?.get(b.p.id) ?? 0) - (on?.get(a.p.id) ?? 0))[0];
      if (best && best !== lead) give(best.p.id, { key: "for", text: `Best for ${c.label.toLowerCase()}` });
    }
  }
  const place = new Map(finalists.map((r, i) => [r.p.id, i + 1]));
  return rows.map((r) => ({
    id: r.p.id,
    score: r.score,
    place: place.get(r.p.id) ?? null,
    labels: labels.get(r.p.id) ?? [],
    out: place.has(r.p.id)
      ? ""
      : r.fails.length
        ? r.fails.join("; ")
        : r.score === null
          ? "no source measured it on these criteria"
          : `ranked below the list's ${need.listSize}`,
    flags: r.flags,
    coverage: r.coverage,
  }));
}

// the top pick of a ranking: the best overall, else the first finalist
export const topOf = (ranked: Ranked[]): string | null =>
  ranked.find((r) => r.labels.some((l) => l.key === "overall"))?.id ?? ranked.find((r) => r.place === 1)?.id ?? null;

// the questions whose answer changes the top pick, my other answers held: each option ranked again (pure and cheap).
// A question none of whose options moves the top is noise on the page
export function deciding(
  need: Need,
  answers: Record<string, number>,
  products: RankProduct[],
  budget: number | null = null,
): Set<string> {
  const out = new Set<string>();
  for (const q of need.questions) {
    const tops = new Set(q.options.map((_, i) => topOf(rank(need, { ...answers, [q.key]: i }, products, budget))));
    if (tops.size > 1) out.add(q.key);
  }
  return out;
}
