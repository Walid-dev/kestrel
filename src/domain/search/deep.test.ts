// A deep check a restart interrupted says so at start, instead of running forever. Made-up listing only.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../../db/migrate.ts";
import { latestDeepCheck, sweepDeepChecks } from "./deep.ts";

test("a restart ends a deep check left running; a finished one stays as it was (review)", () => {
  const base = mkdtempSync(join(tmpdir(), "kestrel-deep-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  const add = db.prepare("INSERT INTO deep_checks (id, listing, state, step, started) VALUES (?, ?, ?, ?, ?)");
  add.run("d1", "L1", "running", "Searching the web", "2026-11-23T10:00:00Z");
  add.run("d2", "L2", "done", "", "2026-11-23T09:00:00Z");
  sweepDeepChecks(db);
  const swept = latestDeepCheck(db, "L1");
  assert.equal(swept?.state, "failed");
  assert.equal(swept?.step, "");
  assert.match(swept?.error ?? "", /restarted/);
  assert.equal(latestDeepCheck(db, "L2")?.state, "done");
});
