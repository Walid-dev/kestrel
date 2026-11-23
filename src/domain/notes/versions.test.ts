// Versions: a restore writes an earlier version back and keeps the current words as a version; a file changed
// outside kestrel is never overwritten; my voice and stories open in Notes from the applications' folder, and no
// other file outside Notes' folders does. Made-up files only.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../../db/migrate.ts";
import type { Settings } from "../../platform/config.ts";
import { openFile } from "./documents.ts";
import { listVersions, restoreVersion } from "./save.ts";

function setup() {
  const base = mkdtempSync(join(tmpdir(), "kestrel-versions-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  const apply = join(base, "apply");
  mkdirSync(apply);
  writeFileSync(join(apply, "voice.md"), "Warm and short.\n");
  writeFileSync(join(apply, "secrets.md"), "Not for Notes.\n");
  const settings = { notes: { folders: [join(base, "notes")] }, apply: { folder: apply } } as unknown as Settings;
  mkdirSync(join(base, "notes"));
  return { db, apply, settings };
}

test("my voice opens in Notes from the applications' folder; another file there doesn't", () => {
  const { db, apply, settings } = setup();
  assert.equal(openFile(db, settings, join(apply, "voice.md")).name, "voice.md");
  assert.throws(() => openFile(db, settings, join(apply, "secrets.md")), /outside the folders/);
});

test("a restore brings an earlier version back and keeps the current one; a file changed outside is left alone", () => {
  const { db, apply, settings } = setup();
  const doc = openFile(db, settings, join(apply, "voice.md"));
  db.prepare(
    "INSERT INTO document_versions (id, document_id, text, saved_at) VALUES ('v1', ?, 'Long and formal.', '2026-11-20T10:00:00Z')",
  ).run(doc.id);
  restoreVersion(db, doc.id, "v1");
  assert.equal(readFileSync(join(apply, "voice.md"), "utf8"), "Long and formal.\n");
  assert.deepEqual(
    listVersions(db, doc.id).map((v) => v.start),
    ["Warm and short.", "Long and formal."], // the words it replaced, kept first
  );
  writeFileSync(join(apply, "voice.md"), "Changed by hand.\n");
  assert.throws(() => restoreVersion(db, doc.id, "v1"), /changed outside kestrel/);
  assert.equal(readFileSync(join(apply, "voice.md"), "utf8"), "Changed by hand.\n");
});
