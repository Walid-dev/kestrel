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
export type DocumentFull = DocumentMeta & { text: string };

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
