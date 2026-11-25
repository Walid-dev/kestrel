// A failed import closes the old database it opened: the mirror retries, and each try must not leave one more file
// open. A deal the mirror carries keeps its old hunt's key, so Search now can name it there. Made-up old databases.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../../db/migrate.ts";
import { importV1 } from "./import-v1.ts";
import { listHunts } from "./listings.ts";

test("a failed import leaves no handle to the old database open (review)", () => {
  const base = mkdtempSync(join(tmpdir(), "kestrel-import-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  const old = join(base, "old.db");
  const made = new DatabaseSync(old);
  made.exec("CREATE TABLE something_else (id TEXT)"); // no job_listings: the import fails
  made.close();
  const open = () => readdirSync("/dev/fd").length;
  const before = open();
  for (let i = 0; i < 5; i++) assert.throws(() => importV1(db, old, true), /no such table/);
  assert.equal(open(), before);
});

test("a deal hunt the mirror brings knows its key in the old setup: its hunt: line, lowercased", () => {
  const base = mkdtempSync(join(tmpdir(), "kestrel-import-key-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  const old = join(base, "old.db");
  const made = new DatabaseSync(old);
  made.exec(
    `CREATE TABLE job_listings (id TEXT, hunt TEXT, link TEXT, dedupe_key TEXT, status TEXT, found TEXT, data TEXT);
     CREATE TABLE items (id INTEGER, run_id TEXT, source TEXT, url TEXT, title TEXT, org TEXT, price REAL,
       location TEXT, posted TEXT, first_seen TEXT, last_seen TEXT, score REAL, status TEXT, my_note TEXT, fit REAL,
       fit_reason TEXT, twin_of TEXT);
     CREATE TABLE runs (run_id TEXT, spec TEXT, started TEXT);
     INSERT INTO runs VALUES ('r1', 'made-up-chair-site', '2026-11-20'), ('r2', 'made-up-lamp-site', '2026-11-20');
     INSERT INTO items (id, run_id, source, url, title, price, first_seen) VALUES
       (1, 'r1', 'made-up-market', 'https://example.com/a/1', 'A made-up chair', 90, '2026-11-20'),
       (2, 'r2', 'made-up-market', 'https://example.com/a/2', 'A made-up lamp', 15, '2026-11-20');`,
  );
  made.close();
  // the old specs' heads: the chair search names its hunt, the lamp search only its model
  const specs = join(base, "specs");
  mkdirSync(specs);
  writeFileSync(join(specs, "made-up-chair-site.md"), "kind: deal\nhunt: Made-up Chair\ncategory: Model A\n");
  writeFileSync(join(specs, "made-up-lamp-site.md"), "kind: deal\ncategory: Lamp\n");
  importV1(db, old, true, { specsDir: specs });
  assert.deepEqual(
    listHunts(db).map((h) => [h.key, h.old]),
    [
      ["Made-up Chair", "hunt:made-up chair"],
      ["made-up-lamp-site", null],
    ],
  );
});
