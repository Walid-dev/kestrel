// The shapes the screens and the server share. Nothing from Node here: the web may import only src/shared
// (scripts/boundaries.ts).
export type DocumentMeta = {
  id: string;
  source: "file" | "upload";
  name: string;
  path: string | null;
  chars: number;
  addedAt: string;
};
// rev: the text's revision (its hash); an edit saves only over the revision it started from
export type DocumentFull = DocumentMeta & { text: string; previous: boolean; rev: string };

export type Note = {
  id: string;
  documentId: string;
  quote: string; // '' means the whole document
  text: string;
  state: "open" | "done";
  createdAt: string;
};
// where the note's words are in the document as it is now; detached when they are gone
export type PlacedNote = Note & { at: number | null; end: number | null; detached: boolean };

export type DraftChange = { document: string; find: string; replace: string; notes: string[] };
export type DraftDocumentResult = {
  placed: { change: DraftChange; at: number }[];
  leftOut: { change: DraftChange; reason: string }[];
  oldText: string;
  newText: string;
  savedAt?: string;
};
export type Draft = {
  id: string;
  createdAt: string;
  status: "making" | "ready" | "failed";
  model: string;
  documents: { id: string; name: string }[];
  overview: string;
  unanswered: { note: string; reason: string }[];
  perDocument: Record<string, DraftDocumentResult>;
  error: string;
};
