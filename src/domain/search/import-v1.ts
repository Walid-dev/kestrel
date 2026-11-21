// The import from the old setup, idempotent: the old database stays the authority for statuses and stars until the
// cutover, so re-running refreshes and never double-lists. The nightly mirror runs this during the side-by-side
// week; scripts/import-v1.ts is the by-hand door.
import { DatabaseSync } from "node:sqlite";
import { normalizeDedupe } from "./listings.ts";

type OldRow = {
  id: string;
  hunt: string;
  link: string;
  dedupe_key: string;
  status: string;
  found: string;
  data: string;
};

export type ImportCounts = {
  source: Record<string, number>; // the old database's rows by status
  sourceStarred: number;
  sourceScored: number;
  landed: { new: number; updated: number; unchanged: number };
  deals: { source: Record<string, number>; landed: { new: number; updated: number; unchanged: number } };
  kestrel: Record<string, number>; // kestrel's rows by status after (or as-if, on a dry run)
  kestrelStarred: number;
  kestrelScored: number;
};

// the old deal vocabulary onto the one status set: an outreach is applied, a no is passed, gone is closed
const DEAL_STATUS: Record<string, string> = {
  new: "new",
  interested: "interested",
  maybe: "maybe",
  contacted: "applied",
  not: "passed",
  sold: "closed",
};

type OldDeal = {
  id: string;
  spec: string;
  source: string;
  url: string;
  title: string;
  org: string | null;
  price: number | null;
  location: string | null;
  posted: string | null;
  first_seen: string;
  last_seen: string | null;
  score: number | null;
  status: string | null;
  my_note: string | null;
  fit_reason: string | null;
  twin_of: string | null;
};

// The old deals live in items, each tied through its run to the spec that found it. Scores there run 0–10.
function importDeals(db: DatabaseSync, old: DatabaseSync, write: boolean): ImportCounts["deals"] {
  const counts: ImportCounts["deals"] = { source: {}, landed: { new: 0, updated: 0, unchanged: 0 } };
  let rows: OldDeal[];
  try {
    rows = old
      .prepare(
        `SELECT i.id, r.spec, i.source, i.url, i.title, i.org, i.price, i.location, i.posted, i.first_seen,
                i.last_seen, i.score, i.status, i.my_note, i.fit_reason, i.twin_of
         FROM items i JOIN runs r ON r.run_id = i.run_id`,
      )
      .all() as OldDeal[];
  } catch {
    return counts; // an old database without deal tables simply has none to carry
  }
  const get = db.prepare("SELECT id, status, score FROM listings WHERE id = ? OR (search = ? AND link = ?)");
  const insert = db.prepare(
    `INSERT INTO listings (id, search, source, link, dedupe, status, starred, found, updated, score, match, data)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
  );
  const update = db.prepare("UPDATE listings SET status = ?, score = ?, match = ?, data = ?, updated = ? WHERE id = ?");
  for (const r of rows) {
    const status = DEAL_STATUS[r.status ?? "new"] ?? "new";
    counts.source[status] = (counts.source[status] ?? 0) + 1;
    const score = r.score === null ? null : Math.round(r.score * 10); // the old 0–10 onto the 0–100 card
    const match = score === null ? "" : score >= 80 ? "great" : score >= 60 ? "good" : score >= 40 ? "weak" : "poor";
    const data = JSON.stringify({
      source: r.source,
      title: r.title,
      org: r.org ?? "",
      location: r.location ?? "",
      posted: r.posted ?? "",
      price: r.price,
      why: r.fit_reason ?? "",
      note: r.my_note ?? "",
      twin: r.twin_of ?? "",
    });
    const updatedAt = r.last_seen ?? r.first_seen;
    const have = get.get(r.id, r.spec, r.url) as { id: string; status: string; score: number | null } | undefined;
    if (!have) {
      counts.landed.new++;
      if (write)
        insert.run(
          r.id,
          r.spec,
          r.source,
          r.url,
          normalizeDedupe(r.org ?? "", r.title),
          status,
          r.first_seen,
          updatedAt,
          score,
          match,
          data,
        );
      continue;
    }
    if (have.status === status && have.score === score) {
      counts.landed.unchanged++;
      continue;
    }
    counts.landed.updated++; // the old setup stays the authority until the cutover
    if (write) update.run(status, score, match, data, updatedAt, have.id);
  }
  return counts;
}

export function importV1(db: DatabaseSync, from: string, write: boolean): ImportCounts {
  const old = new DatabaseSync(from, { readOnly: true });
  const rows = old
    .prepare("SELECT id, hunt, link, dedupe_key, status, found, data FROM job_listings")
    .all() as OldRow[];
  const source: Record<string, number> = {};
  let sourceStarred = 0;
  let sourceScored = 0;
  const landed = { new: 0, updated: 0, unchanged: 0 };
  const get = db.prepare(
    "SELECT id, status, starred, score FROM listings WHERE id = ? OR (search = ? AND dedupe = ?) OR link = ?",
  );
  const insert = db.prepare(
    `INSERT INTO listings (id, search, source, link, dedupe, status, starred, found, updated, score, match, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const update = db.prepare(
    "UPDATE listings SET status = ?, starred = ?, score = ?, match = ?, data = ?, updated = ? WHERE id = ?",
  );
  for (const r of rows) {
    source[r.status] = (source[r.status] ?? 0) + 1;
    const data = JSON.parse(r.data) as Record<string, unknown>;
    const starred = data.star === true ? 1 : data.star === false ? 0 : null;
    if (starred === 1) sourceStarred++;
    const score = typeof data.score === "number" ? Math.round(data.score) : null;
    if (score !== null) sourceScored++;
    const match = String(data.match ?? "");
    const updatedAt = String(data.lastSeen ?? r.found);
    const have = get.get(r.id, r.hunt, r.dedupe_key, r.link) as
      | { id: string; status: string; starred: number | null; score: number | null }
      | undefined;
    if (!have) {
      landed.new++;
      if (write)
        insert.run(
          r.id,
          r.hunt,
          String(data.source ?? "unknown"),
          r.link,
          r.dedupe_key,
          r.status,
          starred,
          r.found,
          updatedAt,
          score,
          match,
          JSON.stringify({ ...data, why: data.matchWhy ?? "" }),
        );
      continue;
    }
    const same = have.status === r.status && have.starred === starred && have.score === score;
    if (same) {
      landed.unchanged++;
      continue;
    }
    landed.updated++; // the old setup stays the authority for status and star until the cutover
    if (write)
      update.run(
        r.status,
        starred,
        score,
        match,
        JSON.stringify({ ...data, why: data.matchWhy ?? "" }),
        updatedAt,
        have.id,
      );
  }
  const deals = importDeals(db, old, write);
  old.close();
  const kestrel: Record<string, number> = {};
  const after = db.prepare("SELECT status, COUNT(*) AS n FROM listings GROUP BY status").all() as {
    status: string;
    n: number;
  }[];
  for (const row of after) kestrel[row.status] = row.n;
  const starredRow = db.prepare("SELECT COUNT(*) AS n FROM listings WHERE starred = 1").get() as { n: number };
  const scoredRow = db.prepare("SELECT COUNT(*) AS n FROM listings WHERE score IS NOT NULL").get() as { n: number };
  return {
    source,
    sourceStarred,
    sourceScored,
    landed,
    deals,
    kestrel,
    kestrelStarred: starredRow.n,
    kestrelScored: scoredRow.n,
  };
}
