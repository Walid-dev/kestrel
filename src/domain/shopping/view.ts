// What Shopping's pages read: Shopping's home (the wants, the figures, the watched products and the latest pings), a
// want's view (its need, questions, finalists and also considered, each with its offers, best price and reach) and a
// product's; and the re-rank a budget, an answer or new prices start, which writes the ranking back on the products.
import type { DatabaseSync } from "node:sqlite";
import {
  DATA_METHODS,
  type LogLine,
  type OfferView,
  type ProductView,
  productKind,
  RANK_RULE,
  type ShoppingHome,
  type Verdict,
  type WantSummary,
  type WantView,
  type WatchedView,
} from "../../shared/shopping.ts";
import { rank } from "./rank.ts";
import {
  deletedOf,
  deletedProduct,
  getProduct,
  getWant,
  listWants,
  type OfferRow,
  offersOf,
  type ProductRow,
  productsOf,
  readingsOf,
  setRank,
  type WantRow,
} from "./store.ts";

// a product a run no longer found: kept with my marks and its history, out of the ranking
export const DROPPED = "no longer in any source";

// where the view gets what changes by region: the currency and each store's name
export type Place = { currency: string; storeName: (domain: string) => string };
export const NO_PLACE: Place = { currency: "CAD", storeName: (d) => d.replace(/^www\./, "") };

const totalOf = (o: OfferRow): number | null => (o.price === null ? null : o.price + (o.shipping ?? 0));
const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// sold by the store itself: no other seller named, or the seller is the store
const byStore = (o: OfferRow, name: string): boolean => {
  if (o.condition === "marketplace") return false;
  if (!o.seller) return true;
  const s = plain(o.seller);
  const n = plain(name);
  const root = plain(o.store.replace(/^www\./, "").split(".")[0] ?? "");
  return Boolean(s) && (s.includes(n) || n.includes(s) || (root.length > 2 && s.includes(root)));
};

// the best price: the lowest verified total (read from the page's data, never its words), new, sold by the store, in
// stock online. In stock means sold online, not on a shelf near me
export function bestOffer(offers: OfferRow[], place: Place = NO_PLACE): OfferRow | null {
  const fit = offers.filter(
    (o) =>
      o.read === "ok" &&
      DATA_METHODS.includes(o.method) &&
      o.price !== null &&
      o.condition === "new" &&
      o.stock === "in" &&
      byStore(o, place.storeName(o.store)),
  );
  fit.sort((a, b) => (totalOf(a) ?? 0) - (totalOf(b) ?? 0));
  return fit[0] ?? null;
}

// the order a product's offers read in: read prices first (from the page's data, new, by total; then the page's words;
// then other conditions), then the rows that say why they hold no price, the link stores last
const RANK_READ: Record<string, number> = { mismatch: 1, blocked: 2, unreadable: 3, unsearched: 4, link: 5 };
const orderOf = (o: OfferRow): number =>
  o.read === "ok" ? (o.method === "text" ? 0.5 : o.condition === "new" ? 0 : 0.7) : RANK_READ[o.read];

export function offerViews(offers: OfferRow[], place: Place = NO_PLACE): OfferView[] {
  const best = bestOffer(offers, place);
  return [...offers]
    .sort((a, b) => orderOf(a) - orderOf(b) || (totalOf(a) ?? Infinity) - (totalOf(b) ?? Infinity))
    .map((o) => ({
      id: o.id,
      product: o.product,
      store: o.store,
      storeName: place.storeName(o.store),
      url: o.url,
      seller: o.seller,
      condition: o.condition,
      price: o.price,
      regular: o.regular,
      shipping: o.shipping,
      total: totalOf(o),
      currency: o.currency || place.currency,
      stock: o.stock,
      pickup: o.pickup,
      validUntil: o.validUntil,
      method: o.method,
      read: o.read,
      words: o.words,
      why: o.why,
      seen: o.seen,
      best: best?.id === o.id,
    }));
}

// what the ranking reads as a product's price: the best verified total, else a usual price a source states
export function priceOf(p: ProductRow, offers: OfferRow[], place: Place = NO_PLACE) {
  const best = bestOffer(offers, place);
  if (best) return { price: totalOf(best), from: "offer" as const, best };
  if (p.usual !== null) return { price: p.usual, from: "usual" as const, best: null };
  return { price: null, from: null, best: null };
}

// the verdict on a product's best price; the deal judge fills it in (verdict.ts)
export type Judge = (p: ProductRow, offers: OfferRow[], best: OfferRow | null) => Verdict | null;
const NO_JUDGE: Judge = () => null;

export function productView(
  db: DatabaseSync,
  p: ProductRow,
  w: WantRow | null,
  place: Place = NO_PLACE,
  judge: Judge = NO_JUDGE,
  offers: OfferRow[] = offersOf(db, p.id),
): ProductView {
  const { price, from, best } = priceOf(p, offers, place);
  const views = offerViews(offers, place);
  const count = (f: (o: OfferRow) => boolean) => offers.filter(f).length;
  return {
    id: p.id,
    want: p.want,
    key: p.key,
    name: p.name,
    brand: p.brand,
    models: p.models,
    facts: p.facts,
    labels: p.labels,
    score: p.score,
    place: p.place,
    out: p.out,
    flags: p.flags,
    words: p.words,
    usual: p.usual,
    evidence: p.evidence,
    starred: p.starred,
    status: p.status,
    target: p.target,
    watch: p.watch,
    found: p.found,
    updated: p.updated,
    price,
    priceFrom: from,
    best: views.find((o) => o.best) ?? null,
    verdict: best ? judge(p, offers, best) : null,
    offers: views,
    reach: {
      read: count((o) => o.read === "ok"),
      links: count((o) => o.read === "link" || o.read === "unsearched"),
      blocked: count((o) => o.read === "blocked"),
      text: count((o) => o.read === "ok" && o.method === "text"),
    },
    budget: w?.budget == null ? null : price === null ? "unknown" : price <= w.budget * 100 ? "yes" : "no",
  };
}

// the want's products re-ranked from their facts, my answers and the prices read: written back on each product
export function rerank(db: DatabaseSync, wantId: string, place: Place = NO_PLACE): void {
  const w = getWant(db, wantId);
  if (!w?.need) return;
  const products = productsOf(db, wantId).filter((p) => p.out !== DROPPED);
  const ranked = rank(
    w.need,
    w.answers,
    products.map((p) => ({
      id: p.id,
      facts: p.facts,
      evidence: p.evidence,
      price: priceOf(p, offersOf(db, p.id), place).price,
    })),
  );
  for (const r of ranked) setRank(db, r.id, r);
}

function summaryOf(w: WantRow, views: ProductView[], place: Place): WantSummary {
  const finalists = views.filter((p) => p.place !== null && !p.out);
  const lead = finalists.find((p) => p.starred) ?? finalists.find((p) => p.labels.some((l) => l.key === "overall"));
  const stores = (f: (o: OfferView) => boolean) =>
    new Set(views.flatMap((p) => p.offers.filter(f).map((o) => o.store))).size;
  return {
    id: w.id,
    words: w.words,
    state: w.state,
    step: w.step,
    status: w.status,
    starred: w.starred,
    category: w.need?.category ?? "",
    categoryName: w.need?.name ?? "",
    created: w.created,
    updated: w.updated,
    ran: w.ran,
    error: w.error,
    budgetSet: w.budget !== null,
    currency: place.currency,
    best: lead
      ? {
          product: lead.id,
          name: lead.name,
          price: lead.best?.total ?? null,
          store: lead.best?.storeName ?? "",
          verdict: lead.verdict?.word ?? null,
        }
      : null,
    picks: finalists.flatMap((p) => p.labels.map((l) => ({ label: l.text, name: p.name }))),
    compared: finalists.length,
    storesRead: stores((o) => o.read === "ok"),
    blocked: stores((o) => o.read === "blocked"),
    links: stores((o) => o.read === "link" || o.read === "unsearched"),
  };
}

export type ViewOpts = { place?: Place; judge?: Judge; read?: boolean };

export function wantView(db: DatabaseSync, id: string, opts: ViewOpts = {}): WantView | null {
  const w = getWant(db, id);
  if (!w) return null;
  const place = opts.place ?? NO_PLACE;
  const views = productsOf(db, id).map((p) => productView(db, p, w, place, opts.judge));
  return {
    ...summaryOf(w, views, place),
    budget: w.budget,
    note: w.note,
    need: w.need,
    kind: productKind(w.need, place.currency),
    questions: (w.need?.questions ?? []).map((q) => ({ ...q, picked: w.answers[q.key] ?? null })),
    products: views.filter((p) => p.place !== null && !p.out).sort((a, b) => (a.place ?? 0) - (b.place ?? 0)),
    also: views.filter((p) => p.place === null || p.out),
    deleted: deletedOf(db, id),
    sources: w.result?.sources ?? [],
    log: [...w.log].reverse(),
    result: w.result
      ? {
          assumptions: w.result.assumptions,
          changeIf: w.result.changeIf,
          conflicts: w.result.conflicts,
          before: w.result.before,
          checked: w.result.checked,
          notes: w.result.notes,
          searches: w.result.searches,
          pages: w.result.pages,
        }
      : null,
    rule: RANK_RULE,
    read: opts.read ?? false,
  };
}

export function productViewOf(db: DatabaseSync, id: string, opts: ViewOpts = {}): ProductView | null {
  const p = getProduct(db, id);
  return p ? productView(db, p, getWant(db, p.want), opts.place, opts.judge) : null;
}

// a deleted product as it was, for its sheet: it says so first and offers Restore
export function deletedProductView(
  db: DatabaseSync,
  id: string,
  opts: ViewOpts = {},
): (ProductView & { deleted: { at: string } }) | null {
  const gone = deletedProduct(db, id);
  if (!gone) return null;
  const view = productView(db, gone.row, getWant(db, gone.want), opts.place, opts.judge, gone.offers);
  return { ...view, deleted: { at: gone.at } };
}

// the lowest best total a product had at a moment, from its readings (each offer's last reading by then)
function bestAt(db: DatabaseSync, product: string, at: number): number | null {
  const last = new Map<string, { price: number; stock: string; method: string }>();
  for (const r of readingsOf(db, product)) {
    if (Date.parse(r.at) > at) break;
    last.set(r.offer, r);
  }
  const ok = [...last.values()].filter((r) => r.stock === "in" && DATA_METHODS.includes(r.method as never));
  return ok.length ? Math.min(...ok.map((r) => r.price)) : null;
}

export function shoppingHome(db: DatabaseSync, opts: ViewOpts = {}, now = new Date()): ShoppingHome {
  const place = opts.place ?? NO_PLACE;
  const wants = listWants(db);
  const summaries: WantSummary[] = [];
  const watching: WatchedView[] = [];
  let drops = 0;
  let atTarget = 0;
  for (const w of wants) {
    const views = productsOf(db, w.id).map((p) => productView(db, p, w, place, opts.judge));
    summaries.push(summaryOf(w, views, place));
    for (const p of views) {
      const total = p.best?.total ?? null;
      if (p.watch && Date.parse(p.watch.until) > now.getTime())
        watching.push({
          product: p.id,
          want: w.id,
          name: p.name,
          price: total,
          target: p.target,
          until: p.watch.until,
          verdict: p.verdict?.word ?? null,
        });
      if (p.target !== null && total !== null && total <= p.target) atTarget++;
      const before = bestAt(db, p.id, now.getTime() - 7 * 86_400_000);
      if (total !== null && before !== null && total < before) drops++;
    }
  }
  const pings = wants
    .flatMap((w) =>
      w.log.filter((l) => l.kind === "ping").map((l): LogLine & { want: string } => ({ ...l, want: w.id })),
    )
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 10);
  const lastRead = (
    db.prepare("SELECT MAX(seen) AS at FROM offers WHERE read = 'ok'").get() as { at: string | null } | undefined
  )?.at;
  return {
    wants: summaries,
    figures: { wants: wants.filter((w) => w.status === "open").length, watching: watching.length, drops, atTarget },
    watching,
    pings,
    lastRead: lastRead ?? null,
    currency: place.currency,
    rule: RANK_RULE,
  };
}
