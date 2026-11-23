// Ask on Notes: what an open document's page shows the model (its text and my notes on it) and the one change the
// model may propose there: a note, on exact words of the document or on the whole of it, as a card I tap. A note
// tapped joins my others, and the page's own "Ask for changes" turns them into an edit I review, save and can undo:
// the document has one way to change.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { AskPage } from "../../ai/ask/prompt.ts";
import { getDocument } from "./documents.ts";
import { addNote, listNotes } from "./notes.ts";

const TEXT_CHARS = 24_000; // the document as the model reads it; a longer one is cut, and the page says so
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function notesPage(db: DatabaseSync, ref: string): AskPage | null {
  const doc = getDocument(db, ref);
  if (!doc) return null;
  const open = listNotes(db, ref).filter((n) => n.state === "open");
  return {
    app: "Notes",
    what: "a document I am reworking: I note words that should change, and the model turns my notes into an edit",
    title: doc.name,
    link: `/notes?doc=${encodeURIComponent(ref)}`,
    context: [
      `THE DOCUMENT (${doc.name}${doc.text.length > TEXT_CHARS ? `, its first ${TEXT_CHARS} characters of ${doc.text.length}` : ""}):`,
      doc.text.slice(0, TEXT_CHARS),
      "",
      `MY OPEN NOTES (${open.length}):`,
      ...(open.length
        ? open.map((n) => `- ${n.quote ? `on "${short(n.quote, 160)}"` : "on the whole document"}: ${n.text}`)
        : ["none yet"]),
    ].join("\n"),
    tools: [
      "WHAT YOU CAN DO HERE",
      "- You can't change the document yourself. To change it, propose a note: kestrel shows a card, and I add it with",
      "  a tap; my notes then become an edit I review. Write one short line that says what the card does, then one",
      "  block per note. Never say a note is added, and never explain the block:",
      "```action",
      '{"do": "note", "quote": "<words copied exactly from the document>", "text": "<what should change, and how>"}',
      "```",
      '  quote: a short run of words copied exactly from the document, or "" for a note on the whole document.',
    ].join("\n"),
  };
}

const Note = z.object({ do: z.literal("note"), quote: z.string().max(2000), text: z.string().min(1).max(4000) });

export function describeNote(db: DatabaseSync, ref: string, action: unknown): string | null {
  const a = Note.safeParse(action);
  const doc = getDocument(db, ref);
  if (!a.success || !doc) return null;
  if (a.data.quote && !doc.text.includes(a.data.quote)) return null; // words the document doesn't have
  return `Note ${a.data.quote ? `on “${short(a.data.quote, 80)}”` : "on the whole document"}: ${short(a.data.text, 200)}`;
}

export function runNote(db: DatabaseSync, _settings: unknown, ref: string, action: unknown): string {
  const a = Note.parse(action);
  addNote(db, ref, { quote: a.quote, text: a.text });
  return "Noted, with your other notes: Ask for changes turns them into an edit.";
}

export const notesHelper = { page: notesPage, act: { describe: describeNote, run: runNote } };
