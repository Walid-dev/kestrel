// The web, read from this computer through the model door's own tools: oMLX's search (DuckDuckGo, no account or key)
// and its page fetch. A deep check and Research use them, with search words from a listing or my question, never
// from a profile. The page fetch opens public addresses only (publicUrl, below).
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
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

export async function searchWeb(settings: ModelSettings, query: string, pauseMs = 2000): Promise<Hit[]> {
  // the search engine turns a request away now and then (the first Research came back empty, the same words worked
  // a minute later): one more try after a short pause before calling it empty
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const j = await web<{ results?: { title?: string; url?: string; snippet?: string }[] }>(settings, "search", {
        query,
      });
      const hits = (j.results ?? [])
        .map((r) => ({ title: String(r.title ?? ""), url: String(r.url ?? ""), snippet: String(r.snippet ?? "") }))
        .filter((r) => /^https?:\/\//.test(r.url));
      if (hits.length) return hits;
    } catch {
      // tried again below
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, pauseMs));
  }
  return []; // no web this time: the work goes on with what kestrel knows
}

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
  ["::", 127], // unspecified and this computer (::1)
  ["::ffff:0:0", 96], // an IPv4 address written as IPv6
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
// that doesn't answer the HEAD is left to the door as it is (its address was checked).
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
