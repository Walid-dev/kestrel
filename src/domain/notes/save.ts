// Save writes the real file, but only if its bytes haven't changed since the draft was made: another tool may have
// touched it. It writes a sibling file and swaps it in, keeping the permissions, the encoding (BOM), the line endings
// and the final newline. The previous version is kept once for Undo, and the notes the saved changes answered move to
// Done. An upload has no file: its kept text is the original, saved in place.
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { Refused } from "./documents.ts";
import { getDraft } from "./drafts.ts";

type DocRow = {
  id: string;
  source: string;
  name: string;
  path: string | null;
  text: string;
  bom: number;
  eol: string;
  final_newline: number;
  sha256: string;
  previous_text: string | null;
};

const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

// the stored text is plain LF with no final newline; the bytes get back what the file had
export function encode(text: string, doc: Pick<DocRow, "bom" | "eol" | "final_newline">): Buffer {
  let out = doc.final_newline ? `${text}\n` : text;
  if (doc.eol === "crlf") out = out.replaceAll("\n", "\r\n");
  const body = Buffer.from(out, "utf8");
  return doc.bom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body]) : body;
}

function writeBeside(path: string, bytes: Buffer): void {
  const mode = statSync(path).mode;
  const beside = join(dirname(path), `.kestrel-saving-${process.pid}`);
  writeFileSync(beside, bytes);
  chmodSync(beside, mode);
  renameSync(beside, path);
}

const CHANGED = "changed since the draft was made: open the document again, check your notes, and ask again";

export function saveDraft(db: DatabaseSync, draftId: string, documentId: string): { where: string } {
  const draft = getDraft(db, draftId);
  if (draft?.status !== "ready") throw new Refused("no ready draft to save");
  const basis = JSON.parse(
    String((db.prepare("SELECT request FROM drafts WHERE id = ?").get(draftId) as { request: string }).request),
  ) as {
    documents: { id: string; sha256: string }[];
  };
  const pinned = basis.documents.find((d) => d.id === documentId);
  const result = draft.perDocument[documentId];
  if (!pinned || !result) throw new Refused("this document isn't part of that draft");
  if (result.savedAt) throw new Refused("already saved");
  const doc = db.prepare("SELECT * FROM documents WHERE id = ?").get(documentId) as DocRow | undefined;
  if (!doc) throw new Refused("no such document");
  if (doc.sha256 !== pinned.sha256) throw new Refused(CHANGED);
  let where: string;
  let newSha: string;
  if (doc.source === "file" && doc.path) {
    let bytes: Buffer;
    try {
      bytes = readFileSync(doc.path);
    } catch {
      throw new Refused(`the file is gone: ${doc.path}`);
    }
    if (hash(bytes) !== doc.sha256) throw new Refused(CHANGED);
    const out = encode(result.newText, doc);
    writeBeside(doc.path, out);
    newSha = hash(out);
    where = doc.path;
  } else {
    newSha = hash(Buffer.from(result.newText, "utf8"));
    where = "the upload, kept in kestrel";
  }
  keepVersion(db, documentId, doc.text);
  db.prepare("UPDATE documents SET previous_text = ?, text = ?, sha256 = ? WHERE id = ?").run(
    doc.text,
    result.newText,
    newSha,
    documentId,
  );
  const answered = new Set(result.placed.flatMap((p) => p.change.notes));
  for (const id of answered)
    db.prepare("UPDATE notes SET state = 'done' WHERE id = ? AND document_id = ?").run(id, documentId);
  // this document is saved; the draft goes once every document in it is
  const per = draft.perDocument;
  per[documentId] = { ...result, savedAt: new Date().toISOString() };
  if (draft.documents.every((d) => per[d.id]?.savedAt)) db.prepare("DELETE FROM drafts WHERE id = ?").run(draftId);
  else db.prepare("UPDATE drafts SET placed = ? WHERE id = ?").run(JSON.stringify(per), draftId);
  return { where };
}

export function undoSave(db: DatabaseSync, documentId: string): { where: string } {
  const doc = db.prepare("SELECT * FROM documents WHERE id = ?").get(documentId) as DocRow | undefined;
  if (!doc) throw new Refused("no such document");
  if (doc.previous_text == null) throw new Refused("nothing to undo");
  let where = "the upload, kept in kestrel";
  let sha = hash(Buffer.from(doc.previous_text, "utf8"));
  if (doc.source === "file" && doc.path) {
    // the file must still be exactly what the save wrote: an edit made after it is never overwritten (review R2-4)
    let now: Buffer;
    try {
      now = readFileSync(doc.path);
    } catch {
      throw new Refused(`the file is gone: ${doc.path}`);
    }
    if (hash(now) !== doc.sha256)
      throw new Refused("the file changed after the save: nothing was undone, open it again to see it");
    const out = encode(doc.previous_text, doc);
    writeBeside(doc.path, out);
    sha = hash(out);
    where = doc.path;
  }
  keepVersion(db, documentId, doc.text);
  db.prepare("UPDATE documents SET text = ?, previous_text = NULL, sha256 = ? WHERE id = ?").run(
    doc.previous_text,
    sha,
    documentId,
  );
  return { where };
}

// the words a save or a restore replaces, kept: any earlier version can come back
function keepVersion(db: DatabaseSync, documentId: string, text: string): void {
  db.prepare("INSERT INTO document_versions (id, document_id, text, saved_at) VALUES (?, ?, ?, ?)").run(
    randomUUID(),
    documentId,
    text,
    new Date().toISOString(),
  );
}

export type Version = { id: string; savedAt: string; chars: number; start: string };

// a document's earlier versions, the newest first: when each was replaced, its length and how it starts
export function listVersions(db: DatabaseSync, documentId: string): Version[] {
  return (
    db
      .prepare("SELECT id, saved_at, text FROM document_versions WHERE document_id = ? ORDER BY saved_at DESC LIMIT 50")
      .all(documentId) as { id: string; saved_at: string; text: string }[]
  ).map((v) => ({ id: v.id, savedAt: v.saved_at, chars: v.text.length, start: v.text.slice(0, 120) }));
}

// an earlier version back in its place, the current words kept as a version first; a file changed outside kestrel
// since it was opened is never overwritten (as for Undo)
export function restoreVersion(db: DatabaseSync, documentId: string, versionId: string): { where: string } {
  const doc = db.prepare("SELECT * FROM documents WHERE id = ?").get(documentId) as DocRow | undefined;
  if (!doc) throw new Refused("no such document");
  const v = db
    .prepare("SELECT text FROM document_versions WHERE id = ? AND document_id = ?")
    .get(versionId, documentId) as { text: string } | undefined;
  if (!v) throw new Refused("no such version");
  let where = "the upload, kept in kestrel";
  let sha = hash(Buffer.from(v.text, "utf8"));
  if (doc.source === "file" && doc.path) {
    let now: Buffer;
    try {
      now = readFileSync(doc.path);
    } catch {
      throw new Refused(`the file is gone: ${doc.path}`);
    }
    if (hash(now) !== doc.sha256)
      throw new Refused("the file changed outside kestrel: open it again before restoring a version");
    const out = encode(v.text, doc);
    writeBeside(doc.path, out);
    sha = hash(out);
    where = doc.path;
  }
  keepVersion(db, documentId, doc.text);
  db.prepare("UPDATE documents SET previous_text = ?, text = ?, sha256 = ? WHERE id = ?").run(
    doc.text,
    v.text,
    sha,
    documentId,
  );
  return { where };
}
