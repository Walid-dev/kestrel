// The Notes routes, mounted on the one app by main.ts: the documents list, the files the folders offer, open,
// upload, and one document with its text. A Refused from the domain answers 400 with its reason.

import type { DatabaseSync } from "node:sqlite";
import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { z } from "zod";
import {
  addUpload,
  getDocument,
  listDocuments,
  listFiles,
  MAX_BYTES,
  openFile,
  Refused,
} from "../domain/notes/documents.ts";
import { discardDraft, draftFor, getDraft, startDraft } from "../domain/notes/drafts.ts";
import { addNote, deleteNote, editNote, listNotes } from "../domain/notes/notes.ts";
import type { Settings } from "../platform/config.ts";

export function mountNotes(app: Hono, db: DatabaseSync, settings: Settings) {
  const refusing = (c: { json: (o: unknown, s: 400 | 500) => Response }, e: unknown) => {
    if (e instanceof Refused) return c.json({ error: e.message }, 400);
    throw e;
  };

  app.get("/api/notes/documents", (c) => c.json({ documents: listDocuments(db) }));
  app.get("/api/notes/files", (c) => c.json({ files: listFiles(settings) }));
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
  app.post(
    "/api/notes/upload",
    zValidator("json", z.object({ name: z.string().min(1).max(200), text: z.string().max(MAX_BYTES * 2) })),
    (c) => {
      try {
        const { name, text } = c.req.valid("json");
        return c.json(addUpload(db, name, text));
      } catch (e) {
        return refusing(c, e);
      }
    },
  );
}
