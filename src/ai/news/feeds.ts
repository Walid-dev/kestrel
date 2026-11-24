// The news feeds, read from this computer: one source's RSS, Atom or JSON, fetched over the public web only (publicUrl
// checks the address and every redirect, here and on each hop of the GET), with a time limit, a size cap and an honest
// user agent (a site that turns imitated browsers away answers a plain reader). Then a tolerant reader written here,
// since Node has no XML parser: CDATA, entities, Atom's links, odd dates, a body cut short at the cap, gzip bytes sent
// without their header. No database and no domain here (scripts/boundaries.ts): the domain keeps what comes back.
import { constants, gunzipSync } from "node:zlib";
import { WINDOW_HOURS } from "../../shared/news.ts";
import { publicUrl, type Reach } from "../web.ts";

// where a JSON feed keeps its fields: a path ("title", "paper.title"), alternatives ("paper.title|title"), or a
// template with paths in braces ("https://huggingface.co/papers/{paper.id}")
export type JsonMap = {
  list: string; // the path to the list; "" when the answer is the list
  title: string;
  url: string;
  date: string;
  summary: string;
  score: string;
  thread: string;
};

// what the reader needs to know of a source
export type FeedSpec = {
  url: string; // may hold {since} (unix seconds, 36 hours back) and {yesterday} (YYYY-MM-DD): no other value is sent
  kind: "rss" | "json";
  hosts: string[]; // when given, an item's link must be on one of them (a mirror's links)
  linkFrom: "link" | "description"; // description: an aggregator's item, whose first outside link is the article
  json?: JsonMap;
  minScore: number;
};

export type FeedItem = {
  url: string; // normalised: the same article from two sources is one link
  title: string;
  summary: string;
  published: string | null; // ISO; null when the feed gave no date, or one in the future
  score: number | null; // points or upvotes, from a JSON feed that has them
  thread: string | null; // where it is discussed: an aggregator's own page, a forum thread
};

export type FeedRead =
  | { ok: true; items: FeedItem[]; etag: string | null; lastModified: string | null; unchanged: boolean }
  | { ok: false; why: string };

// how a read reaches the network; tests pass made-up ones (a Reach stand-in, a fetch that answers from fixtures)
export type FeedNet = { reach?: Reach; fetch?: typeof fetch };

const AGENT = "personal-feed-reader/1.0";
const ACCEPT =
  "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, application/json;q=0.8, */*;q=0.5";
export const MAX_BYTES = 3_000_000; // the biggest feed seen was 0.87 MB, with 1,425 items back to 2015
const TIMEOUT_MS = 15_000;
const KEEP = 60; // the newest items kept from one read
const SUMMARY = 500;
const TITLE = 200;

// the only values a feed's address may carry: a time 36 hours back and yesterday's date
export function expandUrl(url: string, now: Date): string {
  const since = Math.floor(now.getTime() / 1000) - WINDOW_HOURS * 3600;
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  return url.replaceAll("{since}", String(since)).replaceAll("{yesterday}", yesterday);
}

export async function readFeed(
  spec: FeedSpec,
  prev: { etag: string | null; lastModified: string | null },
  now: Date,
  net: FeedNet = {},
): Promise<FeedRead> {
  const get = net.fetch ?? fetch;
  // a templated address changes every day: a validator kept from another day's address must not answer for it
  const conditional = !spec.url.includes("{");
  let url = expandUrl(spec.url, now);
  let res: Response | null = null;
  try {
    for (let hop = 0; hop < 3; hop++) {
      const checked = await publicUrl(url, net.reach);
      res = await get(checked, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          "user-agent": AGENT,
          accept: ACCEPT,
          ...(conditional && prev.etag ? { "if-none-match": prev.etag } : {}),
          ...(conditional && prev.lastModified ? { "if-modified-since": prev.lastModified } : {}),
        },
      });
      const moved = res.headers.get("location");
      if (res.status < 300 || res.status >= 400 || res.status === 304 || !moved) break;
      // a site that moves a GET but not a HEAD: the new address is checked like the first, before it is asked
      await res.body?.cancel().catch(() => {});
      url = new URL(moved, checked).href;
      res = null;
    }
    if (!res) return { ok: false, why: "moved too many times" };
    if (res.status === 304)
      return { ok: true, items: [], etag: prev.etag, lastModified: prev.lastModified, unchanged: true };
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return { ok: false, why: `answered ${res.status}` };
    }
    let bytes = await readCapped(res, MAX_BYTES);
    // gzip bytes, though no header said so: some servers send them to a reader that didn't ask
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      try {
        bytes = gunzipSync(bytes, { finishFlush: constants.Z_SYNC_FLUSH, maxOutputLength: MAX_BYTES * 3 });
      } catch {
        return { ok: false, why: "not a feed (its gzip can't be read)" };
      }
    }
    const text = new TextDecoder().decode(bytes).replace(/^﻿/, "");
    const items = spec.kind === "json" ? readJson(text, spec, now) : readXml(text, spec, now);
    if (!items) return { ok: false, why: spec.kind === "json" ? "not JSON" : "not a feed" };
    return {
      ok: true,
      items,
      etag: res.headers.get("etag"),
      lastModified: res.headers.get("last-modified"),
      unchanged: false,
    };
  } catch (e) {
    return { ok: false, why: reason(e) };
  }
}

// a failure in a few plain words for the sources table: never a stack, never a path
function reason(e: unknown): string {
  const err = e as Error & { cause?: { code?: string } };
  if (err?.name === "TimeoutError" || err?.name === "AbortError") return "timed out";
  const msg = String(err?.message ?? e);
  if (/isn't on the public web/.test(msg)) return "not on the public web";
  if (/doesn't resolve/.test(msg)) return "its name doesn't resolve";
  if (/can't be read/.test(msg)) return "its address can't be read";
  const code = err?.cause?.code;
  return code ? `the connection failed (${code})` : "the connection failed";
}

// the body up to the cap: a bigger one is cut there, and the reader keeps what came (it works on a cut body)
async function readCapped(res: Response, max: number): Promise<Buffer> {
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    size += value.length;
    if (size >= max) {
      await reader.cancel().catch(() => {});
      break;
    }
  }
  return Buffer.concat(parts).subarray(0, max);
}

// ── Reading ─────────────────────────────────────────────────────────────────────────────────────────────────────

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  middot: "·",
  bull: "•",
  copy: "©",
  reg: "®",
  trade: "™",
  euro: "€",
  pound: "£",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  ccedil: "ç",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
};

export function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, e: string) => {
    if (e[0] !== "#") return NAMED[e.toLowerCase()] ?? whole;
    const code = e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
    return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
  });
}

// an element's content as HTML: CDATA as written, anything else with its entities decoded once
function asHtml(raw: string): string {
  let out = "";
  let at = 0;
  for (const m of raw.matchAll(/<!\[CDATA\[([\s\S]*?)(?:\]\]>|$)/g)) {
    out += decode(raw.slice(at, m.index)) + m[1];
    at = m.index + m[0].length;
  }
  return out + decode(raw.slice(at));
}

// HTML as one line of plain text: comments, scripts and tags gone, entities decoded, spaces collapsed
export function asText(html: string): string {
  return decode(
    html
      .replace(/<!--[\s\S]*?(?:-->|$)/g, " ")
      .replace(/<(script|style)\b[\s\S]*?(?:<\/\1\s*>|$)/gi, " ")
      .replace(/<[^>]*>?/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// the first of these elements in a block, its content raw; an element cut off by the size cap is missing
function element(block: string, names: string[]): string | null {
  for (const name of names) {
    const n = escapeRe(name);
    const m = block.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}\\s*>`, "i"));
    if (m) return m[1];
  }
  return null;
}

const attrs = (s: string): Record<string, string> =>
  Object.fromEntries(
    [...s.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((m) => [m[1].toLowerCase(), m[2] ?? m[3] ?? ""]),
  );

// an item's own link: RSS's element text, Atom's alternate (or first) link, a permalink guid
function linkOf(block: string): string {
  const text = asText(asHtml(element(block, ["link"]) ?? ""));
  if (text) return text;
  const tags = [...block.matchAll(/<link\b([^>]*)>/gi)].map((m) => attrs(m[1]));
  const pick = tags.find((a) => a.href && (!a.rel || a.rel === "alternate")) ?? tags.find((a) => a.href);
  if (pick) return decode(pick.href).trim();
  const guid = asText(asHtml(element(block, ["guid", "id"]) ?? ""));
  return /^https?:\/\//i.test(guid) ? guid : "";
}

type Raw = { title: string; link: string; date: string; html: string; score: number | null; thread: string };

// every <item> (RSS) or <entry> (Atom) block, the last one taken as far as the body goes when the cap cut it
export function parseXml(text: string, max = 500): Raw[] {
  const starts = [...text.matchAll(/<(item|entry)(?:\s[^>]*)?>/gi)];
  const out: Raw[] = [];
  for (let i = 0; i < starts.length && out.length < max; i++) {
    const from = (starts[i].index ?? 0) + starts[i][0].length;
    let block = text.slice(from, i + 1 < starts.length ? starts[i + 1].index : text.length);
    const end = block.search(new RegExp(`</${starts[i][1]}\\s*>`, "i"));
    if (end >= 0) block = block.slice(0, end);
    const description = element(block, ["description", "summary", "content:encoded", "content"]) ?? "";
    out.push({
      title: asText(asHtml(element(block, ["title"]) ?? "")),
      link: linkOf(block),
      date: asText(element(block, ["pubDate", "published", "updated", "dc:date", "issued", "created"]) ?? ""),
      html: asHtml(description),
      score: null,
      thread: "",
    });
  }
  return out;
}

function readXml(text: string, spec: FeedSpec, now: Date): FeedItem[] | null {
  const raw = parseXml(text);
  if (!raw.length && !/<(rss|feed|rdf:RDF)\b/i.test(text.slice(0, 4000))) return null;
  return finish(raw, spec, now);
}

// a path through an object: "paper.id"; a list's place by number works too ("authors.0.name")
const pathOf = (v: unknown, path: string): unknown =>
  path
    .split(".")
    .filter(Boolean)
    .reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), v);
const asString = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : "";

// a field's value from its map entry: a template fills every {path}, or empty when one is missing; otherwise the
// first of the alternatives that has a value
export function fill(entry: unknown, spec: string): string {
  if (!spec) return "";
  if (spec.includes("{")) {
    let missing = false;
    const out = spec.replace(/\{([^}]+)\}/g, (_, p: string) => {
      const v = asString(pathOf(entry, p.trim()));
      if (!v) missing = true;
      return encodeURIComponent(v);
    });
    return missing ? "" : out;
  }
  for (const p of spec.split("|")) {
    const v = asString(pathOf(entry, p.trim()));
    if (v) return v;
  }
  return "";
}

function readJson(text: string, spec: FeedSpec, now: Date): FeedItem[] | null {
  const map = spec.json;
  if (!map) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const list = map.list ? pathOf(data, map.list) : data;
  if (!Array.isArray(list)) return null;
  const raw: Raw[] = list.slice(0, 500).map((entry) => {
    const score = Number.parseFloat(fill(entry, map.score));
    const thread = fill(entry, map.thread);
    return {
      title: asText(fill(entry, map.title)),
      // a story with no link of its own (a forum's question) is its thread
      link: fill(entry, map.url) || thread,
      date: fill(entry, map.date),
      html: fill(entry, map.summary),
      score: Number.isFinite(score) ? Math.round(score) : null,
      thread,
    };
  });
  return finish(raw, spec, now);
}

// a feed's date as ISO: RFC 822 with any zone, ISO, a day alone, unix seconds or milliseconds. A date in the future
// is not believed (the item takes the time it was first seen)
export function feedDate(raw: string, now: Date): string | null {
  const s = raw.trim();
  if (!s) return null;
  let t = /^\d{9,13}$/.test(s) ? (s.length <= 10 ? Number(s) * 1000 : Number(s)) : Date.parse(s);
  // "Tue, 24 Nov 2026 10:25:00 +0000 (UTC)", or a day's name the parser doesn't know
  if (Number.isNaN(t)) t = Date.parse(s.replace(/\s*\([^)]*\)\s*$/, "").replace(/^[^\d,]+,\s*/, ""));
  if (Number.isNaN(t) || t > now.getTime() + 10 * 60_000) return null;
  return new Date(t).toISOString();
}

// a link as one form for every source: https, no fragment, no tracking parameters, no trailing slash, so the same
// article carried by two feeds is one item
const TRACKING = /^(utm_\w+|at_\w+|fbclid|gclid|ref|ref_src|guccounter|mc_cid|mc_eid|cmpid|smid)$/i;
export function normalizeUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  u.protocol = "https:";
  u.hash = "";
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  u.pathname = u.pathname.replace(/\/+$/, "") || "/";
  return u.href;
}

export const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
export const onHosts = (url: string, hosts: string[]): boolean => {
  const host = hostOf(url);
  return hosts.some((h) => host === h || host.endsWith(`.${h}`));
};

// an aggregator's item: its first link to another site's article (never the aggregator's own pages or a front page)
function firstOutsideLink(html: string, own: string): string | null {
  const ownHost = hostOf(own);
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const href = decode(m[1]).trim();
    let u: URL;
    try {
      u = new URL(href);
    } catch {
      continue;
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") continue;
    const host = u.hostname.replace(/^www\./, "");
    if (ownHost && (host === ownHost || host.endsWith(`.${ownHost}`))) continue;
    if (u.pathname.replace(/\/+$/, "") === "") continue;
    return u.href;
  }
  return null;
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

// the items as kestrel keeps them: a link that is web and on the source's hosts, a title, a believable date, the
// summary as plain text, the newest first and 60 at most
function finish(raw: Raw[], spec: FeedSpec, now: Date): FeedItem[] {
  const out: FeedItem[] = [];
  for (const r of raw) {
    let link = r.link;
    let thread = r.thread || null;
    if (spec.linkFrom === "description") {
      const original = firstOutsideLink(r.html, link);
      if (original) {
        thread = link;
        link = original;
      }
    }
    const url = normalizeUrl(link);
    if (!url || !r.title) continue;
    if (spec.hosts.length && !onHosts(url, spec.hosts)) continue;
    if (r.score != null && r.score < spec.minScore) continue;
    out.push({
      url,
      title: cut(r.title, TITLE),
      summary: cut(asText(r.html), SUMMARY),
      published: feedDate(r.date, now),
      score: r.score,
      thread: thread ? normalizeUrl(thread) : null,
    });
  }
  const time = (i: FeedItem) => (i.published ? Date.parse(i.published) : Number.NEGATIVE_INFINITY);
  return out.sort((a, b) => time(b) - time(a)).slice(0, KEEP);
}
