// The listings: what a run keeps, deduplicated so a job seen twice updates its lastSeen and never double-lists —
// including right after the import. Priority is a rule, not a list of its own.
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { Refused } from "../notes/documents.ts";
import type { Item } from "./collect.ts";
import { type Score, scoreJob } from "./score.ts";

export type ListingRow = {
  id: string;
  search: string;
  source: string;
  link: string;
  dedupe: string;
  status: string;
  starred: number | null;
  found: string;
  updated: string;
  score: number | null;
  match: string;
  data: Record<string, unknown>;
  kind: "jobs" | "deals";
  priority: boolean;
};

export const normalizeDedupe = (org: string, title: string) =>
  `${org}|${title}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}| ]+/gu, "")
    .replace(/\s+/g, " ")
    .trim();

// in Priority: starred by hand, or an automatic great match that isn't set aside or fake
export const isPriority = (r: { starred: number | null; match: string; status: string }): boolean =>
  r.starred === 1 || (r.starred === null && r.match === "great" && !["passed", "fake"].includes(r.status));

const row = (r: Record<string, unknown>): ListingRow => {
  const base = {
    id: String(r.id),
    search: String(r.search),
    source: String(r.source),
    link: String(r.link),
    dedupe: String(r.dedupe),
    status: String(r.status),
    starred: r.starred === null ? null : Number(r.starred),
    found: String(r.found),
    updated: String(r.updated),
    score: r.score === null ? null : Number(r.score),
    match: String(r.match),
    data: JSON.parse(String(r.data)) as Record<string, unknown>,
  };
  return { ...base, kind: r.kind === "deals" ? "deals" : "jobs", priority: isPriority(base) };
};

// keep a run's items: a known dedupe or link updates lastSeen and the score; a new one lands as status new
export function keepItems(
  db: DatabaseSync,
  searchId: string,
  items: Item[],
  scoring: unknown, // ScoringShape reads it tolerantly
  now: Date,
  perRun = 200,
  kind: "jobs" | "deals" = "jobs",
  group: { hunt: string; category: string } = { hunt: "", category: "" },
): { found: number; kept: number } {
  let kept = 0;
  const iso = now.toISOString();
  for (const item of items.slice(0, perRun)) {
    const scored: Score = scoreJob(scoring, item, now);
    // a job reposted under a new link is the same job (org|title); a deal is its link — two
    // same-titled chairs from sellers with no name are two chairs
    const dedupe = kind === "deals" ? item.url : normalizeDedupe(item.org, item.title);
    // the lookup stays inside this search: another search's row keeps its own spec's score (the sweep's finding —
    // the first live run had re-scored imported rows that belonged to the old hunts)
    const have = db
      .prepare("SELECT id, data FROM listings WHERE search = ? AND (dedupe = ? OR link = ?)")
      .get(searchId, dedupe, item.url) as { id: string; data: string } | undefined;
    if (have) {
      const data = JSON.parse(have.data) as Record<string, unknown>;
      data.lastSeen = iso;
      // a deal's price over time: a change is kept, so the card can show the drop
      if (kind === "deals" && item.price != null && item.price !== data.price) {
        const prices = Array.isArray(data.prices) ? (data.prices as unknown[]) : [];
        data.prices = [...prices, { at: iso, price: item.price }];
        data.price = item.price;
      }
      db.prepare("UPDATE listings SET updated = ?, score = ?, match = ?, data = ? WHERE id = ?").run(
        iso,
        scored.score,
        scored.match,
        JSON.stringify(data),
        have.id,
      );
      continue;
    }
    db.prepare(
      `INSERT INTO listings (id, search, source, link, dedupe, status, starred, found, updated, score, match, data, kind)
       VALUES (?, ?, ?, ?, ?, 'new', NULL, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      searchId,
      item.source,
      item.url,
      dedupe,
      iso,
      iso,
      scored.score,
      scored.match,
      JSON.stringify({
        ...item,
        kind,
        hunt: group.hunt,
        category: group.category,
        prices: kind === "deals" && item.price != null ? [{ at: iso, price: item.price }] : [],
        why: scored.why,
        parts: scored.parts,
        lastSeen: iso,
      }),
      kind,
    );
    kept++;
  }
  return { found: items.length, kept };
}

export type ListingFilters = {
  kind?: "jobs" | "deals";
  hunt?: string; // a hunt groups searches: a deal hunt across sites and models, a job spec on its own
  status?: string;
  match?: string;
  source?: string;
  priority?: boolean;
  q?: string;
  search?: string;
  group?: string; // a job's family (Full-stack, AI engineering) or a deal's category (the model)
  sort?: "best" | "newest" | "money";
};

// a listing's hunt: the one its search belongs to, else its search
const HUNT = "COALESCE(NULLIF(json_extract(data, '$.hunt'), ''), search)";
const GROUP = "COALESCE(NULLIF(json_extract(data, '$.family'), ''), NULLIF(json_extract(data, '$.category'), ''), '')";
const PRIORITY = "(starred = 1 OR (starred IS NULL AND match = 'great' AND status NOT IN ('passed', 'fake')))";

// the filters as SQL, all of them before the limit — an old starred listing must never fall off the Priority view
function where(filters: ListingFilters, skip: (keyof ListingFilters)[] = []): { sql: string; params: string[] } {
  const w: string[] = [];
  const params: string[] = [];
  const on = (k: keyof ListingFilters) => filters[k] !== undefined && filters[k] !== "" && !skip.includes(k);
  if (on("kind")) {
    w.push("kind = ?");
    params.push(String(filters.kind));
  }
  if (on("hunt")) {
    w.push(`${HUNT} = ?`);
    params.push(String(filters.hunt));
  }
  if (on("status")) {
    w.push("status = ?");
    params.push(String(filters.status));
  }
  if (on("match")) {
    w.push("match = ?");
    params.push(String(filters.match));
  }
  if (on("source")) {
    w.push("source = ?");
    params.push(String(filters.source));
  }
  if (on("search")) {
    w.push("search = ?");
    params.push(String(filters.search));
  }
  if (on("group")) {
    w.push(`${GROUP} = ?`);
    params.push(String(filters.group));
  }
  if (filters.priority && !skip.includes("priority")) w.push(PRIORITY);
  if (on("q")) {
    w.push("lower(data) LIKE ?");
    params.push(`%${String(filters.q).toLowerCase().replaceAll("%", "").replaceAll("_", " ")}%`);
  }
  return { sql: w.length ? `WHERE ${w.join(" AND ")}` : "", params };
}

export function listListings(db: DatabaseSync, filters: ListingFilters = {}, limit = 500): ListingRow[] {
  const { sql, params } = where(filters);
  const order =
    filters.sort === "newest"
      ? "found DESC"
      : filters.sort === "money"
        ? filters.kind === "deals"
          ? "CAST(json_extract(data, '$.price') AS REAL) ASC NULLS LAST"
          : "CAST(COALESCE(json_extract(data, '$.salaryMax'), json_extract(data, '$.salaryMin')) AS REAL) DESC NULLS LAST"
        : filters.sort === "best"
          ? "COALESCE(score, -1) DESC, found DESC"
          : "found DESC";
  const rows = db.prepare(`SELECT * FROM listings ${sql} ORDER BY ${order} LIMIT ?`).all(...params, limit) as Record<
    string,
    unknown
  >[];
  return rows.map(row);
}

export function getListing(db: DatabaseSync, id: string): ListingRow | null {
  const r = db.prepare("SELECT * FROM listings WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? row(r) : null;
}

// the counts a hunt's toolbar shows: each stage, Priority, each match, each group, each source — every count
// under the other filters, so a pill says how many it would show
export function listingCounts(db: DatabaseSync, filters: ListingFilters) {
  const count = (by: string, skip: (keyof ListingFilters)[]) => {
    const { sql, params } = where(filters, skip);
    return Object.fromEntries(
      (
        db.prepare(`SELECT ${by} AS k, COUNT(*) AS n FROM listings ${sql} GROUP BY k`).all(...params) as {
          k: string;
          n: number;
        }[]
      ).map((r) => [r.k ?? "", r.n]),
    ) as Record<string, number>;
  };
  const scope = (skip: (keyof ListingFilters)[]) => {
    const { sql, params } = where(filters, skip);
    return { sql, params };
  };
  const pri = scope(["status", "priority"]);
  const priority = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM listings ${pri.sql ? `${pri.sql} AND` : "WHERE"} ${PRIORITY}`)
      .get(...pri.params) as { n: number }
  ).n;
  const all = scope(["status", "priority"]);
  return {
    status: count("status", ["status", "priority"]),
    priority,
    all: (db.prepare(`SELECT COUNT(*) AS n FROM listings ${all.sql}`).get(...all.params) as { n: number }).n,
    match: count("match", ["match"]),
    group: count(GROUP, ["group"]),
    source: count("source", ["source"]),
  };
}

// the hunts, for the tabs: each with its kind, name, count and searches
export function listHunts(
  db: DatabaseSync,
): { key: string; kind: "jobs" | "deals"; count: number; searches: string[] }[] {
  const rows = db
    .prepare(
      `SELECT kind, ${HUNT} AS hunt, search, COUNT(*) AS n FROM listings GROUP BY kind, hunt, search ORDER BY kind, hunt`,
    )
    .all() as { kind: "jobs" | "deals"; hunt: string; search: string; n: number }[];
  const out = new Map<string, { key: string; kind: "jobs" | "deals"; count: number; searches: string[] }>();
  for (const r of rows) {
    const k = `${r.kind}:${r.hunt}`;
    const h = out.get(k) ?? { key: r.hunt, kind: r.kind, count: 0, searches: [] };
    h.count += r.n;
    h.searches.push(r.search);
    out.set(k, h);
  }
  return [...out.values()];
}

// what a deal usually asks: the price spread of every listing in its category, so a card can say "59% of the usual"
export function usualPrices(
  db: DatabaseSync,
  hunt?: string,
): Map<string, { median: number; p25: number; p75: number; n: number }> {
  const rows = db
    .prepare(
      `SELECT COALESCE(NULLIF(json_extract(data, '$.category'), ''), search) AS cat,
              CAST(json_extract(data, '$.price') AS REAL) AS price
       FROM listings WHERE kind = 'deals' AND json_extract(data, '$.price') IS NOT NULL ${hunt ? `AND ${HUNT} = ?` : ""}`,
    )
    .all(...(hunt ? [hunt] : [])) as { cat: string; price: number }[];
  const by = new Map<string, number[]>();
  for (const r of rows) if (r.price > 0) by.set(r.cat, [...(by.get(r.cat) ?? []), r.price]);
  const out = new Map<string, { median: number; p25: number; p75: number; n: number }>();
  for (const [cat, list] of by) {
    if (list.length < 3) continue; // three asking prices at least, or no "usual" is claimed
    const s = [...list].sort((a, b) => a - b);
    const q = (f: number) => s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * f)))];
    out.set(cat, { median: q(0.5), p25: q(0.25), p75: q(0.75), n: s.length });
  }
  return out;
}

export function setListingNote(db: DatabaseSync, id: string, note: string): void {
  const r = db.prepare("SELECT data FROM listings WHERE id = ?").get(id) as { data: string } | undefined;
  if (!r) throw new Refused("no such listing");
  const data = JSON.parse(r.data) as Record<string, unknown>;
  data.note = note.trim().slice(0, 2000);
  db.prepare("UPDATE listings SET data = ?, updated = ? WHERE id = ?").run(
    JSON.stringify(data),
    new Date().toISOString(),
    id,
  );
}

export function setListingStatus(db: DatabaseSync, id: string, status: string): void {
  const got = db
    .prepare("UPDATE listings SET status = ?, updated = ? WHERE id = ?")
    .run(status, new Date().toISOString(), id);
  if (got.changes === 0) throw new Refused("no such listing");
}

export function setListingStar(db: DatabaseSync, id: string, starred: number | null): void {
  const got = db
    .prepare("UPDATE listings SET starred = ?, updated = ? WHERE id = ?")
    .run(starred, new Date().toISOString(), id);
  if (got.changes === 0) throw new Refused("no such listing");
}
