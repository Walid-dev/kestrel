// The pick in the database wins, the settings stay the fallback, and a switch survives a reopen.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../db/migrate.ts";
import type { Settings } from "../platform/config.ts";
import { listUses, modelFor, setModelFor } from "./models.ts";

const settings: Settings = {
  tailscaleLogin: "made-up",
  notes: { folders: [] },
  models: { url: "http://127.0.0.1:1/v1", careful: "careful-model", fast: "fast-model", contextChars: 1000 },
};

test("the settings answer until a pick is made; the pick wins and survives a reopen", () => {
  const base = mkdtempSync(join(tmpdir(), "kestrel-models-"));
  const file = join(base, "t.db");
  let db = new DatabaseSync(file);
  migrate(db, file);
  assert.equal(modelFor(db, settings, "notes-fast"), "fast-model");
  setModelFor(db, "notes-fast", "another-made-up");
  assert.equal(modelFor(db, settings, "notes-fast"), "another-made-up");
  db.close();
  db = new DatabaseSync(file);
  assert.equal(modelFor(db, settings, "notes-fast"), "another-made-up");
  const uses = listUses(db, settings);
  assert.deepEqual(
    uses.map((u) => [u.use, u.model]),
    [
      ["notes-careful", "careful-model"],
      ["notes-fast", "another-made-up"],
    ],
  );
});
