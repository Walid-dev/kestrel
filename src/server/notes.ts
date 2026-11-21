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
