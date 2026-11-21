// A note finds its words again after the text moves, picks the right repeat by its context, and is kept as detached
// when the words are gone.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../../db/migrate.ts";
import { addUpload } from "./documents.ts";
import { addNote, anchor, deleteNote, editNote, listNotes } from "./notes.ts";

function setup(text: string) {
  const base = mkdtempSync(join(tmpdir(), "kestrel-notes-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  const doc = addUpload(db, "a.md", text);
  return { db, doc };
}

test("a note on words is placed, and still found after text is added before it", () => {
  const { db, doc } = setup("One two three four.");
  const n = addNote(db, doc.id, { text: "tighten this", quote: "three", start: 8 });
  assert.equal(n.at, 8);
  db.prepare("UPDATE documents SET text = ? WHERE id = ?").run("Zero added. One two three four.", doc.id);
  const placed = listNotes(db, doc.id)[0];
  assert.equal(placed.detached, false);
  assert.equal(placed.at, 20);
});

test("a repeated phrase lands on the occurrence whose surroundings match", () => {
  const text = "The cat sat. The cat ran. The cat slept.";
  const { db, doc } = setup(text);
  const n = addNote(db, doc.id, { text: "the running one", quote: "The cat", start: 13 });
  assert.equal(n.at, 13);
  db.prepare("UPDATE documents SET text = ? WHERE id = ?").run(`Intro line. ${text}`, doc.id);
  const placed = listNotes(db, doc.id)[0];
  assert.equal(placed.at, 12 + 13); // still the one before "ran"
});

test("a note whose words are gone is kept, shown as detached; a whole-document note never detaches", () => {
  const { db, doc } = setup("Alpha beta gamma.");
  addNote(db, doc.id, { text: "drop this word", quote: "beta", start: 6 });
  const whole = addNote(db, doc.id, { text: "shorter overall", quote: "" });
  assert.equal(whole.at, null);
  db.prepare("UPDATE documents SET text = ? WHERE id = ?").run("Alpha gamma.", doc.id);
  const placed = listNotes(db, doc.id);
  assert.deepEqual(
    placed.map((p) => p.detached),
    [true, false],
  );
});

test("adding checks the words are really there; edit and delete behave", () => {
  const { db, doc } = setup("One two three.");
  assert.throws(() => addNote(db, doc.id, { text: "x", quote: "missing", start: 0 }), /not in the document/);
  assert.throws(() => addNote(db, doc.id, { text: "   ", quote: "" }), /empty note/);
  const n = addNote(db, doc.id, { text: "first", quote: "One", start: 0 });
  editNote(db, n.id, "second");
  assert.equal(listNotes(db, doc.id)[0].text, "second");
  deleteNote(db, n.id);
  assert.equal(listNotes(db, doc.id).length, 0);
});

test("anchor picks by context overlap when starts are equal distances", () => {
  const text = "aa X bb. cc X dd.";
  const got = anchor(text, { quote: "X", prefix: "cc ", suffix: " dd", start: null });
  assert.equal(got.at, text.lastIndexOf("X"));
});
