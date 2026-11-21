// Save writes the file with its old clothes back on (BOM, CRLF, final newline), refuses a file changed since the
// draft, keeps one previous version for Undo, and moves the answered notes to Done.
import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { startStandIn } from "../../ai/stand-in.ts";
import { migrate } from "../../db/migrate.ts";
import type { Settings } from "../../platform/config.ts";
import { openFile } from "./documents.ts";
import { startDraft } from "./drafts.ts";
import { addNote, listNotes } from "./notes.ts";
import { saveDraft, undoSave } from "./save.ts";

const settings = (folder: string, url: string): Settings => ({
  tailscaleLogin: "made-up",
  notes: { folders: [folder] },
  models: { url, careful: "careful-model", fast: "fast-model", contextChars: 100_000 },
});

async function draftOn(fileBytes: Buffer) {
  const base = mkdtempSync(join(tmpdir(), "kestrel-save-"));
  const folder = join(base, "docs");
  mkdirSync(folder);
  const file = join(folder, "a.md");
  writeFileSync(file, fileBytes);
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  const s = await startStandIn(() => ({
    content: JSON.stringify({
      overview: "a.md: one change.",
      changes: [{ document: "a.md", find: "three parts", replace: "two parts", notes: ["will-be-replaced"] }],
      unanswered: [],
    }),
  }));
  const cfg = settings(folder, s.url);
  const doc = openFile(db, cfg, file);
  const note = addNote(db, doc.id, { text: "two, not three", quote: "three parts" });
  // the stand-in can't know the real note id: answer with it
  await s.close();
  const s2 = await startStandIn(() => ({
    content: JSON.stringify({
      overview: "a.md: one change.",
      changes: [{ document: "a.md", find: "three parts", replace: "two parts", notes: [note.id] }],
      unanswered: [],
    }),
  }));
  const made = startDraft(db, settings(folder, s2.url), { documentIds: [doc.id], speed: "careful" });
  await made.done;
  await s2.close();
  return { db, doc, file: realpathSync(file), draftId: made.id, note };
}

test("save writes the file, old clothes back on, and the answered note goes to Done", async () => {
  const bom = Buffer.from([0xef, 0xbb, 0xbf]);
  const { db, doc, file, draftId } = await draftOn(Buffer.concat([bom, Buffer.from("The plan has three parts.\r\n")]));
  const saved = saveDraft(db, draftId, doc.id);
  assert.equal(saved.where, file);
  const bytes = readFileSync(file);
  assert.deepEqual(bytes.subarray(0, 3), bom); // the byte-order mark kept
  assert.equal(bytes.subarray(3).toString("utf8"), "The plan has two parts.\r\n"); // CRLF and final newline kept
  assert.deepEqual(
    listNotes(db, doc.id).map((n) => n.state),
    ["done"],
  );
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM drafts").get()?.n, 0); // the one-document draft is consumed
});

test("a file changed after the draft is refused with 'changed since'", async () => {
  const { db, doc, file, draftId } = await draftOn(Buffer.from("The plan has three parts.\n"));
  appendFileSync(file, "another tool wrote this\n");
  assert.throws(() => saveDraft(db, draftId, doc.id), /changed since the draft was made/);
  assert.match(readFileSync(file, "utf8"), /another tool/); // nothing was written
});

test("undo brings the previous text back, once", async () => {
  const { db, doc, file, draftId } = await draftOn(Buffer.from("The plan has three parts.\n"));
  saveDraft(db, draftId, doc.id);
  assert.equal(readFileSync(file, "utf8"), "The plan has two parts.\n");
  const undone = undoSave(db, doc.id);
  assert.equal(undone.where, file);
  assert.equal(readFileSync(file, "utf8"), "The plan has three parts.\n");
  assert.throws(() => undoSave(db, doc.id), /nothing to undo/);
});
