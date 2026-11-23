// Development's made-up documents, so Notes opens on something to read, edit and print: each file in the made-up
// data folder's documents/ (copied from scripts/dev-data) opens as a file, so an edit saves to it there; a
// name.pdf.txt is a PDF's text as the computer's PDF reader gives it, and goes in as an uploaded PDF would. Only when
// Notes has no documents yet, and never on the deployed app (the notes routes check).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Settings } from "../../platform/config.ts";
import { addUpload, openFile } from "./documents.ts";
import { pdfText } from "./pdf.ts";

export function seedDocuments(db: DatabaseSync, settings: Settings, dir: string): number {
  const have = (db.prepare("SELECT COUNT(*) AS n FROM documents").get() as { n: number }).n;
  if (have > 0 || !existsSync(dir)) return 0;
  const here = { ...settings, notes: { folders: [dir] } };
  let n = 0;
  for (const name of readdirSync(dir).sort()) {
    const file = join(dir, name);
    if (name.endsWith(".pdf.txt"))
      addUpload(db, name.slice(0, -4), pdfText(readFileSync(file, "utf8")), { fromPdf: true });
    else openFile(db, here, file);
    n++;
  }
  return n;
}
