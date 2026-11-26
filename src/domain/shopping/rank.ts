// The ranking, in code (pure): the want's weights, my answers, the products' facts and prices in; each product's
// score, place and labels out. For now a weighted sum of the scaled facts with the top score named best overall; the
// full rules (gates, coverage, one source per measured criterion, every label) come with Compare.
import type { Evidence, Fact, Label, Need } from "../../shared/shopping.ts";

export type RankProduct = { id: string; facts: Record<string, Fact>; price: number | null; evidence: Evidence };
export type Ranked = {
  id: string;
  score: number | null;
  place: number | null;
  labels: Label[];
  out: string;
  flags: string[];
};

// the weights: the category's, then the use's and my answers' (the weights they name replace those criteria's), all
// scaled back to a sum of 100
export function weightsFor(need: Need, answers: Record<string, number>): Record<string, number> {
  const w: Record<string, number> = Object.fromEntries(need.criteria.map((c) => [c.key, c.weight]));
  const replace = (named: Record<string, number> | undefined) => {
    for (const [k, v] of Object.entries(named ?? {})) if (k in w && Number.isFinite(v) && v >= 0) w[k] = v;
  };
  replace(need.uses[need.use]);
  for (const q of need.questions) {
    const pick = answers[q.key] ?? q.default;
    replace(q.options[pick]?.weights);
  }
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  return sum > 0 ? Object.fromEntries(Object.entries(w).map(([k, v]) => [k, (v * 100) / sum])) : w;
}

const numeric = (f: Fact | undefined): number | null =>
  f && !f.unsure ? (typeof f.v === "number" ? f.v : typeof f.v === "boolean" ? Number(f.v) : null) : null;

export function rank(need: Need, answers: Record<string, number>, products: RankProduct[]): Ranked[] {
  const weights = weightsFor(need, answers);
  const scored = products.map((p) => {
    let total = 0;
    let known = 0;
    for (const c of need.criteria) {
      const values = products.map((x) => numeric(x.facts[c.key])).filter((v): v is number => v !== null);
      const v = numeric(p.facts[c.key]);
      if (v === null || !values.length) continue;
      const lo = Math.min(...values);
      const hi = Math.max(...values);
      const scaled = hi === lo ? 1 : (v - lo) / (hi - lo);
      total += (c.better === "lower" ? 1 - scaled : scaled) * weights[c.key];
      known += weights[c.key];
    }
    return { id: p.id, score: known > 0 ? (total / known) * 100 : null };
  });
  const order = [...scored].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return order.map((s, i) => ({
    id: s.id,
    score: s.score,
    place: i + 1,
    labels: i === 0 && s.score !== null ? [{ key: "overall", text: "Best overall" }] : [],
    out: "",
    flags: [],
  }));
}
