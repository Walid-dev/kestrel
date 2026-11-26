// Judge the deal (pure): one word and one line for a product's best price, from kestrel's own readings across the
// region's stores (data readings only, never a price read from a page's words), the offer's regular price, my target
// and the region's policies. The first word that applies wins:
// 1. not enough history: under 30 days of readings; the line states the facts, never a judgement;
// 2. inflated discount, only on firm ground: this offer read on 150 of the last 180 days or more with its "was" price
//    on under half of them, or another store's verified new price under that "was" price on every reading for 30 days
//    or more. With less, the line states the fact and the word is never used;
// 3. new low: under every earlier reading of the product, in every store, by 1% at least;
// 4. good: at or under the 90-day low when the price moves (a flat price is typical), or 10% or more under the median;
// 5. high: 10% or more over the 90-day median; 6. typical: within 10% of it.
// The rule is kestrel's own, shaped after the Competition Bureau's regular-price tests; it is not the law, and the line
// never says a store broke it. Readings are not sales. Every word comes from these templates, never from a model.
import { formatMoney } from "../../shared/kinds.ts";
import { DATA_METHODS, type Verdict, type VerdictWord } from "../../shared/shopping.ts";
import type { Region, Store } from "./region.ts";
import type { Reading } from "./store.ts";

const DAY = 86_400_000;

export type VerdictInput = {
  readings: Reading[]; // the product's, every store, any method (text ones are left out here)
  best: { offer: string; store: string; price: number; regular: number | null };
  target: number | null;
  stores: Store[]; // the region's stores that sell this kind
  links: { label: string; url: string }[]; // outside price histories, already filled in
  storeName: (domain: string) => string;
  currency: string;
  now: Date;
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : 0;
};
const pct = (part: number, whole: number) => Math.round((Math.abs(part) / whole) * 100);
const dayOf = (iso: string) => iso.slice(0, 10);

export function verdict(v: VerdictInput): Verdict {
  const money = (c: number) => formatMoney(c, v.currency);
  const data = v.readings.filter((r) => DATA_METHODS.includes(r.method)).sort((a, b) => a.at.localeCompare(b.at));
  const now = v.now.getTime();
  const cur = v.best.price;
  // the current reading is the best offer's last; every other reading is "before" it
  const lastBest = [...data].reverse().find((r) => r.offer === v.best.offer);
  const before = data.filter((r) => r !== lastBest);
  const first = data[0] ? Date.parse(data[0].at) : now;
  const span = (now - first) / DAY;
  const days = Math.max(1, Math.round(span));
  const lowest = Math.min(cur, ...data.map((r) => r.price));
  const mine = data.filter((r) => r.offer === v.best.offer);
  const was = v.best.regular && v.best.regular > cur ? v.best.regular : null;
  const wasSeen = was !== null && mine.some((r) => r.price >= was);
  const atTarget = v.target !== null && cur <= v.target ? ` At my target of ${money(v.target)}.` : "";
  const policies = policyLine(v.stores);
  const done = (word: VerdictWord, line: string): Verdict => ({
    word,
    line: `${line}${atTarget}`,
    policies,
    links: v.links,
  });

  // 1. not enough history: the facts only
  if (span < 30) {
    const parts = [
      cur <= lowest
        ? `Lowest in the ${days} ${days === 1 ? "day" : "days"} read`
        : `Above the ${money(lowest)} read in the last ${days} days`,
    ];
    if (was) parts[0] += `, ${pct(was - cur, was)}% under its regular price`;
    if (was && !wasSeen)
      parts.push(`The "was" price hasn't been seen in the ${days} ${days === 1 ? "day" : "days"} read`);
    return done("history", `${parts.join(". ")}.`);
  }
  // 2. an inflated discount, on firm ground only
  const lowestNote = cur <= lowest ? "; still the lowest kestrel has read" : "";
  if (was) {
    const last180 = mine.filter((r) => Date.parse(r.at) >= now - 180 * DAY);
    const daysRead = new Set(last180.map((r) => dayOf(r.at)));
    const daysAtWas = new Set(last180.filter((r) => r.price >= was).map((r) => dayOf(r.at)));
    if (daysRead.size >= 150 && daysAtWas.size < daysRead.size / 2)
      return done(
        "inflated",
        `The "was" price of ${money(was)} showed on ${daysAtWas.size} of the ${daysRead.size} days kestrel read it${lowestNote}.`,
      );
    const others = new Map<string, Reading[]>();
    for (const r of data)
      if (r.store !== v.best.store && r.condition === "new") others.set(r.store, [...(others.get(r.store) ?? []), r]);
    for (const [store, rs] of others) {
      const reach = (Date.parse(rs[rs.length - 1].at) - Date.parse(rs[0].at)) / DAY;
      if (reach >= 30 && rs.every((r) => r.price < was))
        return done(
          "inflated",
          `${v.storeName(store)} sold it under the "was" price of ${money(was)} on every reading for ${Math.round(reach)} days${lowestNote}.`,
        );
    }
  }
  const wasFact = was && !wasSeen ? ` The "was" price hasn't been seen in the ${days} days kestrel has read.` : "";
  // 3. a new low
  if (before.length && cur * 100 <= 99 * Math.min(...before.map((r) => r.price))) {
    const stores = new Set(data.map((r) => r.store)).size;
    return done(
      "new-low",
      `${pct(Math.min(...before.map((r) => r.price)) - cur, Math.min(...before.map((r) => r.price)))}% under any price read in ${days} days, across ${stores} ${stores === 1 ? "store" : "stores"}.${wasFact}`,
    );
  }
  // 4 to 6: against the last 90 days, the boundaries in whole numbers (1.1 × 56000 is a hair over 61600 in floating
  // point)
  const window = before.filter((r) => Date.parse(r.at) >= now - 90 * DAY).map((r) => r.price);
  if (!window.length) return done("typical", `The only price read in the last 90 days.${wasFact}`);
  const med = median(window);
  const low = Math.min(...window);
  if ((cur <= low && low < med) || cur * 10 <= med * 9)
    return done(
      "good",
      cur <= low && low < med
        ? `At or under the lowest of the last 90 days (${money(low)}).${wasFact}`
        : `${pct(med - cur, med)}% under the 90-day median of ${money(Math.round(med))}.${wasFact}`,
    );
  if (cur * 10 >= med * 11)
    return done("high", `${pct(cur - med, med)}% over the 90-day median of ${money(Math.round(med))}.${wasFact}`);
  return done("typical", `Within 10% of the 90-day median of ${money(Math.round(med))}.${wasFact}`);
}

// who matches the price and who refunds a later drop, from the region's checked policies
export function policyLine(stores: Store[]): string {
  const match = stores
    .filter((s) => s.matches)
    .map((s) => `${s.name}${s.matches?.beats ? ` (beats by ${s.matches.beats}%)` : ""}`);
  const protect = stores.filter((s) => s.protects).map((s) => `${s.name} ${s.protects?.days} days`);
  return [
    match.length ? `Price match: ${match.join(", ")}` : "",
    protect.length ? `Refunds a later drop: ${protect.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

// the region's stores for a kind of product: those in its groups
export const storesFor = (region: Pick<Region, "stores">, groups: string[]): Store[] =>
  region.stores.filter((s) => !groups.length || s.groups.some((g) => groups.includes(g)));

// the outside price histories for a product, by its words
export const historyLinks = (region: Pick<Region, "linkTools">, groups: string[], words: string) =>
  region.linkTools
    .filter((t) => !t.groups.length || t.groups.some((g) => groups.includes(g)))
    .map((t) => ({ label: t.name, url: t.url.replace("{q}", encodeURIComponent(words)) }));
