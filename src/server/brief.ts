// The brief route: the morning's plain sentences, composed on request.
import type { DatabaseSync } from "node:sqlite";
import type { Hono } from "hono";
import { morningBrief } from "../domain/brief.ts";
import type { Settings } from "../platform/config.ts";

export function mountBrief(app: Hono, db: DatabaseSync, _settings: Settings) {
  app.get("/api/brief", (c) => c.json({ lines: morningBrief(db, new Date()) }));
}
