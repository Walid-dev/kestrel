// The deals worth a ping (the old Deal Hunt's alert, now kestrel's): what a run just found, kept in view by the rules,
// at or under 65% of the usual asking price for its model (the card's "great" tier). One ping per run: its title names
// the best, then a few lines each, and a tap opens kestrel on it.
import type { DatabaseSync } from "node:sqlite";
import type { Alert } from "../../platform/alert.ts";
import { LEFT, usualPrices } from "./listings.ts";
import type { Run } from "./runs.ts";
import type { Spec } from "./specs.ts";

export type GreatDeal = {
  id: string;
  title: string;
  price: number;
  usual: number;
  pct: number;
  place: string;
  source: string;
  model: string;
};

const GREAT = 65; // percent of the usual asking price, as the card's tiers count it

export function greatDeals(db: DatabaseSync, spec: Pick<Spec, "id" | "hunt">, run: Pick<Run, "started">): GreatDeal[] {
  const usual = usualPrices(db, spec.hunt || undefined);
  const rows = db
    .prepare(`SELECT id, search, data FROM listings WHERE search = ? AND kind = 'deals' AND found = ? AND NOT ${LEFT}`)
    .all(spec.id, run.started) as { id: string; search: string; data: string }[];
  const out: GreatDeal[] = [];
  for (const r of rows) {
    const d = JSON.parse(r.data) as Record<string, unknown>;
    const price = typeof d.price === "number" ? d.price : null;
    const model = (typeof d.category === "string" && d.category) || r.search;
    const u = usual.get(model);
    if (price === null || price <= 0 || !u) continue;
    const pct = Math.round((price / u.median) * 100);
    if (pct > GREAT) continue;
    out.push({
      id: r.id,
      title: String(d.title ?? ""),
      price,
      usual: Math.round(u.median),
      pct,
      place: String(d.location ?? ""),
      source: String(d.source ?? ""),
      model,
    });
  }
  return out.sort((a, b) => a.pct - b.pct);
}

// the ping's words: the best one in the title, three at most below, a tap on kestrel's Searches with it open
export function dealAlert(deals: GreatDeal[], hunt: string, page: string): Alert {
  const best = deals[0];
  return {
    channel: "deals",
    title: `Great deal: ${best.model} $${best.price}`,
    message: deals
      .slice(0, 3)
      .map(
        (d) =>
          `${d.model} · $${d.price}, ${d.pct}% of the usual $${d.usual}${d.place ? ` · ${d.place}` : ""}${d.source ? ` · ${d.source}` : ""}\n${d.title}`,
      )
      .join("\n\n"),
    click: page
      ? `${page}/searches?hunt=${encodeURIComponent(`deals:${hunt}`)}&open=${encodeURIComponent(best.id)}`
      : undefined,
    tags: ["moneybag"],
  };
}
