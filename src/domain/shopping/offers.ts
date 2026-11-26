// Find the offers: for each product picked, where to buy it now in my region. The region's stores that sell this kind
// (eight at most, the readable ones first) and the brand's own store when the region file lists it. A store kestrel
// only links to gets its search link at once, with no search and no fetch. The search words are the brand and the model,
// never a bare word or number. Every product first gets one search (its brand's own store when listed, else an open
// search in the region), so each has a chance at a price; then each readable store still without a page gets
// "<brand model>" site:<store>, while the run's searches last. A hit counts only when its title or address holds a code
// that tells the product apart. A price in a search result's words, for a listed store's page, is kept on that store's
// row as the search result's: never read from the page, never a reading, never the best price, never ranked. The page is read by the
// store-page reader (ai/shopping/product-data.ts). A store left when the searches run out is unsearched, with its
// search link. A store an open search turns up but the region file doesn't list is never read. Every offer is kept by
// its address, every reading with it.
import type { DatabaseSync } from "node:sqlite";
import { distinctive, type StoreRead, type Wanted } from "../../ai/shopping/product-data.ts";
import type { Hit } from "../../ai/web.ts";
import type { Need } from "../../shared/shopping.ts";
import { hostOf, type Region, type Store } from "./region.ts";
import { type ScrubContext, scrubQuery } from "./scrub.ts";
import { type OfferInput, offersOf, type ProductRow, saveOffer, setModels } from "./store.ts";
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

// the product as a store page must show it: its codes that tell it apart (the region's first; never a bare "850"), its
// name without the brand, its brand, its GTIN
export function wantedOf(p: Pick<ProductRow, "name" | "brand" | "models">): Wanted {
  const bare =
    p.brand && p.name.toLowerCase().startsWith(p.brand.toLowerCase()) ? p.name.slice(p.brand.length).trim() : "";
  const codes = p.models.filter(distinctive);
  return { name: p.name, brand: p.brand, codes: [...new Set([...codes, ...(bare ? [bare] : [])])], gtin: null };
}

// the words a store search and a store's link use: the brand and the model, never a bare word or number. The maker's
// code when one tells it apart ("Sony WH-1000XM6"), else the whole name with its brand ("REI Co-op Stormhenge 850 Down
// Hybrid Parka"): the first live run searched "850" and found a keyboard
export function searchName(p: Pick<ProductRow, "name" | "brand" | "models">): string {
  const code = p.models.find(distinctive);
  const brand = p.brand.trim();
  if (code) return code.toLowerCase().startsWith(brand.toLowerCase()) || !brand ? code : `${brand} ${code}`;
  return !brand || p.name.toLowerCase().startsWith(brand.toLowerCase()) ? p.name : `${brand} ${p.name}`;
}

const onStore = (url: string, store: Store) => {
  const h = hostOf(url);
  const d = store.domain.replace(/^www\./, "");
  return h === d || h.endsWith(`.${d}`);
};
// a hit that is this product: its title or its address holds one of the product's codes
const codeRe = (code: string) => {
  const chars = code.toLowerCase().replace(/[^a-z0-9]/g, "");
  return chars.length < 2 ? null : new RegExp(`(?<![a-z0-9])${[...chars].join("[^a-z0-9]{0,3}")}(?![a-z0-9])`, "i");
};
// a price a search result's words show for a store's page, in the region's currency ("$449.99", "C$449"), never one in
// another currency, a monthly payment, a saving ("Save $100", "$50 off"), a former price ("Was $549.99", "Reg.
// $549.99") or a threshold ("free shipping over $35"). With several prices left, only the one the product's code sits
// right before counts, else none: a search result's words are a guess, so a doubtful one is no price at all. Kept as
// the search result's, shown and never ranked
export function snippetPrice(
  snippet: string,
  currency: string,
  codes: string[] = [],
): { cents: number; words: string } | null {
  const found: { cents: number; at: number; words: string }[] = [];
  // a range ("$199.99 to $649.99") is many products' prices: blanked, never read
  const text = snippet.replace(/\$\s?[\d,.]+\s*(?:to|-|–)\s*(?:C|CA|US)?\$\s?[\d,.]+/gi, (r) => " ".repeat(r.length));
  for (const m of text.matchAll(
    /(US\s?\$|USD\s?|C\s?\$|CA\$|CAD\s?\$?|\$)\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)/gi,
  )) {
    const at = m.index ?? 0;
    const sign = m[1].toUpperCase().replace(/\s/g, "");
    if (sign.startsWith("US")) continue;
    if (currency !== "CAD" && sign !== "$") continue;
    const after = snippet.slice(at + m[0].length, at + m[0].length + 14);
    if (/^\s*(\/\s?mo|per month|a month|\/month|bi-?weekly)/i.test(after)) continue;
    const before = snippet.slice(Math.max(0, at - 16), at);
    if (
      /\b(save|saving|savings|was|reg|regular|regularly|compare at|list|msrp|orig|original|from|over|under|above|orders)[\s.:]*$|-$/i.test(
        before,
      )
    )
      continue;
    if (/^\s*off\b/i.test(after)) continue;
    const cents = Math.round(Number.parseFloat(m[2].replace(/,/g, "")) * 100);
    if (cents < 500) continue; // a shipping fee or a gift card's, never a product's
    found.push({ cents, at, words: snippet.slice(Math.max(0, at - 30), at + m[0].length + 10).trim() });
  }
  if (found.length <= 1) return found[0] ? { cents: found[0].cents, words: found[0].words } : null;
  // the words between the price before (or 100 characters back) and this one hold the product's code
  const near = found.filter((f, i) => {
    const from = Math.max(f.at - 100, i > 0 ? found[i - 1].at : 0);
    return codes.some((c) => codeRe(c)?.test(snippet.slice(from, f.at)) ?? false);
  });
  return near.length === 1 ? { cents: near[0].cents, words: near[0].words } : null;
}

// a search result for an accessory or a part of the product ("Sony WH-1000XM6 Replacement Ear Pads", "Case for …"):
// its code is in the title, its price is another thing's. Words the product's own name holds don't count
const ACCESSORY =
  /\b(replacement|compatible|ear ?pads?|ear ?cushions?|charger|filters?|side brush(es)?|mop pads?|dust bags?|accessor(y|ies)|spare parts?|refills?|screen protectors?)\b/gi;
export function accessoryOf(title: string, p: Pick<ProductRow, "name" | "brand">): boolean {
  const own = p.name.toLowerCase();
  if ([...title.matchAll(ACCESSORY)].some((m) => !own.includes(m[0].toLowerCase()))) return true;
  const brand = p.brand.trim().toLowerCase();
  return brand.length > 1 && title.toLowerCase().includes(`for ${brand}`);
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

const holdsCode = (hit: Hit, wanted: Wanted) =>
  wanted.codes.some((c) => {
    const re = codeRe(c);
    return re !== null && (re.test(hit.title) || re.test(decodeURIComponent(hit.url)));
  });

const linkRow = (store: Store, words: string, read: "link" | "unsearched", why: string): OfferInput => ({
  store: store.domain,
  url: store.searchUrl.replace("{q}", encodeURIComponent(words)),
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
  type Plan = {
    p: ProductRow;
    n: number;
    wanted: Wanted;
    words: string;
    stores: Store[];
    readable: Store[];
    pages: Map<string, string>; // a readable store's product page, by its domain
    snippets: Map<string, { url: string; cents: number; words: string }>; // a store's search-result price
    looked: Set<string>; // the readable stores already searched
    ctx: ScrubContext;
  };
  const plans: Plan[] = products.map((p, n) => {
    const stores = storesOf(deps.region, need, p.brand);
    // the product's own words are product words here: its name, brand and codes never go in the scrub
    const own = `${p.name} ${p.brand} ${p.models.join(" ")}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    return {
      p,
      n,
      wanted: wantedOf(p),
      words: searchName(p),
      stores,
      readable: deps.read ? stores.filter((s) => s.read === "page") : [],
      pages: new Map(),
      snippets: new Map(),
      looked: new Set(),
      ctx: { ...deps.scrub, phrases: [...deps.scrub.phrases, p.name, ...p.models], keep: [...deps.scrub.keep, ...own] },
    };
  });
  let spent = false;
  // one search, its hits sorted onto the plan's stores: a readable store's page, and any listed store's price in the
  // search result's words (a store kestrel only links to included)
  const look = async (plan: Plan, q: string) => {
    const query = scrubQuery(q, plan.ctx);
    if (!query) return;
    const hits = await deps.search(query);
    if (hits === null) {
      spent = true;
      return;
    }
    for (const s of plan.stores)
      for (const h of hits) {
        if (!onStore(h.url, s) || !holdsCode(h, plan.wanted)) continue;
        if (s.read === "page" && !plan.pages.has(s.domain)) plan.pages.set(s.domain, h.url);
        const price = accessoryOf(h.title, plan.p)
          ? null
          : snippetPrice(`${h.title} ${h.snippet}`, deps.region.currency, plan.wanted.codes);
        if (price && !plan.snippets.has(s.domain)) plan.snippets.set(s.domain, { url: h.url, ...price });
      }
  };
  const step = (plan: Plan, store: string) =>
    deps.step?.(`Finding offers: ${plan.p.name} (${plan.n + 1} of ${products.length}), searching ${store}`);
  // first, one search for every product, so each has a chance at a price before any has a second: its brand's own store
  // when the region lists one, else an open search in the region (its hits land on any listed store)
  for (const plan of plans) {
    if (spent || !deps.read) break;
    const own = plan.readable.find((s) => s.name.endsWith("(its own store)"));
    step(plan, own?.name ?? "the web");
    if (own) {
      await look(plan, `"${plan.words}" site:${own.domain}`);
      if (!spent) plan.looked.add(own.domain);
    } else await look(plan, `"${plan.words}" ${deps.region.searchWords}`.trim());
  }
  // then each product's readable stores still without a page, while the run's searches last
  for (const plan of plans)
    for (const s of plan.readable) {
      if (spent) break;
      if (plan.pages.has(s.domain) || plan.looked.has(s.domain)) continue;
      step(plan, s.name);
      await look(plan, `"${plan.words}" site:${s.domain}`);
      if (!spent) plan.looked.add(s.domain);
    }
  // the rows: each page read, each store left with its link, a search result's price where nothing better was read
  for (const plan of plans) {
    const { p, wanted } = plan;
    let learnt = false;
    const keep = (o: OfferInput) => {
      // a store whose page gave no price keeps a price its search result showed, as the search result's
      // never on a page that was another product: its search result was about that page
      const snip = o.read !== "ok" && o.read !== "mismatch" ? plan.snippets.get(o.store) : undefined;
      const row: OfferInput = snip
        ? {
            ...o,
            url: o.read === "link" || o.read === "unsearched" ? snip.url : o.url,
            price: snip.cents,
            currency: deps.region.currency,
            method: o.method || "link",
            words: snip.words,
            why: `${o.why ? `${o.why}; ` : ""}a search result shows this price: kestrel didn't read it on the store's page`,
          }
        : o;
      saveOffer(db, p.id, row, deps.now());
      if (row.read === "ok") found.read++;
      else if (row.read === "link") found.links++;
      else if (row.read === "blocked") found.blocked++;
      else if (row.read === "unsearched") found.unsearched++;
      else if (row.read === "mismatch") found.mismatch++;
    };
    for (const s of plan.stores) {
      if (s.read === "link") {
        keep(linkRow(s, plan.words, "link", s.why ?? "this store turns automated readers away"));
        continue;
      }
      if (!deps.read) {
        keep(linkRow(s, plan.words, "link", "kestrel doesn't read store pages here (shopping.read is off)"));
        continue;
      }
      const url = plan.pages.get(s.domain);
      if (!url) {
        keep(
          plan.looked.has(s.domain) || !spent
            ? linkRow(s, plan.words, "link", "a search found no page for it at this store")
            : linkRow(s, plan.words, "unsearched", "the run's searches ran out before this store"),
        );
        continue;
      }
      deps.step?.(`Finding offers: ${p.name} (${plan.n + 1} of ${products.length}), reading ${s.name}`);
      const r = await deps.readPage(url, wanted, s);
      // a page that didn't open says nothing about the price: an offer already read at this address keeps its reading
      if (r.offline && offersOf(db, p.id).some((o) => o.url === url && o.read === "ok")) {
        found.read++;
        continue;
      }
      // a product with no maker code takes the first read page's (its data's mpn or model): later checks match on it
      if (r.read === "ok" && !p.models.length && !learnt && r.codes?.length) {
        learnt = true;
        setModels(db, p.id, r.codes);
        wanted.codes.push(...r.codes.filter((c) => !wanted.codes.includes(c)));
      }
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
