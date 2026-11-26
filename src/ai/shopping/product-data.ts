// The store-page reader (v1.2): a product's price read from the store page's own data, never guessed. The product page
// comes first, always, through the shared public fetch and an honest user agent; then these methods in order, the first
// that gives a price wins: Shopify's product JSON (only when the page shows the platform's own markers), JSON-LD, the
// price meta tags, microdata, and last the page's words, read by the model and kept only when code finds that number on
// the page near the product's name or code, in the region's currency. A page that is another product is a mismatch; a
// store that turns the reader away is blocked; a price in another currency is refused. Politeness: product pages only,
// robots.txt read once a day per host and obeyed, one request per host at a time and five seconds apart at least, a
// host that answers 403 or 429 rested a day. No database here (scripts/boundaries.ts): the domain keeps what comes back.
import type { Condition, Method, Stock } from "../../shared/shopping.ts";
import { callModel, escapeRawBreaks, type ModelAnswer, type ModelSettings } from "../client.ts";
import { asText, decode, fetchPublic, type PublicNet } from "../web.ts";
import { SYSTEM, textPricePrompt } from "./prompt.ts";
import { TextPrice } from "./shape.ts";

export const SHOP_AGENT = "personal-shopping-reader/1.0";
const HTML = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5";
const MAX_PAGE = 4_000_000;

// the product a store page must be: its name, brand, every code it is sold under (the region's first) and its GTIN
export type Wanted = { name: string; brand: string; codes: string[]; gtin: string | null };
// a brand's code for this region against other regions' (a TV code ending ZA elsewhere and ZC here)
export type ModelRule = { brand: string; here: string; elsewhere: string[] };

export type StoreRead = {
  read: "ok" | "blocked" | "unreadable" | "mismatch";
  method: Method;
  price: number | null; // cents
  regular: number | null;
  shipping: number | null;
  currency: string;
  stock: Stock;
  condition: Condition;
  seller: string;
  pickup: boolean | null;
  validUntil: string | null;
  gtin: string | null;
  codes?: string[]; // the maker's codes the page's data gives for the product (mpn, model), for a product kestrel has none for
  words: string; // a price read from the page's words: those words
  why: string; // a read with no price: why, in words
  // the page didn't open (a network failure, a time-out): no answer about the price, so a check keeps the last one
  offline?: boolean;
};

export type ReadDeps = {
  currency: string; // the region's: a price in another is refused
  storeName?: string; // a seller by another name is a marketplace offer
  modelRules?: ModelRule[];
  region?: string; // the region's key (ca): a code tagged with it is this region's model
  net?: PublicNet;
  pacer?: Pacer;
  // the model's read of the page's words (the domain records the call); without it the last method is skipped
  textPrice?: (text: string, wanted: Wanted) => Promise<TextPrice | null>;
};

const EMPTY: StoreRead = {
  read: "unreadable",
  method: "",
  price: null,
  regular: null,
  shipping: null,
  currency: "",
  stock: "unknown",
  condition: "new",
  seller: "",
  pickup: null,
  validUntil: null,
  gtin: null,
  words: "",
  why: "",
};
const none = (read: StoreRead["read"], why: string): StoreRead => ({ ...EMPTY, read, why });

// ── Politeness ───────────────────────────────────────────────────────────────────────────────────────────────────

type Rule = { allow: boolean; path: string };
type Host = {
  last: number;
  restUntil: number;
  queue: Promise<unknown>;
  robots: { at: number; rules: Rule[]; delay: number } | null;
  reading: Promise<void> | null; // robots.txt on its way: the next page waits for it instead of asking again
};
const DAY = 86_400_000;

// one request per host at a time, gapMs apart at least (or the robots.txt's crawl delay when longer); a host that
// turned the reader away rests restMs; robots.txt read once a day per host. In memory: a restart starts afresh
export class Pacer {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  gapMs: number;
  restMs: number;
  hosts = new Map<string, Host>();
  constructor(
    opts: { now?: () => number; sleep?: (ms: number) => Promise<void>; gapMs?: number; restMs?: number } = {},
  ) {
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.gapMs = opts.gapMs ?? 5000;
    this.restMs = opts.restMs ?? DAY;
  }
  private host(url: string): Host {
    const key = hostOf(url);
    let h = this.hosts.get(key);
    if (!h) {
      h = { last: Number.NEGATIVE_INFINITY, restUntil: 0, queue: Promise.resolve(), robots: null, reading: null };
      this.hosts.set(key, h);
    }
    return h;
  }
  resting(url: string): boolean {
    return this.host(url).restUntil > this.now();
  }
  rest(url: string): void {
    this.host(url).restUntil = this.now() + this.restMs;
  }
  // a request on the host: it waits for the one before and for the gap, then runs
  turn<T>(url: string, fn: () => Promise<T>): Promise<T> {
    const h = this.host(url);
    const gap = Math.max(this.gapMs, (h.robots?.delay ?? 0) * 1000);
    const run = h.queue.then(async () => {
      const wait = h.last + gap - this.now();
      if (wait > 0) await this.sleep(wait);
      try {
        return await fn();
      } finally {
        h.last = this.now();
      }
    });
    h.queue = run.catch(() => {});
    return run;
  }
  // whether the host's robots.txt lets this reader open the page: read once a day; one that can't be read allows it
  async allowed(url: string, net?: PublicNet): Promise<boolean> {
    const h = this.host(url);
    if (!h.reading && (!h.robots || this.now() - h.robots.at >= DAY))
      h.reading = this.turn(url, () =>
        fetchPublic(`${new URL(url).origin}/robots.txt`, {
          accept: "text/plain",
          agent: SHOP_AGENT,
          maxBytes: 500_000,
          net,
        }),
      )
        .then((got) => {
          h.robots = { at: this.now(), ...(got.ok ? parseRobots(got.text, SHOP_AGENT) : { rules: [], delay: 0 }) };
        })
        .finally(() => {
          h.reading = null;
        });
    if (h.reading) await h.reading;
    return robotsAllow(h.robots?.rules ?? [], new URL(url));
  }
}
export const PACER = new Pacer();

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

// the rules of robots.txt's group for this reader (its own name, else *), and its crawl delay in seconds
export function parseRobots(text: string, agent: string): { rules: Rule[]; delay: number } {
  const token = agent.split("/")[0].toLowerCase();
  const groups: { agents: string[]; rules: Rule[]; delay: number }[] = [];
  let open: { agents: string[]; rules: Rule[]; delay: number } | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!open || open.rules.length || open.delay) {
        open = { agents: [], rules: [], delay: 0 };
        groups.push(open);
      }
      open.agents.push(value.toLowerCase());
    } else if (open && (key === "allow" || key === "disallow")) {
      if (value) open.rules.push({ allow: key === "allow", path: value });
    } else if (open && key === "crawl-delay") {
      const n = Number.parseFloat(value);
      if (Number.isFinite(n) && n > 0) open.delay = Math.min(n, 60);
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && token.startsWith(a)));
  const pick = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  return { rules: pick.flatMap((g) => g.rules), delay: Math.max(0, ...pick.map((g) => g.delay)) };
}

// the longest rule that matches the path wins, Allow on a tie; no rule allows
export function robotsAllow(rules: Rule[], url: URL): boolean {
  const path = `${url.pathname}${url.search}`;
  let best: Rule | null = null;
  for (const r of rules) {
    const re = new RegExp(
      `^${r.path
        .split("*")
        .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*")
        .replace(/\\\$$/, "$")}`,
    );
    if (!re.test(path)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return best ? best.allow : true;
}

// ── What a page holds ────────────────────────────────────────────────────────────────────────────────────────────

// a store's way of saying "show me you're human": generic markers, no site names. A page whose data holds a price
// isn't one, whatever its scripts say
const CHALLENGE =
  /just a moment\.\.\.|access denied|press (?:&amp;|&|and) hold|attention required|verify you are (?:a )?human|are you a robot|pardon our interruption|request unsuccessful|\/cdn-cgi\/challenge-platform|captcha-delivery|px-captcha/i;
export const isChallenge = (html: string) => CHALLENGE.test(html.slice(0, 8000)) || CHALLENGE.test(titleOf(html));
// the platform's own markers in the HTML; no site names
export const isShopify = (html: string) =>
  /cdn\.shopify\.com|Shopify\.theme|window\.Shopify\b|shopify-section|\/cdn\/shop\/|\.myshopify\.com/i.test(html);

const titleOf = (html: string) => asText(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
const attrsOf = (tag: string): Record<string, string> =>
  Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((m) => [
      m[1].toLowerCase(),
      decode(m[2] ?? m[3] ?? ""),
    ]),
  );
const metaOf = (html: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrsOf(m[0]);
    const key = (a.property ?? a.name ?? a.itemprop ?? "").toLowerCase();
    if (key && a.content !== undefined && !(key in out)) out[key] = a.content.trim();
  }
  return out;
};

// money as cents: a number of dollars, or a string with a sign, thousands' separators or a decimal comma
export function cents(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : null;
  if (typeof v !== "string") return null;
  let s = v.replace(/[^\d.,]/g, "");
  if (/,\d{2}$/.test(s) && !/\.\d{2}$/.test(s)) s = s.replace(/[.\s]/g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number.parseFloat(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

// schema.org's availability, or a meta tag's words; in stock means sold online, so in-store only is out
const STOCK: [RegExp, Stock][] = [
  [/preorder|presale|backorder/i, "preorder"],
  [/outofstock|soldout|discontinued|instoreonly|unavailable|out of stock|\boos\b/i, "out"],
  [/instock|limitedavailability|onlineonly|in stock|available/i, "in"],
];
// a page's words that say it can't be bought online now
const SAYS_OUT =
  /out of stock|sold out|currently unavailable|unavailable online|not available online|no longer available|épuisé|en rupture/i;
const stockOf = (v: unknown): Stock => {
  const s = String(v ?? "").replace(/https?:\/\/schema\.org\//gi, "");
  return STOCK.find(([re]) => re.test(s))?.[1] ?? "unknown";
};
const conditionOf = (v: unknown): Condition | null => {
  const s = String(v ?? "").toLowerCase();
  if (!s) return null;
  if (/refurb/.test(s)) return "refurbished";
  if (/used|damaged/.test(s)) return "used";
  if (/open.?box/.test(s)) return "open-box";
  return /new/.test(s) ? "new" : null;
};

type Offer = {
  price: number | null;
  regular: number | null;
  currency: string;
  stock: Stock;
  validUntil: string | null;
  seller: string;
  condition: Condition | null;
  shipping: number | null;
  pickup: boolean | null;
  url: string;
};
// makers: the maker's own codes (mpn, model), which every store shares; a sku is often the store's own number
type LdProduct = {
  names: string[];
  codes: string[];
  makers: string[];
  gtins: string[];
  brands: string[];
  offers: Offer[];
};

const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const str = (v: unknown): string =>
  typeof v === "string"
    ? v.trim()
    : typeof v === "number"
      ? String(v)
      : v && typeof v === "object"
        ? str((v as { name?: unknown }).name)
        : "";
const typesOf = (o: Record<string, unknown>) => asList(o["@type"]).map((t) => String(t).replace(/^.*[/#]/, ""));

function offerOf(o: Record<string, unknown>): Offer[] {
  const types = typesOf(o);
  if (types.includes("AggregateOffer")) {
    const inner = asList(o.offers).flatMap((x) =>
      x && typeof x === "object" ? offerOf(x as Record<string, unknown>) : [],
    );
    if (inner.length) return inner;
    return [
      {
        price: cents(o.lowPrice ?? o.price),
        regular: null,
        currency: str(o.priceCurrency).toUpperCase(),
        stock: stockOf(o.availability),
        validUntil: null,
        seller: "",
        condition: Number(o.offerCount) > 1 ? "marketplace" : null,
        shipping: null,
        pickup: null,
        url: str(o.url),
      },
    ];
  }
  const specs = asList(o.priceSpecification).filter(
    (x): x is Record<string, unknown> => Boolean(x) && typeof x === "object",
  );
  const struck = specs.find((s) => /strikethrough|listprice|msrp|regular/i.test(String(s.priceType ?? "")));
  const plainSpec = specs.find((s) => s !== struck && s.price !== undefined);
  const ship = asList(o.shippingDetails)
    .map((d) => (d && typeof d === "object" ? (d as { shippingRate?: unknown }).shippingRate : null))
    .find((r) => r && typeof r === "object") as Record<string, unknown> | undefined;
  const avail = String(o.availability ?? "");
  return [
    {
      price: cents(o.price ?? plainSpec?.price),
      regular: struck ? cents(struck.price) : null,
      currency: (str(o.priceCurrency) || str(plainSpec?.priceCurrency) || str(struck?.priceCurrency)).toUpperCase(),
      stock: stockOf(avail),
      validUntil: str(o.priceValidUntil) || null,
      seller: str(o.seller),
      condition: conditionOf(o.itemCondition),
      shipping: ship ? (cents(ship.value) ?? (Number(ship.value) === 0 ? 0 : null)) : null,
      pickup: /instoreonly|onsitepickup/i.test(`${avail} ${JSON.stringify(o.availableDeliveryMethod ?? "")}`)
        ? true
        : null,
      url: str(o.url),
    },
  ];
}

// every Product (and each variant of a ProductGroup) the page's JSON-LD holds, with its names, codes and offers
export function readJsonLd(html: string): LdProduct[] {
  const found: LdProduct[] = [];
  const walk = (v: unknown, depth: number) => {
    if (depth > 8 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const x of v) walk(x, depth + 1);
      return;
    }
    const o = v as Record<string, unknown>;
    const types = typesOf(o);
    if (types.includes("Product") || types.includes("ProductGroup")) {
      const base = {
        names: [str(o.name), str(o.model)].filter(Boolean),
        codes: [o.sku, o.mpn, o.productID, o.model, o.productGroupID].map(str).filter(Boolean),
        makers: [o.mpn, o.model].map(str).filter(Boolean),
        gtins: [o.gtin, o.gtin8, o.gtin12, o.gtin13, o.gtin14].map(str).filter(Boolean),
        brands: [str(o.brand), str(o.manufacturer)].filter(Boolean),
      };
      const offers = asList(o.offers).flatMap((x) =>
        x && typeof x === "object" ? offerOf(x as Record<string, unknown>) : [],
      );
      const variants = asList(o.hasVariant);
      if (offers.length || !variants.length) found.push({ ...base, offers });
      for (const x of variants)
        if (x && typeof x === "object") {
          const n = found.length;
          walk(x, depth + 1);
          // a variant names itself; the group's name and brand are kept beside it for the identity check
          for (const p of found.slice(n)) {
            p.names.push(...base.names);
            p.brands.push(...base.brands);
          }
        }
      return;
    }
    for (const k of ["@graph", "mainEntity", "itemListElement", "item"]) if (k in o) walk(o[k], depth + 1);
  };
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = m[1]
      .replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, "")
      .replace(/^\s*<!--|-->\s*$/g, "")
      .trim();
    for (const text of [raw, escapeRawBreaks(raw)]) {
      try {
        walk(JSON.parse(text), 0);
        break;
      } catch {
        // the next way of reading it, or nothing from this block
      }
    }
  }
  return found;
}

export function readMeta(html: string): { offer: Offer | null; codes: string[]; names: string[]; brands: string[] } {
  const m = metaOf(html);
  const sale = cents(m["product:sale_price:amount"]);
  const list = cents(m["product:price:amount"] ?? m["og:price:amount"]);
  const price = sale ?? list;
  const regular = cents(m["product:original_price:amount"]) ?? (sale && list && list > sale ? list : null);
  return {
    offer:
      price === null
        ? null
        : {
            price,
            regular: regular && regular > price ? regular : null,
            currency: (
              m["product:price:currency"] ??
              m["og:price:currency"] ??
              m["product:sale_price:currency"] ??
              ""
            ).toUpperCase(),
            stock: stockOf(m["product:availability"] ?? m["og:availability"]),
            validUntil: null,
            seller: "",
            condition: conditionOf(m["product:condition"]),
            shipping: null,
            pickup: null,
            url: "",
          },
    codes: [m["product:retailer_item_id"], m["product:mfr_part_no"], m["product:sku"]].filter((x): x is string =>
      Boolean(x),
    ),
    names: [m["og:title"], m["twitter:title"]].filter((x): x is string => Boolean(x)),
    brands: [m["product:brand"], m["og:brand"], m.brand].filter((x): x is string => Boolean(x)),
  };
}

export function readMicrodata(html: string): {
  offer: Offer | null;
  codes: string[];
  gtins: string[];
  names: string[];
} {
  const prop = (name: string): string[] => {
    const out: string[] = [];
    for (const m of html.matchAll(
      new RegExp(`<([a-z0-9]+)\\b[^>]*itemprop\\s*=\\s*["']${name}["'][^>]*>([^<]*)`, "gi"),
    )) {
      const a = attrsOf(m[0]);
      out.push(decode(a.content ?? a.href ?? a.value ?? m[2] ?? "").trim());
    }
    return out.filter(Boolean);
  };
  const price = cents(prop("price")[0] ?? prop("lowPrice")[0]);
  return {
    offer:
      price === null
        ? null
        : {
            price,
            regular: null,
            currency: (prop("priceCurrency")[0] ?? "").toUpperCase(),
            stock: stockOf(prop("availability")[0]),
            validUntil: prop("priceValidUntil")[0] ?? null,
            seller: "",
            condition: conditionOf(prop("itemCondition")[0]),
            shipping: null,
            pickup: null,
            url: "",
          },
    codes: [...prop("sku"), ...prop("mpn"), ...prop("productID")],
    gtins: [...prop("gtin13"), ...prop("gtin12"), ...prop("gtin14"), ...prop("gtin8"), ...prop("gtin")],
    names: prop("name"),
  };
}

// ── Is it the product? ───────────────────────────────────────────────────────────────────────────────────────────

const VARIANT = /^[\s-]*(plus|pro|max|ultra|lite|mini|xl|se|\+)\b/i;
// a code as a pattern: its letters and digits in order, a dash or a space allowed between them, never inside a longer
// code (R7 never matches R70)
const codeRe = (code: string): RegExp | null => {
  const chars = code
    .toLowerCase()
    .replace(/\/[a-z]+$/i, "")
    .replace(/[^a-z0-9]/g, "");
  if (chars.length < 2) return null;
  return new RegExp(`(?<![a-z0-9])${[...chars].join("[-\\s]?")}(?![a-z0-9])`, "i");
};
const digits = (s: string) => s.replace(/\D/g, "").replace(/^0+/, "");

// a code followed by a country's tag (T9-US, R7/EU): that country's model, unless it is the region's own
const REGION_TAG = /^[-/_](us|usa|uk|eu|au|jp|cn|kr|in|de|fr|it|es|mx|br|ca|int)\b/i;

// a code that can tell one product from another: letters and digits together (WH-1000XM6, L40, R7) or a long number
// (a style number, 103826). A bare short number ("850") or a word alone ("Heritage") names many things: a store search
// for "850" found a keyboard for a parka in the first live run
export const distinctive = (code: string): boolean => {
  const c = code.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (/[a-z]/.test(c) && /\d/.test(c)) || /^\d{5,}$/.test(c);
};
// a name compared as letters only, accents and marks aside ("Fjällräven" is "Fjallraven")
const letters = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// whether what the page says it is (its codes, GTINs, names and title) holds one of the product's codes, and its brand
// when the product has one: a GTIN that matches is enough; another region's code (by the region's rules, or a country's tag after the code) is a
// mismatch. Every name and code is read, not only the first that matches: a longer model ("R7 Plus") in a name is a
// mismatch unless another name shows the code plainly (a related product beside the page's own), and a bare SKU
// ("T9") never outweighs a name that says "T9 Plus". here: the region's key (ca), whose own tag is no mismatch
export function identity(
  wanted: Wanted,
  page: { codes: string[]; gtins: string[]; names: string[]; brands?: string[] },
  rules: ModelRule[] = [],
  here = "",
): { ok: true } | { ok: false; why: string } {
  if (wanted.gtin && page.gtins.some((g) => digits(g) === digits(wanted.gtin ?? ""))) return { ok: true };
  const said = [...page.codes, ...page.names];
  // the brand first: a page that never names it is another maker's product, whatever number it shares
  const brand = letters(wanted.brand);
  if (brand.length > 1 && ![...said, ...(page.brands ?? [])].some((x) => letters(x).includes(brand)))
    return { ok: false, why: `the page doesn't name ${wanted.brand}` };
  for (const r of rules.filter((x) => x.brand.toLowerCase() === wanted.brand.toLowerCase()))
    for (const code of wanted.codes) {
      if (!code.toUpperCase().endsWith(r.here.toUpperCase())) continue;
      const base = code.slice(0, code.length - r.here.length);
      for (const other of r.elsewhere) {
        const re = codeRe(`${base}${other}`);
        if (re && said.some((s) => re.test(s))) return { ok: false, why: `another region's model (${base}${other})` };
      }
    }
  // only codes that tell products apart; the bare name (the name without its brand) counts when it has two words
  const usable = wanted.codes.filter((c) => distinctive(c) || c.trim().split(/\s+/).length >= 2);
  const codes = [...usable].sort((a, b) => b.length - a.length).flatMap((c) => codeRe(c) ?? []);
  // each string read: plain (the code alone), longer (the code and a model word the product lacks), or silent
  let plainCode = false;
  let plainName = false;
  let longer = "";
  const names = new Set(page.names);
  for (const s of said) {
    // the longest code that matches this string decides it (R7-C before R7)
    const m = codes.map((re) => re.exec(s)).find((x) => x !== null);
    if (!m) continue;
    const after = s.slice((m.index ?? 0) + m[0].length);
    const tag = REGION_TAG.exec(after);
    if (tag && tag[1].toLowerCase() !== here.toLowerCase())
      return {
        ok: false,
        why: `another region's model (${s.slice(m.index, (m.index ?? 0) + m[0].length + tag[0].length).trim()})`,
      };
    const v = VARIANT.exec(after);
    if (v && !new RegExp(`\\b${v[1].replace("+", "\\+")}\\b`, "i").test(wanted.name)) {
      longer ||= s.slice(m.index, (m.index ?? 0) + m[0].length + v[0].length).trim();
      continue;
    }
    if (names.has(s)) plainName = true;
    else plainCode = true;
  }
  if (longer && !plainName) return { ok: false, why: `the page is another model (${longer})` };
  if (plainName || plainCode) return { ok: true };
  return { ok: false, why: "the page names another product" };
}

// ── The page's words, last ───────────────────────────────────────────────────────────────────────────────────────

const MARKS: Record<string, { ok: RegExp; no: RegExp }> = {
  CAD: { ok: /\$|\bCAD\b/i, no: /US\s?\$|\bUSD\b|€|£/i },
  USD: { ok: /\$|\bUSD\b/i, no: /C\s?\$|CA\$|\bCAD\b|€|£/i },
  EUR: { ok: /€|\bEUR\b/i, no: /\$|£/ },
  GBP: { ok: /£|\bGBP\b/i, no: /\$|€/ },
};
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// the places on the page where the product is named: its codes, and its name without the brand
function mentions(text: string, wanted: Wanted): number[] {
  const out: number[] = [];
  for (const c of [...wanted.codes, wanted.name]) {
    const re = codeRe(c);
    if (!re) continue;
    const g = new RegExp(re.source, "gi");
    for (const m of text.matchAll(g)) out.push(m.index ?? 0);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

// the ways a price is written: 449.99, 449,99 (French), 1,299.99, 1 299,99; a whole one also as 449
const writings = (cents: number): string[] => {
  const whole = Math.floor(cents / 100);
  const part = String(cents % 100).padStart(2, "0");
  const thousands = (sep: string) => String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  const out = [`${whole}.${part}`, `${whole},${part}`, `${thousands(",")}.${part}`, `${thousands(" ")},${part}`];
  if (part === "00") out.push(String(whole), thousands(","), thousands(" "));
  return [...new Set(out)];
};

// a number the model read: kept only when the page holds it within 300 characters of the product's name or code, with
// the region's currency beside it and no other currency's. The words returned are the page's own, around it
export function onPage(
  text: string,
  wanted: Wanted,
  amountCents: number,
  currency: string,
): { cents: number; words: string } | null {
  const near = mentions(text, wanted);
  if (!near.length) return null;
  const marks = MARKS[currency] ?? { ok: new RegExp(`\\b${escapeRe(currency)}\\b`, "i"), no: /$^/ };
  for (const w of writings(amountCents)) {
    const re = new RegExp(`(?<![\\d.,])${escapeRe(w)}(?!\\d|[.,]\\d)`, "g");
    for (const m of text.matchAll(re)) {
      const at = m.index ?? 0;
      if (!near.some((n) => Math.abs(n - at) <= 300)) continue;
      const beside = text.slice(Math.max(0, at - 6), at + w.length + 6);
      if (!marks.ok.test(beside) || marks.no.test(beside)) continue;
      // the page's own words around it, cut at whole words
      const from = Math.max(0, at - 24);
      const to = Math.min(text.length, at + w.length + 12);
      let words = text.slice(from, to);
      if (from > 0) words = words.slice(words.indexOf(" ") + 1);
      if (to < text.length) words = words.slice(0, Math.max(words.lastIndexOf(" "), words.indexOf(w) + w.length));
      return { cents: amountCents, words: words.trim() };
    }
  }
  return null;
}

// the text the model reads for a price: 6,000 characters around the product's first mention
export function textAround(text: string, wanted: Wanted, chars = 6000): string | null {
  const first = mentions(text, wanted)[0];
  if (first === undefined) return null;
  const from = Math.max(0, first - chars / 2);
  return text.slice(from, from + chars);
}

// the model's read of a page's words, on the use's model (the domain records the call)
export function askTextPrice(
  models: ModelSettings,
  model: string,
  text: string,
  wanted: Wanted,
  currency: string,
): Promise<ModelAnswer<TextPrice>> {
  return callModel(
    { ...models, careful: model, fast: model },
    {
      model,
      system: SYSTEM,
      prompt: textPricePrompt({ name: wanted.name, codes: wanted.codes }, text, currency),
      maxTokens: 1200,
      thinking: false,
    },
    TextPrice,
  );
}

// ── Reading one store page ───────────────────────────────────────────────────────────────────────────────────────

type Shopify = {
  price: number;
  regular: number | null;
  stock: Stock;
  codes: string[];
  gtin: string | null;
  names: string[];
};

// Shopify's product JSON, by the handle in the address (also /collections/<x>/products/<handle>): prices in whole
// cents, no currency. The variant is the one in ?variant=, else the one whose SKU or barcode holds the product's code
async function shopifyProduct(url: string, wanted: Wanted, deps: ReadDeps, pacer: Pacer): Promise<Shopify | null> {
  const u = new URL(url);
  const handle = /\/products\/([^/?#]+)/.exec(u.pathname)?.[1];
  if (!handle) return null;
  const got = await pacer.turn(url, () =>
    fetchPublic(`${u.origin}/products/${handle}.js`, { accept: "application/json", agent: SHOP_AGENT, net: deps.net }),
  );
  if (!got.ok) return null;
  let product: { title?: unknown; variants?: unknown };
  try {
    product = JSON.parse(got.text) as typeof product;
  } catch {
    return null;
  }
  type V = {
    id?: unknown;
    sku?: unknown;
    barcode?: unknown;
    price?: unknown;
    compare_at_price?: unknown;
    available?: unknown;
    title?: unknown;
  };
  const variants = asList(product.variants).filter((v): v is V => Boolean(v) && typeof v === "object");
  const wantedId = u.searchParams.get("variant");
  const byCode = () => {
    for (const code of [...wanted.codes].sort((a, b) => b.length - a.length)) {
      const re = codeRe(code);
      const hit =
        re &&
        variants.find((v) => re.test(str(v.sku)) || (wanted.gtin && digits(str(v.barcode)) === digits(wanted.gtin)));
      if (hit) return hit;
    }
    return null;
  };
  const v =
    (wantedId ? variants.find((x) => str(x.id) === wantedId) : null) ??
    byCode() ??
    (variants.length === 1 ? variants[0] : null);
  if (!v) return null;
  // whole cents in the .js answer (12900 is 129.00); a string with a decimal point is dollars
  const money = (x: unknown): number | null =>
    typeof x === "number"
      ? Number.isInteger(x) && x > 0
        ? x
        : null
      : typeof x === "string" && x.includes(".")
        ? cents(x)
        : null;
  const price = money(v.price);
  if (price === null) return null;
  const compare = money(v.compare_at_price);
  const barcode = digits(str(v.barcode));
  return {
    price,
    regular: compare && compare > price ? compare : null,
    stock: v.available === true ? "in" : v.available === false ? "out" : "unknown",
    codes: [str(v.sku)].filter(Boolean),
    gtin: barcode.length >= 8 ? str(v.barcode) : null,
    names: [`${str(product.title)} ${str(v.title)}`.trim()],
  };
}

// a store's own cart, for the currency a Shopify page didn't say
async function shopifyCurrency(url: string, deps: ReadDeps, pacer: Pacer): Promise<string> {
  const got = await pacer.turn(url, () =>
    fetchPublic(`${new URL(url).origin}/cart.js`, { accept: "application/json", agent: SHOP_AGENT, net: deps.net }),
  );
  if (!got.ok) return "";
  try {
    return str((JSON.parse(got.text) as { currency?: unknown }).currency).toUpperCase();
  } catch {
    return "";
  }
}

const near = (a: string, b: string) => {
  const x = a.toLowerCase().replace(/[^a-z0-9]/g, "");
  const y = b.toLowerCase().replace(/[^a-z0-9]/g, "");
  return Boolean(x && y) && (x.includes(y) || y.includes(x));
};

export async function readStorePage(url: string, wanted: Wanted, deps: ReadDeps): Promise<StoreRead> {
  const pacer = deps.pacer ?? PACER;
  if (pacer.resting(url)) return none("blocked", "the store turned the reader away lately; kestrel rests it a day");
  if (!(await pacer.allowed(url, deps.net)))
    return none("blocked", "the store's robots.txt asks readers to stay off this page");
  const page = await pacer.turn(url, () =>
    fetchPublic(url, { accept: HTML, agent: SHOP_AGENT, maxBytes: MAX_PAGE, net: deps.net }),
  );
  if (!page.ok) {
    if (page.status === 403 || page.status === 429) {
      pacer.rest(url);
      return none("blocked", `the store turned the reader away (it answered ${page.status})`);
    }
    return { ...none("unreadable", `the page didn't open (${page.why})`), offline: true };
  }
  const html = page.text;
  const ld = readJsonLd(html);
  const meta = readMeta(html);
  const micro = readMicrodata(html);
  const dataPrice =
    ld.some((p) => p.offers.some((o) => o.price !== null)) || meta.offer !== null || micro.offer !== null;
  if (isChallenge(html) && (!dataPrice || html.length < 20_000)) {
    pacer.rest(url);
    return none("blocked", "the store asked for a human check");
  }
  const h1 = asText(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? "");
  const said = {
    codes: [...ld.flatMap((p) => p.codes), ...meta.codes, ...micro.codes],
    gtins: [...ld.flatMap((p) => p.gtins), ...micro.gtins],
    names: [titleOf(html), h1, ...ld.flatMap((p) => p.names), ...meta.names, ...micro.names].filter(Boolean),
    brands: [...ld.flatMap((p) => p.brands), ...meta.brands],
  };
  const who = identity(wanted, said, deps.modelRules, deps.region);
  if (!who.ok) return none("mismatch", who.why);
  const gtin = said.gtins[0] ?? null;
  // the product the page is (a "related" one beside it never gives the price or its codes); any, when none names a code
  const mine = ld.filter(
    (p) =>
      identity(
        wanted,
        { codes: p.codes, gtins: p.gtins, names: p.names, brands: [...p.brands, ...said.brands, titleOf(html), h1] },
        deps.modelRules,
        deps.region,
      ).ok,
  );
  const codes = [...new Set(mine.flatMap((p) => p.makers))].slice(0, 3);
  const pageCurrency = (
    ld.flatMap((p) => p.offers).find((o) => o.currency)?.currency ||
    meta.offer?.currency ||
    micro.offer?.currency ||
    ""
  ).toUpperCase();
  const foreign = (c: string) => none("unreadable", `its price is in ${c}, not ${deps.currency}: refused`);
  // out of stock in the data only counts when the page's words say it too: a page whose data says OutOfStock until
  // its scripts ask the store's stock service, and whose words say nothing, has a stock kestrel can't tell (the first
  // live run read three headphones as out of stock this way; the one whose page said so was)
  const words = asText(html);
  const stockOf = (o: Offer): Stock => (o.stock === "out" && !SAYS_OUT.test(words) ? "unknown" : o.stock);
  const kept = (o: Offer, method: Method, extra: Partial<StoreRead> = {}): StoreRead => {
    // a seller named, and not the store: another seller on the store's marketplace
    const marketplace = Boolean(o.seller && deps.storeName && !near(o.seller, deps.storeName));
    return {
      ...EMPTY,
      read: "ok",
      method,
      price: o.price,
      regular: o.regular && o.price !== null && o.regular > o.price ? o.regular : null,
      shipping: o.shipping,
      currency: deps.currency,
      stock: stockOf(o),
      condition: o.condition === "new" || o.condition === null ? (marketplace ? "marketplace" : "new") : o.condition,
      seller: o.seller,
      pickup: o.pickup,
      validUntil: o.validUntil,
      gtin,
      codes,
      ...extra,
    };
  };

  // 1. Shopify, only when the page shows it is a Shopify store
  if (isShopify(html)) {
    const s = await shopifyProduct(url, wanted, deps, pacer);
    if (s) {
      const variant = identity(
        wanted,
        { codes: s.codes, gtins: s.gtin ? [s.gtin] : [], names: s.names },
        deps.modelRules,
        deps.region,
      );
      const currency = pageCurrency || (await shopifyCurrency(url, deps, pacer));
      if (!currency) return none("unreadable", "the store doesn't say its currency: refused");
      if (currency !== deps.currency) return foreign(currency);
      if (variant.ok || !s.codes.length)
        return kept(
          {
            price: s.price,
            regular: s.regular,
            currency,
            stock: s.stock,
            validUntil: null,
            seller: "",
            condition: "new",
            shipping: null,
            pickup: null,
            url,
          },
          "shopify",
          { gtin: s.gtin ?? gtin },
        );
    }
  }
  // 2. JSON-LD: the product whose code matches (a variant by the address's ?variant= first), its offer in the region's
  // currency, in stock first
  if (ld.length) {
    const variantId = new URL(url).searchParams.get("variant");
    const offers = (mine.length ? mine : ld).flatMap((p) => p.offers).filter((o) => o.price !== null);
    const pick =
      (variantId ? offers.find((o) => o.url.includes(`variant=${variantId}`)) : undefined) ??
      offers.find((o) => o.currency === deps.currency && o.stock === "in") ??
      offers.find((o) => o.currency === deps.currency || !o.currency) ??
      offers[0];
    if (pick) {
      const currency = pick.currency || pageCurrency;
      if (currency && currency !== deps.currency) return foreign(currency);
      if (currency) return kept(pick, "jsonld");
    }
  }
  // 3. the price meta tags, then 4. microdata
  for (const [o, method] of [
    [meta.offer, "meta"],
    [micro.offer, "microdata"],
  ] as const) {
    if (!o) continue;
    const currency = o.currency || pageCurrency;
    if (currency && currency !== deps.currency) return foreign(currency);
    if (currency) return kept(o, method);
  }
  // 5. the page's words: the model reads them, code keeps its number only when it is on the page by the product
  if (!deps.textPrice) return none("unreadable", "the page shows no price in its data");
  const text = words;
  const around = textAround(text, wanted);
  if (!around) return none("unreadable", "the page shows no price in its data");
  const got = await deps.textPrice(around, wanted);
  if (!got?.price) return none("unreadable", "the page shows no price kestrel can read");
  const price = onPage(text, wanted, Math.round(got.price.amount * 100), deps.currency);
  if (!price) return none("unreadable", "the price the model read isn't on the page by the product: refused");
  const regular = got.regular ? onPage(text, wanted, Math.round(got.regular.amount * 100), deps.currency) : null;
  return {
    ...EMPTY,
    read: "ok",
    method: "text",
    price: price.cents,
    regular: regular && regular.cents > price.cents ? regular.cents : null,
    currency: deps.currency,
    gtin,
    codes,
    words: price.words,
  };
}
