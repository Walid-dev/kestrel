// A PDF upload becomes its text through the reader program: tidy text comes back; a file it can't open, a scan with
// no text and a missing reader are each refused in words; the text lands as a document that keeps its .pdf name.
// Stand-in readers (small scripts) play the PDF engine; the made-up text is all there is.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../../db/migrate.ts";
import { addUpload, getDocument, Refused } from "./documents.ts";
import { isPdf, readPdf, reflow } from "./pdf.ts";

function reader(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), "kestrel-reader-"));
  const file = join(dir, "reader.sh");
  writeFileSync(file, `#!/bin/sh\n${body}\n`);
  chmodSync(file, 0o755);
  return file;
}
const PDF = Buffer.from("%PDF-1.7 made-up");

test("a PDF's text comes back tidy; one it can't open, a scan and a missing reader are refused in words", async () => {
  assert.equal(isPdf("cv.PDF", Buffer.from("x")), true);
  assert.equal(isPdf("cv.bin", PDF), true);
  assert.equal(isPdf("notes.md", Buffer.from("# notes")), false);
  assert.equal(
    await readPdf(PDF, reader("printf 'Made-up CV  \\n\\n\\n\\nHead Keeper\\n'")),
    "Made-up CV\n\nHead Keeper\n",
  );
  await assert.rejects(readPdf(PDF, reader("exit 2")), (e) => e instanceof Refused && /isn't a PDF/.test(e.message));
  await assert.rejects(readPdf(PDF, reader("printf '   \\n'")), /no text to read/);
  await assert.rejects(readPdf(PDF, "/nonexistent/pdf-text"), /needs kestrel's PDF reader/);
});

test("the PDF's text lands as a document keeping its .pdf name; a PDF's bytes sent as text are refused", () => {
  const base = mkdtempSync(join(tmpdir(), "kestrel-pdfdoc-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  const doc = addUpload(db, "cv.pdf", "Made-up CV\n", { fromPdf: true });
  assert.equal(getDocument(db, doc.id)?.text, "Made-up CV"); // the final newline is kept apart, as for any upload
  assert.equal(doc.name, "cv.pdf");
  assert.throws(() => addUpload(db, "other.pdf", PDF), /not a text format/);
});

test("a sentence the PDF broke across lines runs on again; a heading, a bullet and a new sentence stay apart", () => {
  assert.equal(
    reflow(
      "SUMMARY\nKeeper with five years on a hive,\nbuilding it from\nevery side.\nWorks with (Wax, Comb\nHoney) daily.\n- Ran 40 hives",
    ),
    "SUMMARY\nKeeper with five years on a hive, building it from every side.\nWorks with (Wax, Comb Honey) daily.\n- Ran 40 hives",
  );
  // a line that starts with a web address is a line of its own, lower case or not
  assert.equal(
    reflow("Head Keeper · Lisbon\nexample.org/robin · on request"),
    "Head Keeper · Lisbon\nexample.org/robin · on request",
  );
});
