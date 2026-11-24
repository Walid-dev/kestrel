// The Notes routes, mounted on the one app by main.ts: the documents list, the files the folders offer, open,
// upload, and one document with its text, which my own edits save to. A Refused from the domain answers 400 with its
// reason; an edit made on an older revision answers 409 with the newer one.

import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { z } from "zod";
import {
  addUpload,
  deleteDocument,
  getDocument,
  listDocuments,
  listFiles,
  MAX_BYTES,
  openFile,
  Refused,
} from "../domain/notes/documents.ts";
import { discardDraft, draftFor, getDraft, startDraft } from "../domain/notes/drafts.ts";
import { addNote, deleteNote, editNote, listNotes } from "../domain/notes/notes.ts";
import { isPdf, PDF_MAX_BYTES, readPdf } from "../domain/notes/pdf.ts";
import { Changed, listVersions, restoreVersion, saveDraft, saveText, undoSave } from "../domain/notes/save.ts";
import { seedDocuments } from "../domain/notes/seed.ts";
import { record } from "../platform/activity.ts";
import type { Settings } from "../platform/config.ts";
import { dataDir, isDeployed } from "../platform/paths.ts";

export function mountNotes(app: Hono, db: DatabaseSync, settings: Settings) {
  const refusing = (c: { json: (o: unknown, s: 400 | 500) => Response }, e: unknown) => {
    if (e instanceof Refused) return c.json({ error: e.message }, 400);
    throw e;
  };
  // development opens on made-up documents (scripts/dev-data/documents); the deployed app never does
  if (!isDeployed()) seedDocuments(db, settings, join(dataDir(), "documents"));

  app.get("/api/notes/documents", (c) => c.json({ documents: listDocuments(db) }));
  app.get("/api/notes/files", (c) => c.json({ files: listFiles(settings) }));
  app.delete("/api/notes/documents/:id", (c) => {
    deleteDocument(db, c.req.param("id"));
    return c.json({ ok: true });
  });
  app.get("/api/notes/documents/:id", (c) => {
    const doc = getDocument(db, c.req.param("id"));
    return doc ? c.json(doc) : c.json({ error: "no such document" }, 404);
  });
  app.post("/api/notes/open", zValidator("json", z.object({ path: z.string().min(1) })), (c) => {
    try {
      return c.json(openFile(db, settings, c.req.valid("json").path));
    } catch (e) {
      return refusing(c, e);
    }
  });
  app.get("/api/notes/documents/:id/notes", (c) => c.json({ notes: listNotes(db, c.req.param("id")) }));
  app.post(
    "/api/notes/documents/:id/notes",
    zValidator(
      "json",
      z.object({
        text: z.string().max(4000),
        quote: z.string().max(2000).optional(),
        start: z.number().int().min(0).optional(),
      }),
    ),
    (c) => {
      try {
        return c.json(addNote(db, c.req.param("id"), c.req.valid("json")));
      } catch (e) {
        return refusing(c, e);
      }
    },
  );
  app.post("/api/notes/note/:id", zValidator("json", z.object({ text: z.string().max(4000) })), (c) => {
    try {
      editNote(db, c.req.param("id"), c.req.valid("json").text);
      return c.json({ ok: true });
    } catch (e) {
      return refusing(c, e);
    }
  });
  app.delete("/api/notes/note/:id", (c) => {
    deleteNote(db, c.req.param("id"));
    return c.json({ ok: true });
  });
  app.post(
    "/api/notes/ask",
    zValidator("json", z.object({ documents: z.array(z.string()).min(1).max(10), speed: z.enum(["careful", "fast"]) })),
    (c) => {
      try {
        const { documents, speed } = c.req.valid("json");
        const made = startDraft(db, settings, { documentIds: documents, speed });
        made.done.catch(() => {}); // the draft row carries any failure; nothing to throw here
        return c.json({ id: made.id });
      } catch (e) {
        return refusing(c, e);
      }
    },
  );
  app.get("/api/notes/drafts/:id", (c) => {
    const draft = getDraft(db, c.req.param("id"));
    return draft ? c.json(draft) : c.json({ error: "no such draft" }, 404);
  });
  app.post("/api/notes/drafts/:id/discard", (c) => {
    discardDraft(db, c.req.param("id"));
    return c.json({ ok: true });
  });
  app.get("/api/notes/documents/:id/draft", (c) => c.json({ draft: draftFor(db, c.req.param("id")) }));
  // keep: the review's kept changes, by their place in the document's list; left out, every change is saved
  const SaveBody = z.object({
    document: z.string().min(1),
    keep: z.array(z.number().int().min(0).max(10_000)).max(1000).optional(),
  });
  app.post("/api/notes/drafts/:id/save", zValidator("json", SaveBody), (c) => {
    try {
      const { document, keep } = c.req.valid("json");
      const saved = saveDraft(db, c.req.param("id"), document, keep);
      const name = (db.prepare("SELECT name FROM documents WHERE id = ?").get(document) as { name: string } | undefined)
        ?.name;
      record("notes", `Saved changes to ${name ?? "a document"}`, `/notes/${encodeURIComponent(document)}`);
      return c.json(saved);
    } catch (e) {
      return refusing(c, e);
    }
  });
  // my own edit of the text, made on the revision it names; a newer revision answers 409 with it
  app.post(
    "/api/notes/documents/:id/text",
    zValidator("json", z.object({ text: z.string().max(MAX_BYTES), rev: z.string().min(1).max(100) })),
    (c) => {
      const id = c.req.param("id");
      const { text, rev } = c.req.valid("json");
      try {
        const saved = saveText(db, id, text, rev);
        const name = (db.prepare("SELECT name FROM documents WHERE id = ?").get(id) as { name: string } | undefined)
          ?.name;
        if (saved.rev !== rev) record("notes", `Edited ${name ?? "a document"}`, `/notes/${encodeURIComponent(id)}`);
        return c.json(saved);
      } catch (e) {
        if (e instanceof Changed) return c.json({ error: e.message, rev: e.rev }, 409);
        return refusing(c, e);
      }
    },
  );
  app.post("/api/notes/documents/:id/undo", (c) => {
    try {
      return c.json(undoSave(db, c.req.param("id")));
    } catch (e) {
      return refusing(c, e);
    }
  });
  // a document's earlier versions, and one brought back (the current words kept as a version first)
  app.get("/api/notes/documents/:id/versions", (c) => c.json({ versions: listVersions(db, c.req.param("id")) }));
  app.post("/api/notes/documents/:id/versions/:vid/restore", (c) => {
    try {
      return c.json(restoreVersion(db, c.req.param("id"), c.req.param("vid")));
    } catch (e) {
      return refusing(c, e);
    }
  });
  app.post(
    "/api/notes/upload",
    // the file's own bytes, base64: the server judges the original encoding (review R2-6)
    zValidator(
      "json",
      z.object({
        name: z.string().min(1).max(200),
        bytes: z
          .string()
          .base64()
          .max(Math.max(MAX_BYTES, PDF_MAX_BYTES) * 2),
      }),
    ),
    async (c) => {
      try {
        const { name, bytes } = c.req.valid("json");
        const raw = Buffer.from(bytes, "base64");
        // a PDF becomes its text, read by the computer's own PDF engine (pdf.ts); anything else must be text already
        if (isPdf(name, raw)) return c.json(addUpload(db, name, await readPdf(raw), { fromPdf: true }));
        return c.json(addUpload(db, name, raw));
      } catch (e) {
        return refusing(c, e);
      }
    },
  );
}
