// Research's routes: ask (quick or deep, it runs in the background and Live follows it), the kept reports, one
// report whole, and a delete. A report left running by a restart is marked failed when kestrel starts.
import type { DatabaseSync } from "node:sqlite";
import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { z } from "zod";
import { Refused } from "../domain/notes/documents.ts";
import { deleteResearch, getResearch, listResearch, startResearch, sweepResearch } from "../domain/research.ts";
import type { Settings } from "../platform/config.ts";

export function mountResearch(app: Hono, db: DatabaseSync, settings: Settings) {
  sweepResearch(db);
  app.post(
    "/api/research",
    zValidator("json", z.object({ question: z.string().min(1).max(1000), level: z.enum(["quick", "deep"]) })),
    (c) => {
      try {
        return c.json({ id: startResearch(db, settings, c.req.valid("json")) }, 202);
      } catch (e) {
        if (e instanceof Refused) return c.json({ error: e.message }, 400);
        throw e;
      }
    },
  );
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
