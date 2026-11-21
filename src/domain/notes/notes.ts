// Notes on a document: a range of the file's own characters, kept as the words themselves (the quote) with a little
// text on each side, so the note finds its place again after the text moves. An empty quote is a note on the whole
// document. A note whose words are gone is kept and answers as detached.
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Note, PlacedNote } from "../../shared/notes.ts";
import { Refused } from "./documents.ts";

const CONTEXT = 24; // characters kept on each side of the quote

type Row = Record<string, unknown>;
const note = (r: Row): Note => ({
  id: String(r.id),
  documentId: String(r.document_id),
  quote: String(r.quote),
  text: String(r.text),
  state: r.state as "open" | "done",
  createdAt: String(r.created_at),
});

// every place the quote appears, scored by how much of the kept context matches, the nearest to where it was wins
export function anchor(
  text: string,
  n: { quote: string; prefix: string; suffix: string; start: number | null },
): { at: number | null; end: number | null; detached: boolean } {
  if (n.quote === "") return { at: null, end: null, detached: false };
  const spots: number[] = [];
  for (let i = text.indexOf(n.quote); i !== -1; i = text.indexOf(n.quote, i + 1)) spots.push(i);
  if (spots.length === 0) return { at: null, end: null, detached: true };
  const overlap = (a: string, b: string) => {
    let k = 0;
    while (k < a.length && k < b.length && a[a.length - 1 - k] === b[b.length - 1 - k]) k++;
    return k;
  };
  let best = spots[0];
  let bestScore = -1;
  for (const at of spots) {
    const before = text.slice(Math.max(0, at - CONTEXT), at);
    const after = text.slice(at + n.quote.length, at + n.quote.length + CONTEXT);
    let score = overlap(n.prefix, before); // the prefix matches from its end
    let k = 0;
    while (k < after.length && k < n.suffix.length && after[k] === n.suffix[k]) k++;
    score += k;
    const distance = n.start === null ? 0 : Math.abs(at - n.start);
    const fit = score * 1000 - distance;
    if (fit > bestScore) {
      bestScore = fit;
      best = at;
    }
  }
  return { at: best, end: best + n.quote.length, detached: false };
}

export function addNote(
  db: DatabaseSync,
  documentId: string,
  input: { text: string; quote?: string; start?: number },
): PlacedNote {
  const doc = db.prepare("SELECT text FROM documents WHERE id = ?").get(documentId) as { text: string } | undefined;
  if (!doc) throw new Refused("no such document");
  const quote = input.quote ?? "";
  let prefix = "";
  let suffix = "";
  let start: number | null = null;
  if (quote !== "") {
    start = input.start ?? doc.text.indexOf(quote);
    if (start === -1 || doc.text.slice(start, start + quote.length) !== quote)
      throw new Refused("those words are not in the document at that place any more: select them again");
    prefix = doc.text.slice(Math.max(0, start - CONTEXT), start);
    suffix = doc.text.slice(start + quote.length, start + quote.length + CONTEXT);
  }
  if (input.text.trim() === "") throw new Refused("an empty note says nothing: write what should change");
  const id = randomUUID();
  db.prepare(
    `INSERT INTO notes (id, document_id, quote, prefix, suffix, start, text, state, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
  ).run(id, documentId, quote, prefix, suffix, start, input.text.trim(), new Date().toISOString());
  return listNotes(db, documentId).find((n) => n.id === id) as PlacedNote;
}

export function listNotes(db: DatabaseSync, documentId: string): PlacedNote[] {
  const doc = db.prepare("SELECT text FROM documents WHERE id = ?").get(documentId) as { text: string } | undefined;
  if (!doc) return [];
  const rows = db.prepare("SELECT * FROM notes WHERE document_id = ? ORDER BY created_at").all(documentId) as Row[];
  return rows.map((r) => ({
    ...note(r),
    ...anchor(doc.text, {
      quote: String(r.quote),
      prefix: String(r.prefix),
      suffix: String(r.suffix),
      start: r.start === null ? null : Number(r.start),
    }),
  }));
}

export function editNote(db: DatabaseSync, id: string, text: string): void {
  if (text.trim() === "") throw new Refused("an empty note says nothing: write what should change, or delete it");
  const r = db.prepare("UPDATE notes SET text = ? WHERE id = ?").run(text.trim(), id);
  if (r.changes === 0) throw new Refused("no such note");
}

export function deleteNote(db: DatabaseSync, id: string): void {
  db.prepare("DELETE FROM notes WHERE id = ?").run(id);
}
