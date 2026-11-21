// The Models routes, mounted on the one app by main.ts: what the door offers, which model each use runs on, and
// the switch — refused when the door is down or doesn't offer the pick, rather than guessing.
import type { DatabaseSync } from "node:sqlite";
import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { z } from "zod";
import { doorModels, listUses, setModelFor, USES } from "../domain/models.ts";
import type { Settings } from "../platform/config.ts";

export function mountModels(app: Hono, db: DatabaseSync, settings: Settings) {
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
}
