// The listings: what a run keeps, deduplicated so a job seen twice updates its lastSeen and never double-lists —
// including right after the import. Priority is a rule, not a list of its own.
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
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
  return { ...base, priority: isPriority(base) };
};

// keep a run's items: a known dedupe or link updates lastSeen and the score; a new one lands as status new
export function keepItems(
  db: DatabaseSync,
  searchId: string,
  items: Item[],
  scoring: unknown, // ScoringShape reads it tolerantly
  now: Date,
  perRun = 200,
): { found: number; kept: number } {
  let kept = 0;
  const iso = now.toISOString();
  for (const item of items.slice(0, perRun)) {
    const scored: Score = scoreJob(scoring, item, now);
    const dedupe = normalizeDedupe(item.org, item.title);
    const have = db
      .prepare("SELECT id, data FROM listings WHERE (search = ? AND dedupe = ?) OR link = ?")
      .get(searchId, dedupe, item.url) as { id: string; data: string } | undefined;
    if (have) {
      const data = JSON.parse(have.data) as Record<string, unknown>;
      data.lastSeen = iso;
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
      `INSERT INTO listings (id, search, source, link, dedupe, status, starred, found, updated, score, match, data)
       VALUES (?, ?, ?, ?, ?, 'new', NULL, ?, ?, ?, ?, ?)`,
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
      JSON.stringify({ ...item, why: scored.why, parts: scored.parts, lastSeen: iso }),
    );
    kept++;
  }
  return { found: items.length, kept };
}

export type ListingFilters = {
  status?: string;
  match?: string;
  source?: string;
  priority?: boolean;
  q?: string;
};

export function listListings(db: DatabaseSync, filters: ListingFilters = {}, limit = 500): ListingRow[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filters.status) {
    where.push("status = ?");
    params.push(filters.status);
  }
  if (filters.match) {
    where.push("match = ?");
    params.push(filters.match);
  }
  if (filters.source) {
    where.push("source = ?");
    params.push(filters.source);
  }
  const rows = db
    .prepare(`SELECT * FROM listings ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY found DESC LIMIT ?`)
    .all(...params, limit) as Record<string, unknown>[];
  let out = rows.map(row);
  if (filters.priority) out = out.filter((r) => r.priority);
  if (filters.q) {
    const q = filters.q.toLowerCase();
    out = out.filter((r) => JSON.stringify(r.data).toLowerCase().includes(q));
  }
  return out;
}

export function setListingStatus(db: DatabaseSync, id: string, status: string): void {
  db.prepare("UPDATE listings SET status = ?, updated = ? WHERE id = ?").run(status, new Date().toISOString(), id);
}

export function setListingStar(db: DatabaseSync, id: string, starred: number | null): void {
  db.prepare("UPDATE listings SET starred = ?, updated = ? WHERE id = ?").run(starred, new Date().toISOString(), id);
}
