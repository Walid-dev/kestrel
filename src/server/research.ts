// Research's routes: ask (quick or deep, it runs in the background and Live follows it), the kept reports, one
// report whole, and a delete. A report left running by a restart is marked failed when kestrel starts.
import type { DatabaseSync } from "node:sqlite";
import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { z } from "zod";
import { Refused } from "../domain/notes/documents.ts";
import {
  askFirst,
  deleteResearch,
  getResearch,
  listResearch,
  researchContext,
  saveAbout,
  startResearch,
  sweepResearch,
} from "../domain/research.ts";
import type { Settings } from "../platform/config.ts";

export function mountResearch(app: Hono, db: DatabaseSync, settings: Settings) {
  sweepResearch(db);
  app.post(
    "/api/research",
    zValidator(
      "json",
      z.object({
        question: z.string().min(1).max(1000),
        level: z.enum(["quick", "deep"]),
        answers: z
          .array(z.object({ q: z.string().max(300), a: z.string().max(1000) }))
          .max(5)
          .optional(),
      }),
    ),
    (c) => {
      try {
        return c.json({ id: startResearch(db, settings, c.req.valid("json")) }, 202);
      } catch (e) {
        if (e instanceof Refused) return c.json({ error: e.message }, 400);
        throw e;
      }
    },
  );
  // its questions first, when the answer depends on me
  app.post("/api/research/ask", zValidator("json", z.object({ question: z.string().min(1).max(1000) })), async (c) => {
    try {
      return c.json({ questions: await askFirst(db, settings, c.req.valid("json").question) });
    } catch (e) {
      if (e instanceof Refused) return c.json({ error: e.message }, 400);
      throw e;
    }
  });
  // what it knows about me: About me, and the files in the context folder
  app.get("/api/research/context", (c) => c.json(researchContext()));
  app.put("/api/research/context", zValidator("json", z.object({ about: z.string().max(20_000) })), (c) => {
    try {
      saveAbout(c.req.valid("json").about);
      return c.json({ ok: true });
    } catch (e) {
      if (e instanceof Refused) return c.json({ error: e.message }, 400);
      throw e;
    }
  });
  app.get("/api/research", (c) => c.json({ research: listResearch(db) }));
  app.get("/api/research/:id", (c) => {
    const r = getResearch(db, c.req.param("id"));
    return r ? c.json(r) : c.json({ error: "no such research" }, 404);
  });
  app.delete("/api/research/:id", (c) => {
    try {
      deleteResearch(db, c.req.param("id"));
      return c.json({ ok: true });
    } catch (e) {
      if (e instanceof Refused) return c.json({ error: e.message }, 400);
      throw e;
    }
  });
}
