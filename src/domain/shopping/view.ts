// What Shopping's pages read: Shopping's home (the wants, the figures, the watched products and the latest pings), a
// want's view (its need, questions, finalists and also considered, each with its offers, best price and reach) and a
// product's; and the re-rank a budget, an answer or new prices start, which writes the ranking back on the products.
import type { DatabaseSync } from "node:sqlite";
import { formatMoney } from "../../shared/kinds.ts";
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
import { sourcesWhy } from "./compose.ts";
import { deciding, rank, weightsFor } from "./rank.ts";
import { placeOf, type Region } from "./region.ts";
import { budgetIn } from "./scrub.ts";
import {
  addLog,
  deletedOf,
  deletedProduct,
  deletedWants,
  getProduct,
  getWant,
  listWants,
  type OfferRow,
  offersOf,
  type ProductRow,
  productsOf,
  readingsOf,
  setRank,
  setWords,
  type WantRow,
} from "./store.ts";
import { historyLinks, storesFor, verdict } from "./verdict.ts";

// a product a run no longer found: kept with my marks and its history, out of the ranking
export const DROPPED = "no longer in any source";

// where the view gets what changes by region: the currency and each store's name
export type Place = { currency: string; storeName: (domain: string) => string };
export const NO_PLACE: Place = { currency: "CAD", storeName: (d) => d.replace(/^www\./, "") };

// the budget that counts: the one I set, else one my words state ("under $500"); whole units. The ranking, the page and
// Ask all read this one, so the screen never says "none" while the list is gated
export const budgetOf = (w: Pick<WantRow, "budget" | "words">): number | null => w.budget ?? budgetIn(w.words);

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

// a price on a row kestrel didn't read is a search result's (offers.ts keeps it so, never as a reading)
export const fromSearch = (o: OfferRow): boolean => o.read !== "ok" && o.price !== null;

// what the ranking reads as a product's price, in the region's currency: the best verified total in stock; else the
// lowest new price read from a store page's data that isn't shown in stock (still the price level, for best value);
// else a list price a testing source states; else the lowest price a search result shows for a listed store's page.
// Where to buy now (the best offer) stays the in-stock one alone
export function priceOf(p: ProductRow, offers: OfferRow[], place: Place = NO_PLACE) {
  const best = bestOffer(offers, place);
  if (best) return { price: totalOf(best), from: "offer" as const, best, offer: best };
  const low = (list: OfferRow[]) => [...list].sort((a, b) => (totalOf(a) ?? 0) - (totalOf(b) ?? 0))[0];
  const level = low(
    offers.filter(
      (o) => o.read === "ok" && DATA_METHODS.includes(o.method) && o.price !== null && o.condition === "new",
    ),
  );
  if (level) return { price: totalOf(level), from: "stock" as const, best: null, offer: level };
  if (p.usual !== null) return { price: p.usual, from: "usual" as const, best: null, offer: null };
  const search = low(offers.filter(fromSearch));
  if (search) return { price: search.price, from: "snippet" as const, best: null, offer: search };
  return { price: null, from: null, best: null, offer: null };
}

// the price the ranking and my budget read: priceOf's, except a search result's. Its words are a guess ("Save $100",
// an accessory's price), so it is shown on its card and never drops a product for the budget or names Best value
export const rankingPrice = (got: ReturnType<typeof priceOf>): number | null =>
  got.from === "snippet" ? null : got.price;

// a list price in another currency (a US review's): shown, and used for best value among products priced the same way,
// never against my budget
export const otherPrice = (p: ProductRow, currency: string): { price: number; currency: string } | null =>
  p.evidence.list && p.evidence.list.currency !== currency
    ? { price: p.evidence.list.price, currency: p.evidence.list.currency }
    : null;

// where a price that isn't the best offer comes from, in words from code
function priceNote(
  p: ProductRow,
  got: ReturnType<typeof priceOf>,
  place: Place,
  sourceHost: (ref: string) => string,
): string {
  // another currency's dollars say whose: US$1,895 never reads as a Canadian price
  const money = (cents: number, currency = place.currency) =>
    `${currency !== place.currency && currency === "USD" ? "US" : ""}${formatMoney(cents, currency)}`;
  const store = got.offer ? place.storeName(got.offer.store) : "";
  const list = p.evidence.list;
  const from = list ? sourceHost(list.ref) : "";
  const review = from ? ` in ${from}'s review` : "";
  if (got.price === null)
    return list
      ? `${money(list.price, list.currency)} list price${review} (${list.currency}, not checked against my budget)`
      : "";
  if (got.from === "stock")
    return `${money(got.price)} at ${store}, ${
      got.offer?.stock === "out"
        ? "out of stock"
        : got.offer?.stock === "in"
          ? "from another seller"
          : "not shown in stock"
    }`;
  if (got.from === "usual") return `${money(got.price)} list price${review}`;
  if (got.from === "snippet") return `${money(got.price)} in a search result for ${store}, not read on its page`;
  return "";
}

// the verdict on a product's best price; the deal judge fills it in (verdict.ts)
export type Judge = (p: ProductRow, offers: OfferRow[], best: OfferRow | null) => Verdict | null;
const NO_JUDGE: Judge = () => null;

// the deal judge on this database and region: each product's readings, its want's kind of stores, my target
export function judgeOf(db: DatabaseSync, region: Region, now = new Date()): Judge {
  const place = placeOf(region);
  const groups = new Map<string, string[]>();
  return (p, _offers, best) => {
    if (!best || best.price === null) return null;
    if (!groups.has(p.want)) groups.set(p.want, getWant(db, p.want)?.need?.storeGroups ?? []);
    const g = groups.get(p.want) ?? [];
    return verdict({
      readings: readingsOf(db, p.id),
      best: { offer: best.id, store: best.store, price: best.price, regular: best.regular },
      target: p.target,
      stores: storesFor(region, g),
      links: historyLinks(region, g, p.name),
      storeName: place.storeName,
      currency: region.currency,
      now,
    });
  };
}

export function productView(
  db: DatabaseSync,
  p: ProductRow,
  w: WantRow | null,
  place: Place = NO_PLACE,
  judge: Judge = NO_JUDGE,
  offers: OfferRow[] = offersOf(db, p.id),
): ProductView {
  const got = priceOf(p, offers, place);
  const { price, from, best } = got;
  const host = (ref: string) => w?.result?.sources.find((x) => x.ref === ref)?.host ?? "";
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
    priceNote: priceNote(p, got, place, host),
    best: views.find((o) => o.best) ?? null,
    verdict: best ? judge(p, offers, best) : null,
    offers: views,
    reach: {
      read: count((o) => o.read === "ok"),
      links: count((o) => o.read === "link" || o.read === "unsearched"),
      blocked: count((o) => o.read === "blocked"),
      text: count((o) => o.read === "ok" && o.method === "text"),
    },
    budget: budgetLine(w, rankingPrice(got)),
  };
}

function budgetLine(w: WantRow | null, price: number | null): ProductView["budget"] {
  const budget = w ? budgetOf(w) : null;
  return budget === null ? null : price === null ? "unknown" : price <= budget * 100 ? "yes" : "no";
}

// the want's products re-ranked from their facts, my answers and the prices read: written back on each product. A
// product the re-rank brings onto the list (a finalist over the budget once its price was read, a new score) had no
// reasons written: it takes its sources' own words, logged, so a product on the list always says why
export function rerank(db: DatabaseSync, wantId: string, place: Place = NO_PLACE, now = new Date()): void {
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
      price: rankingPrice(priceOf(p, offersOf(db, p.id), place)),
      other: otherPrice(p, place.currency),
    })),
    budgetOf(w),
  );
  // a want that names one product keeps it first, whatever its score: its offers are what I asked for
  const named = w.need.mode === "one" ? namedProduct(products, w.need.product) : undefined;
  for (const r of ranked) setRank(db, r.id, r.id === named?.id ? { ...r, place: 0, out: "" } : r);
  const weights = weightsFor(w.need, w.answers);
  const filled: string[] = [];
  for (const p of products) {
    const r = ranked.find((x) => x.id === p.id);
    if (!r || r.place === null || r.out || p.words.why.length || p.id === named?.id) continue;
    const why = sourcesWhy(p, w.need, weights);
    if (!why.length) continue;
    setWords(db, p.id, { ...p.words, why });
    filled.push(p.name);
  }
  if (filled.length)
    addLog(
      db,
      wantId,
      {
        kind: "run",
        text: `Reasons: ${filled.length} ${filled.length === 1 ? "product" : "products"} came onto the list after the prices and ${filled.length === 1 ? "shows its" : "show their"} sources' own words (${filled.join(", ")})`,
      },
      now,
    );
}

// the product a one-mode want names, by its name
export function namedProduct<T extends { name: string }>(products: T[], name: string): T | undefined {
  const want = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return want
    ? (products.find((p) => p.name.toLowerCase().replace(/[^a-z0-9]/g, "") === want) ??
        products.find((p) =>
          p.name
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "")
            .includes(want),
        ))
    : undefined;
}

function summaryOf(w: WantRow, views: ProductView[], place: Place): WantSummary {
  const finalists = views.filter((p) => p.place !== null && !p.out);
  // the lead: my star, else the best overall; in one mode the product I named (its offers are what I asked for)
  const lead =
    finalists.find((p) => p.starred) ??
    (w.need?.mode === "one" ? finalists.find((p) => p.place === 0) : undefined) ??
    finalists.find((p) => p.labels.some((l) => l.key === "overall"));
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
    budgetSet: budgetOf(w) !== null,
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
  const changes = decidingOf(w, views, place.currency);
  return {
    ...summaryOf(w, views, place),
    budget: w.budget,
    budgetWords: w.budget === null ? budgetIn(w.words) : null,
    note: w.note,
    need: w.need,
    kind: productKind(w.need, place.currency),
    questions: (w.need?.questions ?? []).map((q) => ({
      ...q,
      picked: w.answers[q.key] ?? null,
      changes: changes === null || changes.has(q.key),
    })),
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
    pricing: pricingLine(
      views.filter((p) => p.place !== null && !p.out),
      place.currency,
    ),
  };
}

// best value and budget need prices: said plainly when too few finalists have one the ranking reads (a store page's,
// a review's list price in the region's currency), and when Best value compares another currency's list prices
function pricingLine(finalists: ProductView[], currency: string): string {
  if (finalists.length < 2) return "";
  const n = finalists.length;
  const priced = finalists.filter((p) => p.price !== null && p.priceFrom !== "snippet").length;
  if (priced >= 2) return "";
  const other = finalists.filter(
    (p) => (p.price === null || p.priceFrom === "snippet") && p.evidence.list && p.evidence.list.currency !== currency,
  );
  const cur = other[0]?.evidence.list?.currency ?? "";
  const snippets = finalists.some((p) => p.priceFrom === "snippet")
    ? " A price only a search result shows is on its card, never ranked."
    : "";
  const whose = cur === "USD" ? "US" : cur;
  if (finalists.some((p) => p.labels.some((l) => l.key === "value" && l.text !== "Best value")))
    return `Best value compares the reviews' ${whose} list prices: no ${currency} price is known for these products yet. Budget waits for ${currency} prices, since my budget is in ${currency}.${snippets}`;
  if (priced === 0 && other.length >= 2)
    return `Only the reviews' ${whose} list prices are known here. Budget needs ${currency} prices, since my budget is in ${currency}; Best value needs two products near the top priced alike.${snippets}`;
  return priced === 0
    ? `Best value and Budget need prices, and none kestrel could read is known for these products yet: no store page it could read and no review gave one in ${currency}.${snippets}`
    : `Best value and Budget need prices, and only ${priced} of these ${n} products has one so far.${snippets}`;
}

// the questions whose answer moves the top pick, on the products as ranked now (the named one left out in one mode: it
// leads whatever the answers); null before there is a list to move
function decidingOf(w: WantRow, views: ProductView[], currency: string): Set<string> | null {
  if (!w.need?.questions.length) return new Set();
  const named = w.need.mode === "one" ? namedProduct(views, w.need.product) : undefined;
  const ranked = views.filter((p) => p.out !== DROPPED && p !== named);
  if (!ranked.some((p) => p.score !== null)) return null;
  return deciding(
    w.need,
    w.answers,
    ranked.map((p) => ({
      id: p.id,
      facts: p.facts,
      evidence: p.evidence,
      price: p.priceFrom === "snippet" ? null : p.price,
      other: p.evidence.list && p.evidence.list.currency !== currency ? p.evidence.list : null,
    })),
    budgetOf(w),
  );
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
    deleted: deletedWants(db),
    lastRead: lastRead ?? null,
    currency: place.currency,
    rule: RANK_RULE,
  };
}
