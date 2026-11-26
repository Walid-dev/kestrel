// Watch a price: when I ask, kestrel re-reads a product's offers on a schedule (every 4, 12 or 24 hours) until the
// watch's date, and pings my phone when the best verified total reaches my target (once per crossing: again only after
// it went above and came back, or fell 1% more), drops to its lowest since the watch began (by 1% and a dollar at least;
// "new low" stays the verdict's word, so the ping and the sheet never disagree), or comes back in stock. One ping per
// want per check, its title naming the best price. Only the offers that read well from a page's data are re-read, and a
// blocked store after it rested a day; a price read from a page's words and a link store never (no model in a check). A
// page that no longer matches becomes a mismatch. A watch ends on its date with one line in the want's log, no ping.
import type { DatabaseSync } from "node:sqlite";
import type { StoreRead, Wanted } from "../../ai/shopping/product-data.ts";
import { record } from "../../platform/activity.ts";
import type { Alert } from "../../platform/alert.ts";
import { formatMoney } from "../../shared/kinds.ts";
import { DATA_METHODS, VERDICT_WORDS, type Watch } from "../../shared/shopping.ts";
import { wantedOf } from "./offers.ts";
import { placeOf, type Region, type Store } from "./region.ts";
import { addLog, getProduct, offersOf, type ProductRow, saveOffer, setWatch } from "./store.ts";
import { bestOffer, judgeOf } from "./view.ts";

const HOUR = 3_600_000;

export type WatchDeps = {
  region: Region;
  // a store page read without the model: the page's own data only
  readPage: (url: string, wanted: Wanted, store: Store) => Promise<StoreRead>;
  ping: (a: Alert) => Promise<{ sent: boolean; why: string }>;
  page: string; // kestrel's address on my phone, which a ping's tap opens ("" when unset)
  now: () => Date;
};

// the watched products: those due a check, and those whose watch has ended
export function watched(db: DatabaseSync): ProductRow[] {
  return (db.prepare("SELECT id FROM products WHERE watch IS NOT NULL").all() as { id: string }[])
    .map((r) => getProduct(db, r.id))
    .filter((p): p is ProductRow => p !== null && p.watch !== null);
}
export const isDue = (w: Watch, now: Date): boolean =>
  w.last === null || now.getTime() - Date.parse(w.last) >= w.everyHours * HOUR;

// a store's entry for an offer's domain; a store the region no longer lists is read as itself
const storeOf = (region: Region, domain: string): Store =>
  region.stores.find((s) => domain === s.domain || domain.endsWith(`.${s.domain}`)) ?? {
    domain,
    name: domain,
    groups: [],
    read: "page",
    searchUrl: `https://${domain}/search?q={q}`,
  };

type Reason = "target" | "drop" | "stock";
const WORDS: Record<Reason, string> = {
  target: "at my target",
  drop: "price drop: the lowest since the watch began",
  stock: "back in stock",
};

// one product's check: its offers re-read, then whether a ping is due, and the watch's memory updated
async function checkOne(db: DatabaseSync, p: ProductRow, w: Watch, deps: WatchDeps): Promise<Reason[]> {
  const now = deps.now();
  const wanted = wantedOf(p);
  for (const o of offersOf(db, p.id)) {
    const fromData = o.read === "ok" && DATA_METHODS.includes(o.method);
    const rested = o.read === "blocked" && now.getTime() - Date.parse(o.seen) >= 24 * HOUR;
    if (!fromData && !rested) continue;
    const r = await deps.readPage(o.url, wanted, storeOf(deps.region, o.store));
    saveOffer(
      db,
      p.id,
      {
        store: o.store,
        url: o.url,
        seller: r.seller,
        condition: r.condition,
        price: r.price,
        regular: r.regular,
        shipping: r.shipping,
        currency: r.currency,
        stock: r.stock,
        pickup: r.pickup,
        validUntil: r.validUntil,
        method: r.method,
        read: r.read,
        words: r.words,
        why: r.why,
      },
      now,
    );
  }
  const best = bestOffer(offersOf(db, p.id), placeOf(deps.region));
  const total = best?.price != null ? best.price + (best.shipping ?? 0) : null;
  const reasons: Reason[] = [];
  const next: Watch = { ...w, last: now.toISOString() };
  if (total !== null) {
    if (p.target !== null && total <= p.target) {
      if (w.pinged === null || total * 100 <= w.pinged * 99) reasons.push("target");
      next.pinged = reasons.includes("target") ? total : w.pinged;
    } else next.pinged = null; // above the target again: the next crossing pings
    if (w.low === null) next.low = total;
    else if (total * 100 <= w.low * 99 && w.low - total >= 100) {
      if (!reasons.includes("target")) reasons.push("drop");
      next.low = total;
    } else next.low = Math.min(w.low, total);
  }
  if (w.stock && w.wasOut && best) reasons.push("stock");
  next.wasOut = !best;
  setWatch(db, p.id, next, now);
  return reasons;
}

// every due check, then one ping per want naming its best; a watch past its date ends with a line in the log
export async function checkWatches(
  db: DatabaseSync,
  deps: WatchDeps,
): Promise<{ checked: number; pings: number; ended: number }> {
  const now = deps.now();
  const out = { checked: 0, pings: 0, ended: 0 };
  const due = new Map<string, { p: ProductRow; reasons: Reason[] }[]>();
  for (const p of watched(db)) {
    const w = p.watch as Watch;
    if (Date.parse(w.until) <= now.getTime()) {
      setWatch(db, p.id, null, now);
      addLog(db, p.want, { kind: "watch", text: `The watch on ${p.name} ended`, product: p.id }, now);
      out.ended++;
      continue;
    }
    if (!isDue(w, now)) continue;
    const reasons = await checkOne(db, p, w, deps);
    out.checked++;
    if (reasons.length) due.set(p.want, [...(due.get(p.want) ?? []), { p, reasons }]);
  }
  const judge = judgeOf(db, deps.region, now);
  for (const [want, list] of due) {
    // the ping names the best of the want's products that pinged: the cheapest verified total
    const priced = list.map((x) => {
      const offers = offersOf(db, x.p.id);
      const best = bestOffer(offers, placeOf(deps.region));
      return { ...x, offers, best, total: best?.price != null ? best.price + (best.shipping ?? 0) : null };
    });
    const lead = [...priced].sort((a, b) => (a.total ?? Infinity) - (b.total ?? Infinity))[0];
    if (!lead?.best || lead.total === null) continue;
    const store = placeOf(deps.region).storeName(lead.best.store);
    const money = (c: number) => formatMoney(c, deps.region.currency);
    const verdict = judge(lead.p, lead.offers, lead.best);
    const a: Alert = {
      channel: "shopping",
      title: `${lead.p.name} ${money(lead.total)} at ${store}`,
      message: [
        lead.reasons.map((r) => WORDS[r]).join(" · "),
        ...(lead.p.target !== null ? [`My target: ${money(lead.p.target)}`] : []),
        ...(verdict ? [`${VERDICT_WORDS[verdict.word]}: ${verdict.line}`] : []),
        ...(lead.best.regular ? [`Regular price: ${money(lead.best.regular)}`] : []),
        ...priced
          .filter((x) => x !== lead)
          .map(
            (x) =>
              `Also: ${x.p.name} ${x.total === null ? "" : money(x.total)} (${x.reasons.map((r) => WORDS[r]).join(", ")})`,
          ),
      ].join("\n"),
      ...(deps.page ? { click: `${deps.page.replace(/\/$/, "")}/shopping/${want}?product=${lead.p.id}` } : {}),
      tags: ["shopping_cart"],
    };
    const sent = await deps.ping(a);
    addLog(
      db,
      want,
      { kind: "ping", text: sent.sent ? a.title : `${a.title} (not sent: ${sent.why})`, product: lead.p.id },
      now,
    );
    record("shopping", sent.sent ? `Pinged: ${a.title}` : `Not pinged (${sent.why}): ${a.title}`, `/shopping/${want}`);
    if (sent.sent) out.pings++;
  }
  return out;
}
