// The Notes routes, mounted on the one app by main.ts: the documents list, the files the folders offer, open,
// upload, and one document with its text. A Refused from the domain answers 400 with its reason.

import type { DatabaseSync } from "node:sqlite";
import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { z } from "zod";
import { askLesson } from "../domain/learn/ask.ts";
import { addLesson, addPack, getLesson, listLessons, listPacks, searchLessons } from "../domain/learn/lessons.ts";
import { dueLessons, gradeLesson, neverGraded } from "../domain/learn/review.ts";
import { doorModels, listUses, setModelFor, USES } from "../domain/models.ts";
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
import { saveDraft, undoSave } from "../domain/notes/save.ts";
import type { Settings } from "../platform/config.ts";

export function mountNotes(app: Hono, db: DatabaseSync, settings: Settings) {
  const refusing = (c: { json: (o: unknown, s: 400 | 500) => Response }, e: unknown) => {
    if (e instanceof Refused) return c.json({ error: e.message }, 400);
    throw e;
  };

  app.get("/api/models", async (c) => c.json({ door: await doorModels(settings), uses: listUses(db, settings) }));
  app.post(
    "/api/models",
    zValidator(
      "json",
      z.object({ use: z.enum(USES.map((u) => u.use) as [string, ...string[]]), model: z.string().min(1).max(200) }),
    ),
    async (c) => {
      const { use, model } = c.req.valid("json");
      // a pick must be a model the door offers right now; a down door refuses the switch rather than guessing
      const door = await doorModels(settings);
      if (door.length === 0) return c.json({ error: "the model door isn't answering: try again when it's up" }, 400);
      if (!door.includes(model)) return c.json({ error: "the door doesn't offer that model" }, 400);
      setModelFor(db, use as (typeof USES)[number]["use"], model);
      return c.json({ ok: true });
    },
  );
  app.get("/api/learn/packs", (c) => c.json({ packs: listPacks(db) }));
  app.get("/api/learn/packs/:id", (c) =>
    c.json({
      lessons: listLessons(db, c.req.param("id")).map(({ body, ...l }) => ({ ...l, checks: body.check.length })),
    }),
  );
  app.get("/api/learn/lessons/:id", (c) => {
    const lesson = getLesson(db, c.req.param("id"));
    return lesson ? c.json(lesson) : c.json({ error: "no such lesson" }, 404);
  });
  app.get("/api/learn/search", (c) =>
    c.json({ lessons: searchLessons(db, c.req.query("q") ?? "").map(({ body, ...l }) => l) }),
  );
  app.post(
    "/api/learn/ask",
    zValidator("json", z.object({ lesson: z.string().min(1), question: z.string().min(1).max(2000) })),
    async (c) => {
      try {
        const { lesson, question } = c.req.valid("json");
        return c.json(await askLesson(db, settings, lesson, question));
      } catch (e) {
        return refusing(c, e);
      }
    },
  );
  app.get("/api/learn/due", (c) => {
    const ids = [...new Set([...dueLessons(db, new Date()), ...neverGraded(db)])].slice(0, 20);
    const lessons = ids.map((id) => getLesson(db, id)).filter((l) => l !== null);
    return c.json({ lessons });
  });
  app.post(
    "/api/learn/grade",
    zValidator("json", z.object({ lesson: z.string().min(1), grade: z.enum(["again", "good"]) })),
    (c) => {
      const { lesson, grade } = c.req.valid("json");
      return c.json(gradeLesson(db, lesson, grade, new Date()));
    },
  );
  app.post(
    "/api/learn/packs",
    zValidator(
      "json",
      z.object({
        name: z.string().min(1).max(120),
        kind: z.enum(["lesson-pack", "answer-pack"]).default("lesson-pack"),
      }),
    ),
    (c) => {
      const { name, kind } = c.req.valid("json");
      return c.json({ id: addPack(db, name, kind) });
    },
  );
  app.post(
    "/api/learn/lessons",
    zValidator(
      "json",
      z.object({
        pack: z.string().min(1),
        title: z.string().min(1).max(200),
        position: z.number().int().default(0),
        body: z.unknown(),
      }),
    ),
    (c) => {
      try {
        const { pack, title, position, body } = c.req.valid("json");
        return c.json(addLesson(db, pack, title, body, position));
      } catch (e) {
        return refusing(c, e);
      }
    },
  );
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
  app.post("/api/notes/drafts/:id/save", zValidator("json", z.object({ document: z.string().min(1) })), (c) => {
    try {
      return c.json(saveDraft(db, c.req.param("id"), c.req.valid("json").document));
    } catch (e) {
      return refusing(c, e);
    }
  });
  app.post("/api/notes/documents/:id/undo", (c) => {
    try {
      return c.json(undoSave(db, c.req.param("id")));
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
          .max(MAX_BYTES * 2),
      }),
    ),
    (c) => {
      try {
        const { name, bytes } = c.req.valid("json");
        return c.json(addUpload(db, name, Buffer.from(bytes, "base64")));
      } catch (e) {
        return refusing(c, e);
      }
    },
  );
}
