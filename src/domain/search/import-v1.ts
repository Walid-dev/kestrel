// The import from the old setup, idempotent: the old database stays the authority for statuses and stars until the
// cutover, so re-running refreshes and never double-lists. The nightly mirror runs this during the side-by-side
// week; scripts/import-v1.ts is the by-hand door.
import { DatabaseSync } from "node:sqlite";

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
  kestrel: Record<string, number>; // kestrel's rows by status after (or as-if, on a dry run)
  kestrelStarred: number;
  kestrelScored: number;
};

export function importV1(db: DatabaseSync, from: string, write: boolean): ImportCounts {
  const old = new DatabaseSync(from, { readOnly: true });
  const rows = old
    .prepare("SELECT id, hunt, link, dedupe_key, status, found, data FROM job_listings")
    .all() as OldRow[];
  old.close();
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
    kestrel,
    kestrelStarred: starredRow.n,
    kestrelScored: scoredRow.n,
  };
}
