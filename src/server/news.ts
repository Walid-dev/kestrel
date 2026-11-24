// The news' routes: the brief to show (today's, or a day's) with the run that is newer, the days kept (a page at a
// time, for the rail and the history), a story found again, a day deleted, the sources' health, and Make it now (it
// runs in the background, Live follows it, and a second one waits its turn). A brief left running by a restart is
// marked failed when kestrel starts. A request that doesn't read answers 400 with its reason in plain words.
import type { DatabaseSync } from "node:sqlite";
import { zValidator } from "@hono/zod-validator";
import type { Context, Hono } from "hono";
import { z } from "zod";
import { newsState, sourcesHealth, startNews, sweepNews } from "../domain/news/brief.ts";
import { daysKept, deleteDay, findStories, newsDays } from "../domain/news/days.ts";
import { Refused } from "../domain/notes/documents.ts";
import { newsOf, type Settings } from "../platform/config.ts";

// a day that can be: 2026-02-30 is refused here (400), so a 404 is always a real day with no brief
const DAY = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "a day like 2026-11-24")
  .refine((d) => {
    const t = Date.parse(`${d}T12:00:00Z`);
    return !Number.isNaN(t) && new Date(t).toISOString().startsWith(d);
  }, "a day like 2026-11-24");
const UP_TO_100 = "a number from 1 to 100";

// the validator's refusal, as the page shows it: its first reason, not the whole report (the news routes are the first
// to answer so; the others still send zod's report, which the page shows as it is)
const plainly = (r: { success: boolean; error?: { issues: { message: string }[] } }, c: Context) =>
  r.success
    ? undefined
    : c.json({ error: r.error?.issues[0]?.message ?? "that request isn't one kestrel understands" }, 400);

export function mountNews(app: Hono, db: DatabaseSync, settings: Settings) {
  sweepNews(db);
  app.get("/api/news", zValidator("query", z.object({ day: DAY.optional() }), plainly), (c) => {
    const { day } = c.req.valid("query");
    const state = newsState(db, settings, day);
    if (day && !state.brief) return c.json({ error: "no brief was written that day" }, 404);
    return c.json(state);
  });
  app.get(
    "/api/news/days",
    zValidator(
      "query",
      z.object({
        before: DAY.optional(),
        limit: z.coerce.number(UP_TO_100).int(UP_TO_100).min(1, UP_TO_100).max(100, UP_TO_100).default(60),
      }),
      plainly,
    ),
    (c) => {
      const { before, limit } = c.req.valid("query");
      return c.json({ days: newsDays(db, limit, before), ...daysKept(db) });
    },
  );
  // a day deleted, every run of it; refused while one is written, and today's while the morning may write it again
  app.delete("/api/news/days/:day", zValidator("param", z.object({ day: DAY }), plainly), (c) => {
    try {
      const morning = { news: newsOf(settings), now: new Date() };
      if (!deleteDay(db, c.req.valid("param").day, morning))
        return c.json({ error: "no brief was written that day" }, 404);
      return c.json({ ok: true });
    } catch (e) {
      if (e instanceof Refused) return c.json({ error: e.message }, 400);
      throw e;
    }
  });
  app.get(
    "/api/news/find",
    zValidator("query", z.object({ q: z.string().trim().min(1, "find what? a word or two").max(200) }), plainly),
    (c) => c.json(findStories(db, c.req.valid("query").q)),
  );
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
