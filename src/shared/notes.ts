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
