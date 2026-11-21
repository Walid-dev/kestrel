// The one import from the old setup: idempotent and re-runnable — the old database stays the authority for statuses
// and stars until the cutover, so running it again refreshes them and never double-lists. Dry by default, printing
// counts that must match; --write lands them. Run: node scripts/import-v1.ts --from <old hunts.db> [--write]

import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";
import { openDb } from "../src/db/db.ts";
import { migrate } from "../src/db/migrate.ts";
import { dataDir } from "../src/platform/paths.ts";

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

if (process.argv[1]?.endsWith("import-v1.ts")) {
  const { values } = parseArgs({ options: { from: { type: "string" }, write: { type: "boolean", default: false } } });
  if (!values.from) {
    console.error("import-v1: --from <the old hunts.db> [--write]");
    process.exit(2);
  }
  const file = join(dataDir(), "kestrel.db");
  const db = openDb(file);
  migrate(db, file);
  const counts = importV1(db, values.from, values.write);
  console.log(values.write ? "written:" : "dry run (nothing written):");
  console.log("  the old database by status:", JSON.stringify(counts.source));
  console.log(`  the old database: ${counts.sourceStarred} starred, ${counts.sourceScored} scored`);
  console.log("  would land / landed:", JSON.stringify(counts.landed));
  console.log("  kestrel by status:", JSON.stringify(counts.kestrel));
  console.log(`  kestrel: ${counts.kestrelStarred} starred, ${counts.kestrelScored} scored`);
}
