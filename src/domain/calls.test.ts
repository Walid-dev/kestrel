// A call lands in the record with its outcome, good or bad.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../db/migrate.ts";
import { listCalls, recordCall } from "./calls.ts";

test("good and failed calls are both recorded with their outcome", () => {
  const base = mkdtempSync(join(tmpdir(), "kestrel-calls-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  recordCall(db, "changes", { ok: true, value: {}, ms: 12, model: "careful-model", tokensIn: 7, tokensOut: 9 });
  recordCall(db, "changes", { ok: false, why: "timeout", detail: "took too long", ms: 99, model: "fast-model" });
  const rows = listCalls(db);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.outcome).sort(), ["ok", "timeout"]);
});
