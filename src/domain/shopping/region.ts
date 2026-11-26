// The region kestrel buys in, and how far it trusts each source: data files, not code. A region file names its
// currency, its stores (read: page, or link for a store kestrel only links to, with the date of the test), brand
// stores kestrel may read, the rule each category tag asks for, price-history tools it links to, its model-code rules
// and its own testers. settings.json's shopping.region names it; the one that ships is the default. A new region is a
// new file.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { type Settings, shoppingOf } from "../../platform/config.ts";
import type { Place } from "./view.ts";

const HERE = fileURLToPath(new URL("./", import.meta.url));
const dated = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const Store = z.object({
  domain: z.string().min(3),
  name: z.string().min(1),
  groups: z.array(z.string()).default([]),
  read: z.enum(["page", "link"]),
  searchUrl: z.string().includes("{q}"),
  tested: dated.optional(),
  why: z.string().optional(),
  // who it matches and by how much it beats them, and the days it refunds its own later drop; each with when checked
  matches: z.object({ who: z.string(), beats: z.number().min(0).max(50).default(0), checked: dated }).optional(),
  protects: z.object({ days: z.number().int().min(1).max(120), checked: dated }).optional(),
});
export type Store = z.infer<typeof Store>;
const Host = z.object({
  host: z.string(),
  tier: z.enum(["A", "B", "C", "never"]),
  access: z.enum(["plain", "paywalled", "blocked"]).default("plain"),
  family: z.string().optional(),
  how: z.string().optional(),
});
export type Host = z.infer<typeof Host>;
export const Region = z.object({
  key: z.string(),
  name: z.string(),
  currency: z.string().length(3),
  searchWords: z.string().default(""),
  stores: z.array(Store),
  brandStores: z.record(z.string(), z.string()).default({}),
  tagRules: z.record(z.string(), z.string()).default({}),
  linkTools: z
    .array(z.object({ name: z.string(), url: z.string().includes("{q}"), groups: z.array(z.string()).default([]) }))
    .default([]),
  modelRules: z.array(z.object({ brand: z.string(), here: z.string(), elsewhere: z.array(z.string()) })).default([]),
  reviewSources: z.array(Host).default([]),
});
export type Region = z.infer<typeof Region>;

// the region settings name, else the one that ships; a file that doesn't read stops with its reason
export function loadRegion(settings?: Settings): Region {
  const files = readdirSync(`${HERE}regions`).filter((f) => f.endsWith(".json"));
  const want = settings ? shoppingOf(settings).region : undefined;
  const file = want ? `${want}.json` : files.length === 1 ? files[0] : "ca.json";
  if (!files.includes(file))
    throw new Error(`no region file for ${want ?? "the default"}: the regions are ${files.join(", ")}`);
  return Region.parse(JSON.parse(readFileSync(`${HERE}regions/${file}`, "utf8")));
}

// the source tiers: the file's, with the region's own testers added
export function loadHosts(region?: Region): Host[] {
  const file = `${HERE}sources.json`;
  const listed = existsSync(file)
    ? z.object({ hosts: z.array(Host) }).parse(JSON.parse(readFileSync(file, "utf8"))).hosts
    : [];
  return [...listed, ...(region?.reviewSources ?? [])];
}

export const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};
// a host's entry: its own, or its parent domain's (reviews.example.com under example.com)
export function hostEntry(hosts: Host[], url: string): Host | null {
  const h = hostOf(url);
  return hosts.find((x) => h === x.host || h.endsWith(`.${x.host}`)) ?? null;
}

// what the views need of the region: its currency and its stores' names
export function placeOf(region: Region): Place {
  return {
    currency: region.currency,
    storeName: (domain) => {
      const d = domain.replace(/^www\./, "");
      return region.stores.find((s) => d === s.domain || d.endsWith(`.${s.domain}`))?.name ?? d;
    },
  };
}
