// A failed import closes the old database it opened: the nightly mirror retries, and each try must not leave one more
// file open. A made-up old database.
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../../db/migrate.ts";
import { importV1 } from "./import-v1.ts";

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
