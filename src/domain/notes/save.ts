// Save writes the real file, but only if its bytes haven't changed since the draft was made: another tool may have
// touched it. It writes a sibling file and swaps it in, keeping the permissions, the encoding (BOM), the line endings
// and the final newline. The previous version is kept once for Undo, and the notes the saved changes answered move to
// Done. The review can drop some of the changes: only the kept ones are written, and only their notes go to Done. An upload has no file: its kept text is the original, saved in place. My own edit, typed in the editor, saves
// the same way (saveText).
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { MAX_BYTES, Refused } from "./documents.ts";
import { getDraft } from "./drafts.ts";
import { apply } from "./place.ts";

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

// keep: the positions, in the document's placed list, of the changes the review kept; none given keeps them all
export function saveDraft(
  db: DatabaseSync,
  draftId: string,
  documentId: string,
  keep?: number[],
): { where: string; saved: number } {
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
  const kept = keep ? result.placed.filter((_, i) => keep.includes(i)) : result.placed;
  if (kept.length === 0) throw new Refused("no change is kept: keep one, or discard the draft");
  // the kept changes alone, placed again on the text the draft was made from (the same bytes: checked above)
  const newText = kept.length === result.placed.length ? result.newText : apply(result.oldText, kept);
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
    const out = encode(newText, doc);
    writeBeside(doc.path, out);
    newSha = hash(out);
    where = doc.path;
  } else {
    newSha = hash(Buffer.from(newText, "utf8"));
    where = "the upload, kept in kestrel";
  }
  keepVersion(db, documentId, doc.text);
  db.prepare("UPDATE documents SET previous_text = ?, text = ?, sha256 = ? WHERE id = ?").run(
    doc.text,
    newText,
    newSha,
    documentId,
  );
  const answered = new Set(kept.flatMap((p) => p.change.notes));
  for (const id of answered)
    db.prepare("UPDATE notes SET state = 'done' WHERE id = ? AND document_id = ?").run(id, documentId);
  // this document is saved; the draft goes once every document in it is
  const per = draft.perDocument;
  per[documentId] = { ...result, newText, savedAt: new Date().toISOString() };
  if (draft.documents.every((d) => per[d.id]?.savedAt)) db.prepare("DELETE FROM drafts WHERE id = ?").run(draftId);
  else db.prepare("UPDATE drafts SET placed = ? WHERE id = ?").run(JSON.stringify(per), draftId);
  return { where, saved: kept.length };
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

// the document changed in kestrel since the editor opened it (another device, a draft's save, a restore): the
// refusal carries the newer revision, so my words can still be saved over it on purpose
export class Changed extends Refused {
  rev: string;
  constructor(message: string, rev: string) {
    super(message);
    this.rev = rev;
  }
}

// my own edit, typed in the editor: written like a draft's save (the file's BOM, line endings and final newline back
// on; a file changed outside kestrel is never overwritten), the words it replaces kept as a version and for Undo.
// rev is the revision the editor started from (DocumentFull.rev).
export function saveText(
  db: DatabaseSync,
  documentId: string,
  given: string,
  rev: string,
): { where: string; rev: string } {
  const doc = db.prepare("SELECT * FROM documents WHERE id = ?").get(documentId) as DocRow | undefined;
  if (!doc) throw new Refused("no such document");
  if (doc.sha256 !== rev)
    throw new Changed("The document changed since you started editing. Your words are still here.", doc.sha256);
  const text = given.replaceAll("\r\n", "\n"); // kept as LF, like every document; the file gets its own endings back
  if (Buffer.byteLength(text, "utf8") > MAX_BYTES) throw new Refused(`bigger than ${MAX_BYTES / 1024} KB`);
  const where = doc.source === "file" && doc.path ? doc.path : "the upload, kept in kestrel";
  if (text === doc.text) return { where, rev: doc.sha256 }; // nothing changed: no version, no write
  let sha = hash(Buffer.from(text, "utf8"));
  if (doc.source === "file" && doc.path) {
    let now: Buffer;
    try {
      now = readFileSync(doc.path);
    } catch {
      throw new Refused(`the file is gone: ${doc.path}`);
    }
    if (hash(now) !== doc.sha256)
      throw new Refused("the file changed outside kestrel: copy your words, open the file again, then save");
    const out = encode(text, doc);
    writeBeside(doc.path, out);
    sha = hash(out);
  }
  keepVersion(db, documentId, doc.text);
  db.prepare("UPDATE documents SET previous_text = ?, text = ?, sha256 = ? WHERE id = ?").run(
    doc.text,
    text,
    sha,
    documentId,
  );
  return { where, rev: sha };
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
