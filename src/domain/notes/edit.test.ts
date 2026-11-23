// My own edit, typed in the editor: it saves to the file with the file's clothes back on (BOM, CRLF, final newline),
// keeps the words it replaces as a version that Undo and Restore bring back, and never lands on a newer revision or
// on a file changed outside kestrel. Development's made-up documents open once, a PDF's text as an upload would.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../../db/migrate.ts";
import type { Settings } from "../../platform/config.ts";
import { addUpload, getDocument, listDocuments, openFile } from "./documents.ts";
import { Changed, listVersions, saveText, undoSave } from "./save.ts";
import { seedDocuments } from "./seed.ts";

function setup() {
  const base = mkdtempSync(join(tmpdir(), "kestrel-edit-"));
  const folder = join(base, "docs");
  mkdirSync(folder);
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  const settings = { notes: { folders: [folder] }, apply: { folder: "" } } as unknown as Settings;
  return { base, folder, db, settings };
}

test("my edit saves to the file, its clothes back on, the old words kept as a version that Undo brings back", () => {
  const { folder, db, settings } = setup();
  const file = join(folder, "plan.md");
  const bom = Buffer.from([0xef, 0xbb, 0xbf]);
  writeFileSync(file, Buffer.concat([bom, Buffer.from("# Plan\r\n\r\nThree parts.\r\n")]));
  const doc = openFile(db, settings, file);
  const before = getDocument(db, doc.id);
  assert.ok(before);
  const saved = saveText(db, doc.id, "# Plan\n\nTwo parts.", before.rev);
  const bytes = readFileSync(file);
  assert.deepEqual(bytes.subarray(0, 3), bom);
  assert.equal(bytes.subarray(3).toString("utf8"), "# Plan\r\n\r\nTwo parts.\r\n");
  assert.notEqual(saved.rev, before.rev);
  assert.deepEqual(
    listVersions(db, doc.id).map((v) => v.start),
    ["# Plan\n\nThree parts."],
  );
  // the same words again change nothing and keep no version
  assert.equal(saveText(db, doc.id, "# Plan\n\nTwo parts.", saved.rev).rev, saved.rev);
  assert.equal(listVersions(db, doc.id).length, 1);
  undoSave(db, doc.id);
  assert.equal(readFileSync(file).subarray(3).toString("utf8"), "# Plan\r\n\r\nThree parts.\r\n");
});

test("an edit on an older revision is refused with the newer one; a file changed outside is never overwritten", () => {
  const { folder, db, settings } = setup();
  const file = join(folder, "voice.md");
  writeFileSync(file, "Warm and short.\n");
  const doc = openFile(db, settings, file);
  const first = getDocument(db, doc.id)?.rev ?? "";
  const mine = saveText(db, doc.id, "Warm, short, plain.", first);
  // a second device still holds the first revision: refused, and told the newer one
  assert.throws(
    () => saveText(db, doc.id, "Long and formal.", first),
    (e) => e instanceof Changed && e.rev === mine.rev && /changed since you started editing/.test(e.message),
  );
  // saved on purpose over the newer revision, it lands
  saveText(db, doc.id, "Long and formal.", mine.rev);
  assert.equal(readFileSync(file, "utf8"), "Long and formal.\n");
  writeFileSync(file, "Changed by hand.\n");
  const now = getDocument(db, doc.id)?.rev ?? "";
  assert.throws(() => saveText(db, doc.id, "Mine.", now), /changed outside kestrel/);
  assert.equal(readFileSync(file, "utf8"), "Changed by hand.\n");
});

test("an upload's text saves in place; a text too big is refused", () => {
  const { db } = setup();
  const doc = addUpload(db, "cv.pdf", "Made-up CV\n", { fromPdf: true });
  const rev = getDocument(db, doc.id)?.rev ?? "";
  assert.equal(saveText(db, doc.id, "Made-up CV, reworked", rev).where, "the upload, kept in kestrel");
  assert.equal(getDocument(db, doc.id)?.text, "Made-up CV, reworked");
  const now = getDocument(db, doc.id)?.rev ?? "";
  assert.throws(() => saveText(db, doc.id, "x".repeat(300 * 1024), now), /bigger than/);
});

test("development's made-up documents open once: a file that saves in place, and a PDF's text as an upload", () => {
  const { base, db, settings } = setup();
  const dir = join(base, "documents");
  mkdirSync(dir);
  writeFileSync(join(dir, "handbook.md"), "# A made-up handbook\n");
  writeFileSync(join(dir, "cv.pdf.txt"), "Made-up Name  \r\nKeeper of\nbees\n\n\n\n• Ran 40 hives\n");
  assert.equal(seedDocuments(db, settings, dir), 2);
  const docs = listDocuments(db);
  assert.deepEqual(docs.map((d) => [d.name, d.source]).sort(), [
    ["cv.pdf", "upload"],
    ["handbook.md", "file"],
  ]);
  const cv = docs.find((d) => d.name === "cv.pdf");
  assert.equal(getDocument(db, cv?.id ?? "")?.text, "Made-up Name\nKeeper of bees\n\n• Ran 40 hives");
  assert.equal(seedDocuments(db, settings, dir), 0); // never twice
});
