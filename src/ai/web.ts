// The web, read from this computer through the model door's own tools: oMLX's search (DuckDuckGo, no account or key)
// and its page fetch. A deep check and Research use them, with search words from a listing or my question, never
// from a profile; Ask with the words its model wrote, which wait for my tap on a page of my own. The page fetch opens
// public addresses only (publicUrl, below).
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { constants, gunzipSync } from "node:zlib";
import type { ModelSettings } from "./client.ts";

export type Hit = { title: string; url: string; snippet: string };

async function web<T>(settings: ModelSettings, path: "search" | "fetch", body: Record<string, string>): Promise<T> {
  const res = await fetch(`${settings.url}/web/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  const j = (await res.json()) as T & { ok?: boolean; error?: { message?: string } };
  if (!res.ok || j.ok === false) throw new Error(j.error?.message ?? `web ${path} answered ${res.status}`);
  return j;
}

// a search's hits, and when it found none, whether it failed: failed holds why the last try didn't go through ("" when
// the door answered, even with nothing), so Ask can tell the model a search that failed from one that found nothing
export async function webSearch(
  settings: ModelSettings,
  query: string,
  pauseMs = 2000,
): Promise<{ hits: Hit[]; failed: string }> {
  // the search engine turns a request away now and then, or answers with nothing (the first Research came back empty,
  // the same words worked a minute later): one more try after a short pause before calling it empty
  let failed = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const j = await web<{ results?: { title?: string; url?: string; snippet?: string }[] }>(settings, "search", {
        query,
      });
      failed = "";
      const hits = (j.results ?? [])
        .map((r) => ({ title: String(r.title ?? ""), url: String(r.url ?? ""), snippet: String(r.snippet ?? "") }))
        .filter((r) => /^https?:\/\//.test(r.url));
      if (hits.length) return { hits, failed };
    } catch (e) {
      failed = e instanceof Error && e.name === "TimeoutError" ? "it took too long" : "it didn't go through";
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, pauseMs));
  }
  return { hits: [], failed }; // no web this time: the work goes on with what kestrel knows
}

export const searchWeb = async (settings: ModelSettings, query: string, pauseMs = 2000): Promise<Hit[]> =>
  (await webSearch(settings, query, pauseMs)).hits;

// a page as plain text: links become their words, menus and short link lines go
export function readable(markdown: string, max = 8000): string {
  const text = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.split(/\s+/).length >= 4 || /\d/.test(l))
    .join("\n");
  const h = text.search(/^#{1,2} /m);
  return (h > 0 && h < text.length / 2 ? text.slice(h) : text).slice(0, max);
}

// The page reader opens the public web only. A link can come from a model or a scraped listing, and the door fetches
// from this computer: without this, a link could reach kestrel's own port, the home network or the tailnet.
// two lists: one list would match every IPv4 address against the IPv6 rule for IPv4-written-as-IPv6
const HOME4 = new BlockList();
const HOME6 = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // shared space: the tailnet's addresses
  ["127.0.0.0", 8], // this computer
  ["169.254.0.0", 16], // link-local
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // protocol assignments
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["224.0.0.0", 3], // multicast, reserved and broadcast
] as const)
  HOME4.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [
  ["::", 96], // unspecified, this computer (::1) and an IPv4 address written into IPv6 the old way
  ["::ffff:0:0", 96], // an IPv4 address written as IPv6
  ["::ffff:0:0:0", 96], // an IPv4 address translated to IPv6
  ["2002::", 16], // 6to4: an IPv4 address inside, long retired
  ["2001::", 32], // Teredo: an IPv4 address inside, long retired
  ["64:ff9b::", 96], // an IPv4 address behind NAT64
  ["fc00::", 7], // private
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
] as const)
  HOME6.addSubnet(net, bits, "ipv6");
// names that only ever mean this computer or a network of mine; a name without a dot is the local network's
const HOME_NAME = /(^|\.)(localhost|local|internal|lan|home\.arpa|ts\.net)$/i;

const atHome = (address: string): boolean => {
  const kind = isIP(address);
  return kind === 0 || (kind === 4 ? HOME4.check(address, "ipv4") : HOME6.check(address, "ipv6"));
};

// how the guard reaches the network: resolving a name, and asking a page whether it moved (tests pass their own)
export type Reach = {
  resolve: (host: string) => Promise<string[]>;
  head: (url: string) => Promise<{ status: number; location: string | null }>;
};
const NETWORK: Reach = {
  resolve: async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address),
  head: async (url) => {
    const res = await fetch(url, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(5000) });
    return { status: res.status, location: res.headers.get("location") };
  },
};
const HOPS = 5;

// one address, by its name and by every address the name resolves to
async function checkOne(url: string, reach: Reach): Promise<URL> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`${url.slice(0, 80)}: that link can't be read`);
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`${u.protocol} links can't be read`);
  const host = u.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const refused = new Error(`${u.host}: that address isn't on the public web`);
  if (isIP(host)) {
    if (atHome(host)) throw refused;
    return u;
  }
  if (!host.includes(".") || HOME_NAME.test(host)) throw refused;
  let addresses: string[] = [];
  try {
    addresses = await reach.resolve(host);
  } catch {
    addresses = [];
  }
  if (!addresses.length) throw new Error(`${u.host}: that name doesn't resolve`);
  if (addresses.some(atHome)) throw refused;
  return u;
}

// the link where its redirects end, each step checked; it throws, in words, when one isn't on the public web. A page
// that doesn't answer the HEAD is left to the door as it is (its address was checked). The limit: the door fetches
// and resolves on its own, so a site that redirects a GET but not a HEAD, or a name that resolves again to a home
// address, gets past this; only the door refusing home addresses closes that.
export async function publicUrl(url: string, reach: Reach = NETWORK): Promise<string> {
  let u = await checkOne(url, reach);
  for (let hop = 0; hop < HOPS; hop++) {
    let moved: { status: number; location: string | null };
    try {
      moved = await reach.head(u.href);
    } catch {
      break;
    }
    if (moved.status < 300 || moved.status >= 400 || !moved.location) break;
    u = await checkOne(new URL(moved.location, u).href, reach);
  }
  return u.href;
}

export async function fetchPage(settings: ModelSettings, url: string, max = 8000, reach?: Reach): Promise<string> {
  const j = await web<{ content?: string }>(settings, "fetch", { url: await publicUrl(url, reach) });
  return readable(String(j.content ?? ""), max);
}

export const hitsText = (hits: Hit[]) =>
  hits.map((h, i) => `[${i + 1}] ${h.title} — ${h.url}\n${h.snippet.slice(0, 300)}`).join("\n");

// ── Pages kestrel reads itself ───────────────────────────────────────────────────────────────────────────────────
// News reads its feeds, and Shopping its store and review pages, through one public fetch: the public-web guard on the
// address and on every hop of the GET, an honest user agent (a site that turns imitated browsers away answers a plain
// reader, and kestrel never imitates one), a time limit for the whole read and a size cap. The door's reader stays the
// fallback when kestrel can't read a page itself.

// how a read reaches the network; tests pass made-up ones (a Reach stand-in, a fetch that answers from fixtures).
// timeoutMs: the whole read's limit, the address check and its name lookup included (15 s; tests pass a short one)
export type PublicNet = { reach?: Reach; fetch?: typeof fetch; timeoutMs?: number };
export type Fetched =
  | { ok: true; status: number; url: string; text: string; headers: Headers; unchanged: boolean }
  | { ok: false; status: number; why: string };

export const READER_AGENT = "personal-feed-reader/1.0";
const PUBLIC_TIMEOUT_MS = 15_000;

// a page or feed from the public web: where its redirects end (each hop checked before it is asked), its words up to
// the cap (a bigger body is cut there; gzip bytes sent without their header are read too), or why it failed in a few
// plain words. A 304 is unchanged; any other answer outside 2xx is a failure with its status
export async function fetchPublic(
  url: string,
  opts: { accept?: string; agent?: string; maxBytes?: number; headers?: Record<string, string>; net?: PublicNet } = {},
): Promise<Fetched> {
  const net = opts.net ?? {};
  const get = net.fetch ?? fetch;
  const max = opts.maxBytes ?? 3_000_000;
  const deadline = AbortSignal.timeout(net.timeoutMs ?? PUBLIC_TIMEOUT_MS);
  let at = url;
  let res: Response | null = null;
  try {
    for (let hop = 0; hop < 3; hop++) {
      const checked = await inTime(publicUrl(at, net.reach), deadline);
      res = await get(checked, {
        redirect: "manual",
        signal: deadline,
        headers: { "user-agent": opts.agent ?? READER_AGENT, accept: opts.accept ?? "*/*", ...opts.headers },
      });
      const moved = res.headers.get("location");
      at = checked;
      if (res.status < 300 || res.status >= 400 || res.status === 304 || !moved) break;
      // a site that moves a GET but not a HEAD: the new address is checked like the first, before it is asked
      await res.body?.cancel().catch(() => {});
      at = new URL(moved, checked).href;
      res = null;
    }
    if (!res) return { ok: false, status: 0, why: "moved too many times" };
    if (res.status === 304) return { ok: true, status: 304, url: at, text: "", headers: res.headers, unchanged: true };
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return { ok: false, status: res.status, why: `answered ${res.status}` };
    }
    let bytes = await readCapped(res, max);
    // gzip bytes, though no header said so: some servers send them to a reader that didn't ask
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      try {
        bytes = gunzipSync(bytes, { finishFlush: constants.Z_SYNC_FLUSH, maxOutputLength: max * 3 });
      } catch {
        return { ok: false, status: res.status, why: "its gzip can't be read" };
      }
    }
    const text = new TextDecoder().decode(bytes).replace(/^﻿/, "");
    return { ok: true, status: res.status, url: at, text, headers: res.headers, unchanged: false };
  } catch (e) {
    return { ok: false, status: 0, why: failure(e) };
  }
}

// a promise that gives up when the deadline passes (the lookup inside publicUrl has no limit of its own)
function inTime<T>(p: Promise<T>, deadline: AbortSignal): Promise<T> {
  if (deadline.aborted) return Promise.reject(deadline.reason);
  return new Promise<T>((ok, no) => {
    const stop = () => no(deadline.reason);
    deadline.addEventListener("abort", stop, { once: true });
    p.then(ok, no).finally(() => deadline.removeEventListener("abort", stop));
  });
}

// a failure in a few plain words: never a stack, never a path
function failure(e: unknown): string {
  const err = e as Error & { cause?: { code?: string } };
  if (err?.name === "TimeoutError" || err?.name === "AbortError") return "timed out";
  const msg = String(err?.message ?? e);
  if (/isn't on the public web/.test(msg)) return "not on the public web";
  if (/doesn't resolve/.test(msg)) return "its name doesn't resolve";
  if (/can't be read/.test(msg)) return "its address can't be read";
  const code = err?.cause?.code;
  return code ? `the connection failed (${code})` : "the connection failed";
}

// the body up to the cap: a bigger one is cut there, and the reader keeps what came
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
  deg: "°",
  times: "×",
};

export function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, e: string) => {
    if (e[0] !== "#") return NAMED[e.toLowerCase()] ?? whole;
    const code = e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
    return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
  });
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

// what a page holds besides its words: scripts, styles, menus, forms and footers, dropped with their content
const CHROME = /<(script|style|noscript|svg|template|iframe|nav|footer|form|select|button)\b[\s\S]*?(?:<\/\1\s*>|$)/gi;
const BLOCK =
  /<\/?(p|div|section|article|main|header|aside|ul|ol|dl|dt|dd|blockquote|figure|figcaption|br|hr|tbody|thead)\b[^>]*>/gi;
// a model's or part's code: letters and digits together, three characters or more (R7-C, WH-1000XM6, S20)
const CODE = /\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9][A-Z0-9-]{2,}\b/;

// A page as the text the model reads and the quote check runs on: headings as "## " lines, list items as "- ", each
// table row as one line, its cells parted by " | ", the rest in paragraphs; scripts, styles, menus, forms and footers
// gone. A page longer than max is cut by whole sections (a heading and what follows it), never inside a table: the
// sections that hold a table or a product code come first, then the others in page order, and those kept read in page
// order. A best-of page puts its comparison table and later picks far down, where a cut from the top would lose them.
export function pageText(html: string, max = 20_000): string {
  const tables: string[] = [];
  let s = html.replace(/<!--[\s\S]*?(?:-->|$)/g, " ").replace(CHROME, " ");
  s = s.replace(/<table\b[\s\S]*?(?:<\/table\s*>|$)/gi, (table) => {
    const rows = [...table.matchAll(/<tr\b[\s\S]*?(?:<\/tr\s*>|(?=<tr\b)|$)/gi)]
      .map((r) =>
        [...r[0].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)(?:<\/t[hd]\s*>|(?=<t[hd]\b)|$)/gi)]
          .map((c) => asText(c[1]))
          .join(" | "),
      )
      .filter((r) => r.replace(/[\s|]/g, "") !== "");
    tables.push(rows.join("\n"));
    return `\n\n\uE000${tables.length - 1}\uE000\n\n`;
  });
  s = s
    .replace(/<h[1-6]\b[^>]*>/gi, "\n\n## ")
    .replace(/<\/h[1-6]\s*>/gi, "\n\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(BLOCK, "\n")
    .replace(/<[^>]*>?/g, " ");
  const lines = decode(s)
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .flatMap((l) => {
      const t = /^\uE000(\d+)\uE000$/.exec(l);
      return t ? (tables[Number(t[1])] ?? "").split("\n") : [l];
    })
    .filter((l) => l !== "" && l !== "##" && l !== "-");
  // sections: what comes before the first heading, then each heading with what follows it
  const sections: string[][] = [];
  for (const l of lines) {
    if (l.startsWith("## ") || !sections.length) sections.push([l]);
    else sections[sections.length - 1].push(l);
  }
  const whole = sections.map((sec) => sec.join("\n")).join("\n\n");
  if (whole.length <= max) return whole;
  const rich = (sec: string[]) => sec.some((l) => l.includes(" | ") || CODE.test(l));
  const order = [...sections.keys()].sort((a, b) => Number(rich(sections[b])) - Number(rich(sections[a])) || a - b);
  const kept = new Map<number, string>();
  let room = max;
  for (const i of order) {
    const text = sections[i].join("\n");
    if (text.length + 2 <= room) {
      kept.set(i, text);
      room -= text.length + 2;
    } else if (!kept.size) {
      // one section bigger than the whole room: its head, cut between lines and never inside a table
      const head: string[] = [];
      let size = 0;
      for (const l of sections[i]) {
        if (size + l.length + 1 > room) break;
        head.push(l);
        size += l.length + 1;
      }
      while (head.length && head[head.length - 1].includes(" | ") && sections[i][head.length]?.includes(" | "))
        head.pop();
      kept.set(i, head.join("\n"));
      room -= size + 2;
    }
  }
  return [...kept.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, t]) => t)
    .join("\n\n");
}
