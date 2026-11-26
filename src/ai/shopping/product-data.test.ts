// The store-page reader on made-up stores, one case per fixture: a JSON-LD sale with its strikethrough price; a
// Shopify page read through its product JSON in whole cents, its variant by ?variant= or by SKU, its currency from the
// page or the cart; a Shopify store in another currency refused; meta tags only; a price only in the page's words, read
// by a stand-in model and checked by code; a page built by script with no data; a challenge, by status and by page;
// another region's code; a price in another currency. Then the politeness: robots.txt obeyed with its crawl delay, a
// host that answered 403 rested. No real network: a made-up internet answers from the fixtures.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { startStandIn } from "../stand-in.ts";
import type { Reach } from "../web.ts";
import { askTextPrice, identity, Pacer, type ReadDeps, readStorePage, type Wanted } from "./product-data.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const REACH: Reach = {
  resolve: async () => ["93.184.215.14"],
  head: async () => ({ status: 200, location: null }),
};
// a made-up internet: an address answers its page; robots.txt is missing unless given; anything else is a 404
function internet(pages: Record<string, { status?: number; body: string }>) {
  const asked: string[] = [];
  const get = (async (input: string | URL | Request) => {
    const url = String(input);
    asked.push(url);
    const page = pages[url] ?? { status: 404, body: "not here" };
    return new Response(page.body, { status: page.status ?? 200, headers: { "content-type": "text/html" } });
  }) as typeof fetch;
  return { net: { reach: REACH, fetch: get }, asked };
}
// a pacer on a made-up clock: every wait is kept, none is slept
function pacer() {
  let now = 1_000_000;
  const waits: number[] = [];
  const p = new Pacer({
    now: () => now,
    sleep: async (ms) => {
      waits.push(ms);
      now += ms;
    },
  });
  return { p, waits, later: (ms: number) => (now += ms) };
}
const R7: Wanted = { name: "Brisk R7", brand: "Brisk", codes: ["R7-C", "R7"], gtin: null };
const deps = (net: ReadDeps["net"], extra: Partial<ReadDeps> = {}): ReadDeps => ({
  currency: "CAD",
  storeName: "Store A",
  net,
  pacer: pacer().p,
  ...extra,
});

test("JSON-LD: the sale price, the strikethrough as regular, valid until, shipping; a related product never gives it", async () => {
  const url = "https://store-a.example/p/brisk-r7-c";
  const { net } = internet({ [url]: { body: fixture("jsonld-sale.html") } });
  const got = await readStorePage(url, R7, deps(net));
  assert.deepEqual(
    [got.read, got.method, got.price, got.regular, got.stock, got.validUntil, got.shipping, got.condition, got.gtin],
    ["ok", "jsonld", 44999, 59999, "in", "2026-12-01", 0, "new", "0001234567895"],
  );
});

test("Shopify: its product JSON in whole cents, the variant by ?variant= and by SKU, the currency from the page", async () => {
  const js = { body: fixture("shopify-product.json") };
  const page = { body: fixture("shopify-page.html") };
  const byVariant = "https://shop-h.example/products/brisk-r7?variant=222";
  const { net } = internet({ [byVariant]: page, "https://shop-h.example/products/brisk-r7.js": js });
  const a = await readStorePage(byVariant, R7, deps(net));
  assert.deepEqual([a.read, a.method, a.price, a.regular, a.stock], ["ok", "shopify", 44900, 59900, "in"]);
  // a collection's address, no variant named: the variant whose SKU holds the product's code
  const inCollection = "https://shop-h.example/collections/vacuums/products/brisk-r7";
  const two = internet({ [inCollection]: page, "https://shop-h.example/products/brisk-r7.js": js });
  const b = await readStorePage(inCollection, R7, deps(two.net));
  assert.deepEqual([b.method, b.price, b.gtin], ["shopify", 44900, "0001234567895"]);
});

test("Shopify: no currency on the page asks the cart; another currency is refused", async () => {
  const url = "https://shop-k.example/products/brisk-r7";
  const { net, asked } = internet({
    [url]: { body: fixture("shopify-nocurrency.html") },
    "https://shop-k.example/products/brisk-r7.js": { body: fixture("shopify-product.json") },
    "https://shop-k.example/cart.js": { body: '{"token":"made-up","currency":"CAD","items":[]}' },
  });
  const got = await readStorePage(url, R7, deps(net));
  assert.deepEqual([got.read, got.method, got.price], ["ok", "shopify", 44900]);
  assert.ok(asked.includes("https://shop-k.example/cart.js"));
  const usd = "https://shop-u.example/products/brisk-r7";
  const u = internet({
    [usd]: { body: fixture("shopify-usd.html") },
    "https://shop-u.example/products/brisk-r7.js": { body: fixture("shopify-product.json") },
  });
  const refused = await readStorePage(usd, R7, deps(u.net));
  assert.deepEqual([refused.read, refused.price], ["unreadable", null]);
  assert.match(refused.why, /USD/);
});

test("meta tags only: the price and stock from the price tags", async () => {
  const url = "https://store-m.example/p/orla-s20";
  const { net } = internet({ [url]: { body: fixture("meta-only.html") } });
  const got = await readStorePage(url, { name: "Orla S20", brand: "Orla", codes: ["S20-CA"], gtin: null }, deps(net));
  assert.deepEqual([got.read, got.method, got.price, got.stock], ["ok", "meta", 52900, "in"]);
});

test("the page's words: the stand-in's price kept with the page's words; a page built by script gives none", async () => {
  const standIn = await startStandIn((body) => {
    const asked = body.messages.at(-1)?.content ?? "";
    return {
      content: JSON.stringify(
        asked.includes("Now $449.99")
          ? { price: { amount: "$449.99", words: "Now $449.99" }, regular: { amount: 599.99, words: "Was $599.99" } }
          : { price: null, regular: null },
      ),
    };
  });
  const models = { url: standIn.url, careful: "careful-model", fast: "fast-model", contextChars: 100_000 };
  const textPrice: ReadDeps["textPrice"] = async (text, wanted) => {
    const got = await askTextPrice(models, "careful-model", text, wanted, "CAD");
    return got.ok ? got.value : null;
  };
  const url = "https://store-b.example/brisk-r7";
  const { net } = internet({ [url]: { body: fixture("words-only.html") } });
  const got = await readStorePage(url, R7, deps(net, { textPrice }));
  assert.deepEqual([got.read, got.method, got.price, got.regular], ["ok", "text", 44999, 59999]);
  assert.match(got.words, /Now \$449\.99/);
  const built = "https://store-s.example/item/9";
  const s = internet({ [built]: { body: fixture("script-built.html") } });
  const empty = await readStorePage(built, R7, deps(s.net, { textPrice }));
  assert.deepEqual([empty.read, empty.price], ["unreadable", null]);
  // a made-up price: the number isn't on the page, so code refuses it
  const lying: ReadDeps["textPrice"] = async () => ({
    price: { amount: 399, words: "$399" },
    regular: null,
    currency: "CAD",
  });
  const again = internet({ [url]: { body: fixture("words-only.html") } });
  const refused = await readStorePage(url, R7, deps(again.net, { textPrice: lying }));
  assert.deepEqual([refused.read, refused.price], ["unreadable", null]);
  await standIn.close();
});

test("a challenge, by its status or by its page, is blocked and its host rests a day", async () => {
  const page = "https://store-c.example/item/r7c";
  const shut = internet({ [page]: { status: 403, body: "no" } });
  const p = pacer();
  const a = await readStorePage(page, R7, deps(shut.net, { pacer: p.p }));
  assert.deepEqual([a.read, a.why], ["blocked", "the store turned the reader away (it answered 403)"]);
  const before = shut.asked.length;
  const b = await readStorePage(page, R7, deps(shut.net, { pacer: p.p }));
  assert.equal(b.read, "blocked");
  assert.equal(shut.asked.length, before); // resting: not asked again today
  p.later(86_400_000);
  await readStorePage(page, R7, deps(shut.net, { pacer: p.p }));
  assert.ok(shut.asked.length > before);
  const human = "https://store-d.example/p/r7";
  const { net } = internet({ [human]: { body: fixture("challenge.html") } });
  assert.equal((await readStorePage(human, R7, deps(net))).read, "blocked");
});

test("another region's code is a mismatch; a longer model is a mismatch; a price in another currency is refused", async () => {
  const tv = "https://store-r.example/p/vistra-tv";
  const { net } = internet({ [tv]: { body: fixture("other-region.html") } });
  const got = await readStorePage(
    tv,
    { name: "Vistra A9", brand: "Vistra", codes: ["XR55A9ZC"], gtin: null },
    {
      ...deps(net),
      modelRules: [{ brand: "Vistra", here: "ZC", elsewhere: ["ZA", "ZE"] }],
    },
  );
  assert.deepEqual([got.read, got.why], ["mismatch", "another region's model (XR55A9ZA)"]);
  const plus = "https://store-a.example/p/brisk-r7-plus";
  const p = internet({
    [plus]: {
      body: '<html><head><title>Brisk R7 Plus | Store A</title><script type="application/ld+json">{"@type":"Product","name":"Brisk R7 Plus","sku":"R7P-C","offers":{"@type":"Offer","price":"529","priceCurrency":"CAD"}}</script></head><body><h1>Brisk R7 Plus</h1></body></html>',
    },
  });
  const longer = await readStorePage(plus, R7, deps(p.net));
  assert.equal(longer.read, "mismatch");
  assert.match(longer.why, /R7 Plus/);
  const usd = "https://store-e.example/p/fen-300";
  const e = internet({ [usd]: { body: fixture("other-currency.html") } });
  const refused = await readStorePage(usd, { name: "Fen 300", brand: "Fen", codes: ["F300"], gtin: null }, deps(e.net));
  assert.deepEqual([refused.read, refused.price], ["unreadable", null]);
  assert.match(refused.why, /USD/);
});

test("every name and code is read: a base SKU never outweighs a Plus name; a country's tag is another region's model", async () => {
  const T9: Wanted = { name: "Tidal T9", brand: "Tidal", codes: ["T9"], gtin: null };
  const plusName = { codes: ["T9"], gtins: [], names: ["Tidal T9 Plus"] };
  assert.equal(identity(T9, plusName).ok, false);
  assert.equal(identity(T9, { codes: ["T9-US"], gtins: [], names: ["Tidal T9 Plus"] }).ok, false);
  assert.equal(
    identity({ ...T9, name: "Brisk R7", codes: ["R7"] }, { codes: ["R7"], gtins: [], names: ["Brisk R7 Max"] }).ok,
    false,
  );
  // the region's own tag is no mismatch; another country's is
  assert.equal(identity(T9, { codes: ["T9-CA"], gtins: [], names: [], brands: ["Tidal"] }, [], "ca").ok, true);
  assert.match(
    (identity(T9, { codes: ["T9-US"], gtins: [], names: ["Tidal T9"] }, [], "ca") as { why: string }).why,
    /another region's model \(T9-US\)/,
  );
  // the page's own name plain beside a related Plus: still the product
  assert.equal(identity(T9, { codes: [], gtins: [], names: ["Tidal T9 | Store", "Tidal T9 Plus"] }).ok, true);
  // read end to end: a Plus page whose SKU is the base code is a mismatch, never a $199 best price
  const url = "https://store-e.example/p/tidal-t9";
  const { net } = internet({
    [url]: {
      body: '<html><head><script type="application/ld+json">{"@type":"Product","name":"Tidal T9 Plus","sku":"T9","offers":{"@type":"Offer","price":"199","priceCurrency":"CAD"}}</script></head><body></body></html>',
    },
  });
  const got = await readStorePage(url, T9, deps(net));
  assert.deepEqual([got.read, got.price], ["mismatch", null]);
  // a read page gives the maker's codes (mpn, model), never the store's own sku
  const ok = "https://store-f.example/p/tidal-t9";
  const f = internet({
    [ok]: {
      body: '<html><head><script type="application/ld+json">{"@type":"Product","name":"Tidal T9","sku":"88123","mpn":"T9-C","offers":{"@type":"Offer","price":"499","priceCurrency":"CAD","availability":"https://schema.org/InStock"}}</script></head><body></body></html>',
    },
  });
  const read = await readStorePage(ok, T9, deps(f.net));
  assert.deepEqual([read.read, read.codes], ["ok", ["T9-C"]]);
});

test("robots.txt is obeyed and its crawl delay kept; one request per host at a time, five seconds apart", async () => {
  const robots = "User-agent: *\nDisallow: /p/\nCrawl-delay: 10\n\nUser-agent: other-bot\nDisallow: /";
  const page = "https://robots.example/item/r7-c";
  const { net, asked } = internet({
    "https://robots.example/robots.txt": { body: robots },
    [page]: { body: fixture("jsonld-sale.html") },
  });
  const p = pacer();
  const off = await readStorePage("https://robots.example/p/r7-c", R7, deps(net, { pacer: p.p }));
  assert.deepEqual([off.read, off.why], ["blocked", "the store's robots.txt asks readers to stay off this page"]);
  assert.ok(!asked.includes("https://robots.example/p/r7-c"));
  const ok = await readStorePage(page, R7, deps(net, { pacer: p.p }));
  assert.equal(ok.read, "ok");
  assert.deepEqual(p.waits, [10_000]); // the page waited the crawl delay after robots.txt
  // robots.txt is read once a day per host
  assert.equal(asked.filter((u) => u.endsWith("/robots.txt")).length, 1);
  const q = pacer();
  const plain = internet({ "https://store-a.example/p/brisk-r7-c": { body: fixture("jsonld-sale.html") } });
  await Promise.all([
    readStorePage("https://store-a.example/p/brisk-r7-c", R7, deps(plain.net, { pacer: q.p })),
    readStorePage("https://store-a.example/p/brisk-r7-c", R7, deps(plain.net, { pacer: q.p })),
  ]);
  // one robots.txt for both, then each page in its turn, five seconds after the one before
  assert.deepEqual(q.waits, [5000, 5000]);
  assert.equal(plain.asked.filter((u) => u.endsWith("/robots.txt")).length, 1);
});
