// The news' routes: the brief to show (today's, or a day's) with the run that is newer, the days kept, the sources'
// health, and Make it now (it runs in the background, Live follows it, and a second one waits its turn). A brief left
// running by a restart is marked failed when kestrel starts.
import type { DatabaseSync } from "node:sqlite";
import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { z } from "zod";
import { newsDays, newsState, sourcesHealth, startNews, sweepNews } from "../domain/news/brief.ts";
import { Refused } from "../domain/notes/documents.ts";
import type { Settings } from "../platform/config.ts";

export function mountNews(app: Hono, db: DatabaseSync, settings: Settings) {
  sweepNews(db);
  app.get(
    "/api/news",
    zValidator(
      "query",
      z.object({
        day: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "a day like 2026-11-24")
          .optional(),
      }),
    ),
    (c) => {
      const { day } = c.req.valid("query");
      const state = newsState(db, settings, day);
      if (day && !state.brief) return c.json({ error: "no brief was written that day" }, 404);
      return c.json(state);
    },
  );
  app.get("/api/news/days", (c) => c.json({ days: newsDays(db) }));
  app.get("/api/news/sources", (c) => c.json({ sources: sourcesHealth(db, new Date()) }));
  app.post("/api/news/run", (c) => {
    try {
      return c.json({ id: startNews(db, settings).id }, 202);
    } catch (e) {
      if (e instanceof Refused) return c.json({ error: e.message }, 400);
      throw e;
    }
  });
}
