// The import is idempotent: a second run lands nothing new, and a status changed in the old database flows in —
// the old setup is the authority until the cutover.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../src/db/migrate.ts";
import { importV1 } from "../src/domain/search/import-v1.ts";

function oldDb(base: string): string {
  const p = join(base, "old.db");
  const db = new DatabaseSync(p);
  db.exec(
    "CREATE TABLE job_listings (id TEXT, hunt TEXT, link TEXT, dedupe_key TEXT, status TEXT, found TEXT, data TEXT)",
  );
  const put = db.prepare("INSERT INTO job_listings VALUES (?, ?, ?, ?, ?, ?, ?)");
  put.run(
    "o1",
    "made-up-hunt",
    "https://example.com/1",
    "made co|engineer",
    "applied",
    "2026-11-01",
    JSON.stringify({
      source: "made-up-board",
      title: "Engineer",
      company: "Made Co",
      score: 61,
      match: "good",
      matchWhy: "fits",
      star: true,
    }),
  );
  put.run(
    "o2",
    "made-up-hunt",
    "https://example.com/2",
    "other co|clerk",
    "passed",
    "2026-11-02",
    JSON.stringify({
      source: "made-up-board",
      title: "Clerk",
      company: "Other Co",
      score: 20,
      match: "poor",
      matchWhy: "",
    }),
  );
  db.close();
  return p;
}

test("dry run counts without writing; write lands; a second run is all unchanged; a source change flows in", () => {
  const base = mkdtempSync(join(tmpdir(), "kestrel-import-"));
  const file = join(base, "t.db");
  const db = new DatabaseSync(file);
  migrate(db, file);
  const from = oldDb(base);
  const dry = importV1(db, from, false);
  assert.deepEqual(dry.landed, { new: 2, updated: 0, unchanged: 0 });
  assert.deepEqual(dry.kestrel, {}); // a dry run writes nothing
  const wet = importV1(db, from, true);
  assert.deepEqual(wet.landed, { new: 2, updated: 0, unchanged: 0 });
  assert.deepEqual(wet.kestrel, { applied: 1, passed: 1 });
  const again = importV1(db, from, true);
  assert.deepEqual(again.landed, { new: 0, updated: 0, unchanged: 2 });
  const old = new DatabaseSync(from);
  old.prepare("UPDATE job_listings SET status = 'interviewing' WHERE id = 'o1'").run();
  old.close();
  const synced = importV1(db, from, true);
  assert.deepEqual(synced.landed, { new: 0, updated: 1, unchanged: 1 });
  assert.deepEqual(synced.kestrel, { interviewing: 1, passed: 1 });
  const starred = db.prepare("SELECT starred FROM listings WHERE id = 'o1'").get() as { starred: number };
  assert.equal(starred.starred, 1); // the old star travels
});
