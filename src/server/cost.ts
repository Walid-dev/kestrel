// The Cost route and the links: what the models did and what it would have cost, read only from oMLX's table and my
// prices.json; and the other apps Home opens (my chats), from settings.json.
import { join } from "node:path";
import type { Hono } from "hono";
import { costReport, PERIODS } from "../domain/cost.ts";
import type { Settings } from "../platform/config.ts";
import { dataDir } from "../platform/paths.ts";

export function mountCost(app: Hono, settings: Settings) {
  app.get("/api/cost", (c) => {
    const days = c.req.query("days") ?? "30";
    if (!PERIODS.includes(days)) return c.json({ error: "send ?days=1, 7, 30 or all" }, 400);
    try {
      return c.json(costReport(settings.omlxHome, join(dataDir(), "prices.json"), days));
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 503);
    }
  });
  app.get("/api/links", (c) => c.json({ links: settings.links }));
}
