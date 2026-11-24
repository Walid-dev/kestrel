// The feed reader on made-up feeds (fixtures/): RSS with CDATA, entities and odd dates; Atom's links; an aggregator's
// article link; a body cut at the cap; gzip bytes without their header; JSON feeds by their map; a redirect home
// refused before any GET; the address carrying only the time and yesterday's date. A made-up network only: names
// resolve as listed and every GET is answered here.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import type { Reach } from "../web.ts";
import { expandUrl, type FeedSpec, feedDate, normalizeUrl, readFeed } from "./feeds.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const NOW = new Date("2026-11-24T15:00:00Z");
const NONE = { etag: null, lastModified: null };

// names resolve to a public address unless listed as home; a HEAD answers a redirect where one is listed
const reach = (moves: Record<string, string> = {}, home: string[] = []): Reach => ({
  resolve: async (host) => (home.includes(host) ? ["192.168.1.20"] : ["93.184.215.14"]),
  head: async (url) => (moves[url] ? { status: 302, location: moves[url] } : { status: 200, location: null }),
});
// a GET answered from a table of made-up answers; what was asked is kept
function web(answers: Record<string, () => Response>) {
  const asked: { url: string; headers: Record<string, string> }[] = [];
  const get = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    asked.push({ url, headers: Object.fromEntries(new Headers(init?.headers).entries()) });
    return answers[url]?.() ?? new Response("gone", { status: 404 });
  }) as typeof fetch;
  return { get, asked };
}
const ok =
  (body: Uint8Array | string, headers: Record<string, string> = {}) =>
  () =>
    new Response(body, { status: 200, headers });
const spec = (url: string, more: Partial<FeedSpec> = {}): FeedSpec => ({
  url,
  kind: "rss",
  hosts: [],
  linkFrom: "link",
  minScore: 0,
  ...more,
});

test("RSS: CDATA and entities read, tracking cut, odd dates, no date kept, a future date not believed, newest first", async () => {
  const w = web({ "https://news.example.com/feed": ok(fixture("rss.xml"), { etag: '"v1"' }) });
  const got = await readFeed(spec("https://news.example.com/feed"), NONE, NOW, { reach: reach(), fetch: w.get });
  assert.ok(got.ok);
  assert.equal(got.etag, '"v1"');
  // newest first; no date and a date in the future (not believed) last, in the feed's order
  assert.deepEqual(
    got.items.map((i) => [i.title, i.url, i.published]),
    [
      [
        "Teapot Labs raises $40m for kettles that think",
        "https://news.example.com/2026/11/24/teapot-labs-raise?id=7",
        "2026-11-24T14:15:00.000Z",
      ],
      [
        "Spout’s new model reads 2 million words at once",
        "https://news.example.com/2026/11/24/spout-model",
        "2026-11-24T13:05:00.000Z",
      ],
      [
        "Saucer chips sell out for the third quarter",
        "https://news.example.com/2026/11/23/saucer-chips",
        "2026-11-23T22:40:00.000Z",
      ],
      ["A cup with no date", "https://news.example.com/2026/11/cup", null],
      ["A story from next year", "https://news.example.com/2027/01/01/later", null],
    ],
  );
  const teapot = got.items.find((i) => i.title.startsWith("Teapot"));
  assert.equal(teapot?.summary, "The made-up start-up says its kettles learn when you want tea & biscuits.");
  assert.equal(
    got.items.find((i) => i.title.startsWith("Spout"))?.summary,
    "A made-up lab’s model takes a whole library in one go.",
  );
  assert.equal(
    got.items.find((i) => i.title.startsWith("Saucer"))?.summary,
    "Every made-up saucer chip is spoken for until spring.",
  );
  // the reader says who it is, plainly, and asks for feeds
  assert.match(w.asked[0].headers["user-agent"], /^personal-feed-reader\//);
  assert.doesNotMatch(w.asked[0].headers["user-agent"], /Mozilla|Chrome|Safari/);
});

test("Atom: the alternate link first, else the only one; a mirror's link off its hosts is dropped", async () => {
  const w = web({ "https://mirror.example.net/lab.xml": ok(fixture("atom.xml")) });
  const lab = spec("https://mirror.example.net/lab.xml", { hosts: ["lab.example.org"] });
  const got = await readFeed(lab, NONE, NOW, { reach: reach(), fetch: w.get });
  assert.ok(got.ok);
  assert.deepEqual(
    got.items.map((i) => [i.title, i.url, i.published]),
    [
      ["Introducing Brew 2 & its tools", "https://lab.example.org/news/brew-2", "2026-11-24T08:00:00.000Z"],
      ["Brew notes, day 2", "https://docs.lab.example.org/notes/day-2", "2026-11-23T07:00:00.000Z"],
    ],
  );
  assert.equal(got.items[0].summary, "Brew 2 answers in half the time.");
});

test("an aggregator's item links the article itself, its own page kept as the thread", async () => {
  const w = web({ "https://www.meme.example.com/feed.xml": ok(fixture("aggregator.xml")) });
  const meme = spec("https://www.meme.example.com/feed.xml", { linkFrom: "description" });
  const got = await readFeed(meme, NONE, NOW, { reach: reach(), fetch: w.get });
  assert.ok(got.ok);
  assert.equal(got.items[0].url, "https://wire.example.net/markets/kettle-shares-fall");
  assert.equal(got.items[0].thread, "https://www.meme.example.com/261124/p5");
  assert.match(got.items[0].summary, /Shares fell 6% on Tuesday\./);
});

test("a body cut short gives the items before the cut; gzip bytes with no header are read", async () => {
  const whole = fixture("rss.xml");
  const cutAt = whole.indexOf("<title>A cup with no date");
  const w = web({
    "https://cut.example.com/feed": ok(whole.subarray(0, cutAt + 12)),
    "https://zipped.example.com/feed": ok(gzipSync(whole)),
  });
  const cut = await readFeed(spec("https://cut.example.com/feed"), NONE, NOW, { reach: reach(), fetch: w.get });
  assert.ok(cut.ok);
  assert.deepEqual(cut.items.map((i) => i.title).sort(), [
    "Saucer chips sell out for the third quarter",
    "Spout’s new model reads 2 million words at once",
    "Teapot Labs raises $40m for kettles that think",
  ]);
  const zipped = await readFeed(spec("https://zipped.example.com/feed"), NONE, NOW, { reach: reach(), fetch: w.get });
  assert.ok(zipped.ok);
  assert.equal(zipped.items.length, 5);
});

test("JSON feeds by their map: a template link, an upvote floor, a forum question that is its own thread", async () => {
  const w = web({
    "https://papers.example.com/api?date=2026-11-23": ok(fixture("papers.json")),
    [`https://forum.example.com/api?since=${NOW.getTime() / 1000 - 36 * 3600}`]: ok(fixture("hn.json")),
  });
  const papers = spec("https://papers.example.com/api?date={yesterday}", {
    kind: "json",
    minScore: 20,
    json: {
      list: "",
      title: "paper.title|title",
      url: "https://papers.example.com/papers/{paper.id}",
      date: "publishedAt|paper.publishedAt",
      summary: "paper.summary",
      score: "paper.upvotes",
      thread: "",
    },
  });
  const p = await readFeed(papers, NONE, NOW, { reach: reach(), fetch: w.get });
  assert.ok(p.ok);
  assert.deepEqual(
    p.items.map((i) => [i.title, i.url, i.score]),
    [["Steeping Is All You Need", "https://papers.example.com/papers/2611.01234", 94]],
  );
  const forum = spec("https://forum.example.com/api?since={since}", {
    kind: "json",
    json: {
      list: "hits",
      title: "title",
      url: "url",
      date: "created_at",
      summary: "",
      score: "points",
      thread: "https://forum.example.com/item?id={objectID}",
    },
  });
  const f = await readFeed(forum, { etag: '"old"', lastModified: "Sun" }, NOW, { reach: reach(), fetch: w.get });
  assert.ok(f.ok);
  assert.deepEqual(
    f.items.map((i) => [i.url, i.score, i.thread]),
    [
      ["https://forum.example.com/item?id=4243", 312, "https://forum.example.com/item?id=4243"],
      ["https://blog.example.com/open-kettles", 1886, "https://forum.example.com/item?id=4242"],
    ],
  );
  // a templated address changes daily: no validator from another day goes with it
  assert.equal(w.asked.at(-1)?.headers["if-none-match"], undefined);
});

test("home is refused: by a HEAD's redirect before any GET, by a GET's redirect, by a name that resolves home", async () => {
  const w = web({
    "https://moved.example.com/feed": () =>
      new Response(null, { status: 301, headers: { location: "https://127.0.0.1:8790/api/live" } }),
  });
  const headHome = reach({ "https://sly.example.com/feed": "https://127.0.0.1:8790/api/live" });
  const a = await readFeed(spec("https://sly.example.com/feed"), NONE, NOW, { reach: headHome, fetch: w.get });
  assert.deepEqual(a, { ok: false, why: "not on the public web" });
  assert.equal(w.asked.length, 0);
  const b = await readFeed(spec("https://moved.example.com/feed"), NONE, NOW, { reach: reach(), fetch: w.get });
  assert.deepEqual(b, { ok: false, why: "not on the public web" });
  assert.equal(w.asked.length, 1);
  const c = await readFeed(spec("https://router.example.com/feed"), NONE, NOW, {
    reach: reach({}, ["router.example.com"]),
    fetch: w.get,
  });
  assert.deepEqual(c, { ok: false, why: "not on the public web" });
  assert.equal(w.asked.length, 1);
});

test("plain reasons for a failure; a 304 keeps the validators and brings nothing", async () => {
  const w = web({
    "https://shut.example.com/feed": () => new Response("no", { status: 403 }),
    "https://page.example.com/feed": ok("<html><body>Not a feed</body></html>"),
    "https://same.example.com/feed": () => new Response(null, { status: 304 }),
  });
  const net = { reach: reach(), fetch: w.get };
  assert.deepEqual(await readFeed(spec("https://shut.example.com/feed"), NONE, NOW, net), {
    ok: false,
    why: "answered 403",
  });
  assert.deepEqual(await readFeed(spec("https://page.example.com/feed"), NONE, NOW, net), {
    ok: false,
    why: "not a feed",
  });
  const same = await readFeed(spec("https://same.example.com/feed"), { etag: '"v1"', lastModified: "Mon" }, NOW, net);
  assert.deepEqual(same, { ok: true, items: [], etag: '"v1"', lastModified: "Mon", unchanged: true });
  assert.equal(w.asked.at(-1)?.headers["if-none-match"], '"v1"');
});

test("a read that hangs gives up at its limit: a body that never ends, a name lookup that never answers", async () => {
  // a body stream that only closes when the read is called off
  const hang = (async (_input: string | URL | Request, init?: RequestInit) => {
    const signal = init?.signal as AbortSignal;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode("<rss><channel><item><title>Half"));
        signal.addEventListener("abort", () => c.error(signal.reason));
      },
    });
    return new Response(body, { status: 200 });
  }) as typeof fetch;
  const started = Date.now();
  const a = await readFeed(spec("https://slow.example.com/feed"), NONE, NOW, {
    reach: reach(),
    fetch: hang,
    timeoutMs: 50,
  });
  assert.deepEqual(a, { ok: false, why: "timed out" });
  const stuck: Reach = { resolve: () => new Promise(() => {}), head: reach().head };
  const b = await readFeed(spec("https://stuck.example.com/feed"), NONE, NOW, {
    reach: stuck,
    fetch: hang,
    timeoutMs: 50,
  });
  assert.deepEqual(b, { ok: false, why: "timed out" });
  assert.ok(Date.now() - started < 2000);
});

test("an address carries only a time 36 hours back and yesterday's date; links are one form; dates of every kind", () => {
  assert.equal(
    expandUrl("https://x.example.com/?since={since}&date={yesterday}", NOW),
    `https://x.example.com/?since=${NOW.getTime() / 1000 - 36 * 3600}&date=2026-11-23`,
  );
  assert.equal(
    normalizeUrl("http://News.Example.com/a/b/?utm_source=x&fbclid=y&ref=z&page=2#top"),
    "https://news.example.com/a/b?page=2",
  );
  assert.equal(normalizeUrl("https://news.example.com/a?at_medium=RSS&at_campaign=x"), "https://news.example.com/a");
  assert.equal(normalizeUrl("javascript:alert(1)"), null);
  for (const [raw, iso] of [
    ["Tue, 24 Nov 2026 09:15:00 -0500", "2026-11-24T14:15:00.000Z"],
    ["Tue, 24 Nov 2026 09:15:00 GMT", "2026-11-24T09:15:00.000Z"],
    ["Tue, 24 Nov 2026 09:15:00 EST", "2026-11-24T14:15:00.000Z"],
    ["2026-11-24T09:15:00+01:00", "2026-11-24T08:15:00.000Z"],
    ["2026-11-20", "2026-11-20T00:00:00.000Z"],
    ["1764000000", "2025-11-24T16:00:00.000Z"],
    ["Mardi, 24 Nov 2026 09:15:00 +0000", "2026-11-24T09:15:00.000Z"],
  ])
    assert.equal(feedDate(raw, NOW), iso, raw);
  assert.equal(feedDate("someday", NOW), null);
  assert.equal(feedDate("2027-01-01", NOW), null);
});
