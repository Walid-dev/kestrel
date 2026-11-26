// Find the offers: for each product picked, where to buy it now in my region. The region's stores that sell this kind
// (eight at most, the readable ones first) and the brand's own store when the region file lists it. A store kestrel
// only links to gets its search link at once, with no search and no fetch. A readable store gets one search,
// "<model>" site:<store>, then one "<brand> <model>" for the stores still without a page, each scrubbed and inside the
// run's searches; a hit counts only when its title or address holds one of the product's codes, and a snippet's price is
// never used. The page is read by the store-page reader (ai/shopping/product-data.ts). A store left when the searches
// run out is unsearched, with its search link. A store an open search turns up but the region file doesn't list is never
// read. Every offer is kept by its address, every reading with it.
import type { DatabaseSync } from "node:sqlite";
import type { StoreRead, Wanted } from "../../ai/shopping/product-data.ts";
import type { Hit } from "../../ai/web.ts";
import type { Need } from "../../shared/shopping.ts";
import { hostOf, type Region, type Store } from "./region.ts";
import { type ScrubContext, scrubQuery } from "./scrub.ts";
import { type OfferInput, type ProductRow, saveOffer } from "./store.ts";
import { storesFor } from "./verdict.ts";

export type OfferDeps = {
  region: Region;
  read: boolean; // shopping.read: kestrel reads store pages itself
  search: (q: string) => Promise<Hit[] | null>; // the run's searcher: null once the run's searches are spent
  readPage: (url: string, wanted: Wanted, store: Store) => Promise<StoreRead>;
  scrub: ScrubContext;
  now: () => Date;
  step?: (s: string) => void;
};
export type Found = { read: number; links: number; blocked: number; unsearched: number; mismatch: number };

// the product as a store page must show it: its codes (the region's first), its name without the brand, its GTIN
export function wantedOf(p: Pick<ProductRow, "name" | "brand" | "models">): Wanted {
  const bare =
    p.brand && p.name.toLowerCase().startsWith(p.brand.toLowerCase()) ? p.name.slice(p.brand.length).trim() : "";
  return { name: p.name, brand: p.brand, codes: [...new Set([...p.models, ...(bare ? [bare] : [])])], gtin: null };
}

// the stores for a product: the region's in the kind's groups, the readable first, eight at most; the brand's own when
// the region lists it
export function storesOf(region: Region, need: Pick<Need, "storeGroups">, brand: string): Store[] {
  const sell = storesFor(region, need.storeGroups);
  const ordered = [...sell.filter((s) => s.read === "page"), ...sell.filter((s) => s.read === "link")].slice(0, 8);
  const own = Object.entries(region.brandStores).find(([b]) => b.toLowerCase() === brand.toLowerCase())?.[1];
  return own
    ? [
        {
          domain: own,
          name: `${brand} (its own store)`,
          groups: [],
          read: "page",
          searchUrl: `https://${own}/search?q={q}`,
        },
        ...ordered,
      ]
    : ordered;
}

const onStore = (url: string, store: Store) => {
  const h = hostOf(url);
  const d = store.domain.replace(/^www\./, "");
  return h === d || h.endsWith(`.${d}`);
};
// a hit that is this product: its title or its address holds one of the product's codes
const codeRe = (code: string) => {
  const chars = code.toLowerCase().replace(/[^a-z0-9]/g, "");
  return chars.length < 2 ? null : new RegExp(`(?<![a-z0-9])${[...chars].join("[-\\s_]?")}(?![a-z0-9])`, "i");
};
const holdsCode = (hit: Hit, wanted: Wanted) =>
  wanted.codes.some((c) => {
    const re = codeRe(c);
    return re !== null && (re.test(hit.title) || re.test(decodeURIComponent(hit.url)));
  });

const linkRow = (store: Store, model: string, read: "link" | "unsearched", why: string): OfferInput => ({
  store: store.domain,
  url: store.searchUrl.replace("{q}", encodeURIComponent(model)),
  seller: "",
  condition: "new",
  price: null,
  regular: null,
  shipping: null,
  currency: "",
  stock: "unknown",
  pickup: null,
  validUntil: null,
  method: read === "link" ? "link" : "",
  read,
  words: "",
  why,
});

export async function findOffers(
  db: DatabaseSync,
  products: ProductRow[],
  need: Pick<Need, "storeGroups">,
  deps: OfferDeps,
): Promise<Found> {
  const found: Found = { read: 0, links: 0, blocked: 0, unsearched: 0, mismatch: 0 };
  for (const [n, p] of products.entries()) {
    const wanted = wantedOf(p);
    const model = wanted.codes[0] ?? p.name;
    const stores = storesOf(deps.region, need, p.brand);
    // the product's own words are product words here: its name, brand and codes never go in the scrub
    const own = `${p.name} ${p.brand} ${p.models.join(" ")}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    const ctx = {
      ...deps.scrub,
      phrases: [...deps.scrub.phrases, p.name, ...p.models],
      keep: [...deps.scrub.keep, ...own],
    };
    const keep = (o: OfferInput) => {
      saveOffer(db, p.id, o, deps.now());
      if (o.read === "ok") found.read++;
      else if (o.read === "link") found.links++;
      else if (o.read === "blocked") found.blocked++;
      else if (o.read === "unsearched") found.unsearched++;
      else if (o.read === "mismatch") found.mismatch++;
    };
    // the stores kestrel only links to, and every store when it doesn't read pages here: a search link, at once
    const readable: Store[] = [];
    for (const s of stores) {
      if (s.read === "link") keep(linkRow(s, model, "link", s.why ?? "this store turns automated readers away"));
      else if (!deps.read)
        keep(linkRow(s, model, "link", "kestrel doesn't read store pages here (shopping.read is off)"));
      else readable.push(s);
    }
    // the readable stores: their pages found by a search each, then one search for the brand and model
    const pages = new Map<string, string>();
    let spent = false;
    const look = async (q: string, among: Store[]) => {
      const query = scrubQuery(q, ctx);
      if (!query) return;
      const hits = await deps.search(query);
      if (hits === null) {
        spent = true;
        return;
      }
      for (const s of among)
        if (!pages.has(s.domain)) {
          const hit = hits.find((h) => onStore(h.url, s) && holdsCode(h, wanted));
          if (hit) pages.set(s.domain, hit.url);
        }
    };
    for (const s of readable) {
      if (spent) break;
      deps.step?.(`Finding offers: ${p.name} (${n + 1} of ${products.length}), searching ${s.name}`);
      await look(`"${model}" site:${s.domain}`, [s]);
    }
    const missing = readable.filter((s) => !pages.has(s.domain));
    const named = model.toLowerCase().startsWith(p.brand.toLowerCase()) ? model : `${p.brand} ${model}`.trim();
    if (missing.length && !spent) await look(`"${named}"`, missing);
    for (const s of readable) {
      const url = pages.get(s.domain);
      if (!url) {
        keep(
          spent
            ? linkRow(s, model, "unsearched", "the run's searches ran out before this store")
            : linkRow(s, model, "link", "a search found no page for it at this store"),
        );
        continue;
      }
      deps.step?.(`Finding offers: ${p.name} (${n + 1} of ${products.length}), reading ${s.name}`);
      const r = await deps.readPage(url, wanted, s);
      keep({
        store: s.domain,
        url,
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
      });
    }
  }
  return found;
}
