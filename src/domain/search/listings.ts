// The listings: what a run keeps, deduplicated so a job seen twice updates its lastSeen and never double-lists —
// including right after the import. Priority is a rule, not a list of its own.
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { Refused } from "../notes/documents.ts";
import type { Item } from "./collect.ts";
import { leftOutOf, outsideOf, type Score, scoreJob } from "./score.ts";

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
  leftOut: string | null; // why the rules set it aside, while they do (LEFT): the card says it in its head
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
  return {
    ...base,
    kind: r.kind === "deals" ? "deals" : "jobs",
    priority: isPriority(base),
    leftOut: r.left_out ? String(base.data.leftOut) : null, // the query's own LEFT (COLUMNS), never a second rule
  };
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
    // the rules set some aside until I mark them (score.ts says which)
    const leftOut = leftOutOf(kind, scoring, item, scored, now);
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
      data.leftOut = leftOut;
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
        leftOut,
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
  todo?: boolean; // left to do: a review view hides a job with an application (any state) or applied already
  q?: string;
  search?: string;
  group?: string; // a job's family (Full-stack, AI engineering) or a deal's category (the model)
  // the old hunt page's stages: review (new, a great or good match), possible (new, a weaker one), leftout (new, set
  // aside by the rules until I mark or note it), priority, all (every listing, the left out ones too), or a status
  stage?: string;
  sort?: "best" | "newest" | "money";
};

// a listing's hunt: the one its search belongs to, else its search
const HUNT = "COALESCE(NULLIF(json_extract(data, '$.hunt'), ''), search)";
const GROUP = "COALESCE(NULLIF(json_extract(data, '$.family'), ''), NULLIF(json_extract(data, '$.category'), ''), '')";
const PRIORITY = "(starred = 1 OR (starred IS NULL AND match = 'great' AND status NOT IN ('passed', 'fake')))";
// left out: new, set aside by the rules (a weak match, pay far below the floor, a removed search, an old ad) and not
// yet marked or noted — the old page's "Left out", kept out of every view but its own and All
export const LEFT = `(status = 'new' AND json_extract(data, '$.leftOut') IS NOT NULL AND json_extract(data, '$.leftOut') NOT IN (0, '') AND COALESCE(json_extract(data, '$.note'), '') = '')`;
// every column, and whether LEFT holds: a card set aside says why from this, so it can't disagree with the views
const COLUMNS = `*, ${LEFT} AS left_out`;
// left to do: no application for it (queued, at work, sent or not sent) and not applied or further; it narrows the
// review views only, so All and a status view (Applied, Not for me…) still show all of their own
const TODO = `(status NOT IN ('applied', 'interviewing', 'offer') AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.listing = listings.id OR a.link = listings.link))`;
const TODO_STAGES = new Set(["review", "possible", "priority", "leftout"]);
const STAGE: Record<string, string> = {
  review: `(status = 'new' AND match IN ('great', 'good') AND NOT ${LEFT})`,
  possible: `(status = 'new' AND match NOT IN ('great', 'good') AND NOT ${LEFT})`,
  leftout: LEFT,
  priority: `(${PRIORITY} AND NOT ${LEFT})`,
  all: "1 = 1", // every listing of the hunt, whatever its status, the left out ones too: a left-out card says why
};

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
    w.push("lower(source) = lower(?)");
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
  if (on("stage")) {
    const s = String(filters.stage);
    if (STAGE[s]) {
      w.push(STAGE[s]);
      if (filters.todo && TODO_STAGES.has(s)) w.push(TODO);
    } else {
      w.push(`status = ? AND NOT ${LEFT}`);
      params.push(s);
    }
  }
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
  const rows = db
    .prepare(`SELECT ${COLUMNS} FROM listings ${sql} ORDER BY ${order} LIMIT ?`)
    .all(...params, limit) as Record<string, unknown>[];
  return rows.map(row);
}

export function getListing(db: DatabaseSync, id: string): ListingRow | null {
  const r = db.prepare(`SELECT ${COLUMNS} FROM listings WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
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
  const stageCount = (s: string) => {
    const { sql, params } = where({ ...filters, stage: s }, ["status", "priority"]);
    return (db.prepare(`SELECT COUNT(*) AS n FROM listings ${sql}`).get(...params) as { n: number }).n;
  };
  const stages: Record<string, number> = {};
  for (const s of ["priority", "review", "possible", "leftout", "all"]) stages[s] = stageCount(s);
  const byStatus = (() => {
    const { sql, params } = where({ ...filters, stage: "all" }, ["status", "priority", "stage"]);
    const scoped = sql ? `${sql} AND NOT ${LEFT}` : `WHERE NOT ${LEFT}`;
    return Object.fromEntries(
      (
        db.prepare(`SELECT status AS k, COUNT(*) AS n FROM listings ${scoped} GROUP BY k`).all(...params) as {
          k: string;
          n: number;
        }[]
      ).map((r) => [r.k, r.n]),
    ) as Record<string, number>;
  })();
  return {
    stages: { ...byStatus, ...stages },
    status: count("status", ["status", "priority"]),
    priority,
    all: (db.prepare(`SELECT COUNT(*) AS n FROM listings ${all.sql}`).get(...all.params) as { n: number }).n,
    match: count("match", ["match"]),
    group: count(GROUP, ["group"]),
    source: count("lower(source)", ["source"]),
  };
}

// the hunts, for the tabs: each with its kind, name, count and searches
// each hunt with its listings' count and searches; old: the old setup's key for a deal hunt the mirror brings (the
// import keeps it on each deal it carries, import-v1.ts), so Search now can ask the old setup for it
export type HuntRow = { key: string; kind: "jobs" | "deals"; count: number; searches: string[]; old: string | null };
export function listHunts(db: DatabaseSync): HuntRow[] {
  const rows = db
    .prepare(
      `SELECT kind, ${HUNT} AS hunt, search, COUNT(*) AS n, MAX(NULLIF(json_extract(data, '$.oldHunt'), '')) AS old
       FROM listings GROUP BY kind, hunt, search ORDER BY kind, hunt`,
    )
    .all() as { kind: "jobs" | "deals"; hunt: string; search: string; n: number; old: string | null }[];
  const out = new Map<string, HuntRow>();
  for (const r of rows) {
    const k = `${r.kind}:${r.hunt}`;
    const h = out.get(k) ?? { key: r.hunt, kind: r.kind, count: 0, searches: [], old: null };
    h.count += r.n;
    h.searches.push(r.search);
    h.old ??= r.kind === "deals" ? r.old : null;
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

// a search's scoring changed: every listing kestrel scored for it is scored again (the old setup's own scores stay
// as they came); answers how many moved
export function rescoreSearch(
  db: DatabaseSync,
  searchId: string,
  scoring: unknown,
  kind: "jobs" | "deals",
  now: Date,
): number {
  const rows = db
    .prepare("SELECT id, data FROM listings WHERE search = ? AND json_extract(data, '$.parts') IS NOT NULL")
    .all(searchId) as {
    id: string;
    data: string;
  }[];
  const put = db.prepare("UPDATE listings SET score = ?, match = ?, data = ? WHERE id = ?");
  for (const r of rows) {
    const data = JSON.parse(r.data) as Record<string, unknown>;
    const scored = scoreJob(scoring, data as unknown as Item, now);
    const leftOut = leftOutOf(kind, scoring, data as unknown as Item, scored, now);
    put.run(
      scored.score,
      scored.match,
      JSON.stringify({ ...data, why: scored.why, parts: scored.parts, leftOut }),
      r.id,
    );
  }
  // the old setup's own jobs keep their scores, but one open only where I can't work is set aside among them too (and
  // back in view when the places change)
  let carried = 0;
  if (kind === "jobs") {
    const old = db
      .prepare("SELECT id, data FROM listings WHERE search = ? AND json_extract(data, '$.parts') IS NULL")
      .all(searchId) as { id: string; data: string }[];
    const set = db.prepare("UPDATE listings SET data = ? WHERE id = ?");
    for (const r of old) {
      const data = JSON.parse(r.data) as Record<string, unknown>;
      const was = String(data.leftOut ?? "");
      const ours = was.startsWith("not open in ");
      if (was && !ours) continue; // the old setup's own reason stays
      const outside = outsideOf(scoring, data as unknown as Item) ?? "";
      if (outside === was) continue;
      if (outside) data.leftOut = outside;
      else delete data.leftOut;
      set.run(JSON.stringify(data), r.id);
      carried++;
    }
  }
  return rows.length + carried;
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

// a status as the page's buttons say it, a job's or a deal's
export function statusWord(status: string, kind: "jobs" | "deals"): string {
  const deal = kind === "deals";
  return (
    {
      new: "Back to review",
      interested: "Interested",
      passed: deal ? "Not interested" : "Not for me",
      maybe: "Not sure",
      applied: deal ? "Contacted" : "Applied",
      interviewing: "Interviewing",
      offer: "Offer",
      rejected: "Rejected",
      fake: "Not real",
      closed: deal ? "Sold" : "Closed",
    }[status] ?? status
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
