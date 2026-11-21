// The folder rule at the file's real place, the formats refused with a reason, and what the bytes looked like.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../../db/migrate.ts";
import type { Settings } from "../../platform/config.ts";
import { addUpload, getDocument, listDocuments, listFiles, openFile, Refused } from "./documents.ts";

function setup() {
  const base = mkdtempSync(join(tmpdir(), "kestrel-docs-"));
  const inside = join(base, "allowed");
  const outside = join(base, "elsewhere");
  mkdirSync(inside);
  mkdirSync(outside);
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  const settings: Settings = {
    tailscaleLogin: "made-up",
    notes: { folders: [inside] },
    models: { url: "http://127.0.0.1:1/v1", careful: "c", fast: "f", contextChars: 1000 },
  };
  return { base, inside, outside, db, settings };
}

test("a file in a listed folder opens, and opening again refreshes the same document", () => {
  const { inside, db, settings } = setup();
  writeFileSync(join(inside, "a.md"), "# One\n\nTwo.\n");
  const first = openFile(db, settings, join(inside, "a.md"));
  assert.equal(first.source, "file");
  assert.equal(getDocument(db, first.id)?.text, "# One\n\nTwo.");
  writeFileSync(join(inside, "a.md"), "# One\n\nThree.\n");
  const again = openFile(db, settings, join(inside, "a.md"));
  assert.equal(again.id, first.id);
  assert.equal(getDocument(db, first.id)?.text, "# One\n\nThree.");
  assert.equal(listDocuments(db).length, 1);
});

test("a path that leaves the folder is refused, and so is a symlink that points outside", () => {
  const { inside, outside, db, settings } = setup();
  writeFileSync(join(outside, "secret.md"), "out");
  assert.throws(() => openFile(db, settings, join(outside, "secret.md")), Refused);
  assert.throws(() => openFile(db, settings, join(inside, "..", "elsewhere", "secret.md")), Refused);
  symlinkSync(join(outside, "secret.md"), join(inside, "looks-inside.md"));
  assert.throws(() => openFile(db, settings, join(inside, "looks-inside.md")), /outside the folders/);
});

test("a PDF and a non-UTF-8 file are refused with the reason; too big is refused", () => {
  const { inside, db, settings } = setup();
  writeFileSync(join(inside, "paper.pdf"), "%PDF-1.4 made up");
  assert.throws(() => openFile(db, settings, join(inside, "paper.pdf")), /not a text format/);
  writeFileSync(join(inside, "bad.md"), Buffer.from([0x68, 0x69, 0xff, 0xfe, 0x00]));
  assert.throws(() => openFile(db, settings, join(inside, "bad.md")), /UTF-8/);
  writeFileSync(join(inside, "big.md"), Buffer.alloc(201 * 1024, 0x61));
  assert.throws(() => openFile(db, settings, join(inside, "big.md")), /bigger than/);
});

test("a file with mixed line endings is refused with the reason (R2-5)", () => {
  const { inside, db, settings } = setup();
  writeFileSync(join(inside, "mixed.md"), "one\r\ntwo\nthree\r\n");
  assert.throws(() => openFile(db, settings, join(inside, "mixed.md")), /mixed line endings/);
});

test("BOM, CRLF and a missing final newline are remembered; the kept text is plain LF", () => {
  const { inside, db, settings } = setup();
  writeFileSync(join(inside, "w.md"), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("a\r\nb")]));
  const m = openFile(db, settings, join(inside, "w.md"));
  assert.equal(getDocument(db, m.id)?.text, "a\nb");
  const row = db.prepare("SELECT bom, eol, final_newline FROM documents WHERE id = ?").get(m.id) as {
    bom: number;
    eol: string;
    final_newline: number;
  };
  assert.deepEqual({ ...row }, { bom: 1, eol: "crlf", final_newline: 0 });
});

test("an upload with the same name saves over the earlier one, never a duplicate", () => {
  const { db } = setup();
  const first = addUpload(db, "cover-letter.txt", "Dear team, version one.");
  const again = addUpload(db, "cover-letter.txt", "Dear team, version two.");
  assert.equal(again.id, first.id);
  assert.equal(listDocuments(db).filter((d) => d.name === "cover-letter.txt").length, 1);
  assert.equal(getDocument(db, first.id)?.text, "Dear team, version two.");
});

test("an upload is kept as given, and the folder list shows only text files", () => {
  const { inside, db, settings } = setup();
  const up = addUpload(db, "notes.txt", "hello\n");
  assert.equal(getDocument(db, up.id)?.text, "hello");
  writeFileSync(join(inside, "a.md"), "x");
  writeFileSync(join(inside, "b.pdf"), "x");
  mkdirSync(join(inside, "sub"));
  writeFileSync(join(inside, "sub", "c.txt"), "x");
  assert.deepEqual(
    listFiles(settings).map((f) => f.name),
    ["a.md", "c.txt"],
  );
});
