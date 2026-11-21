// The Models routes, mounted on the one app by main.ts: what the door offers, which model each use runs on, and
// the switch — refused when the door is down or doesn't offer the pick, rather than guessing.
import type { DatabaseSync } from "node:sqlite";
import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { z } from "zod";
import { EAR } from "../ai/asr.ts";
import { doorModels, listUses, setModelFor, USES } from "../domain/models.ts";
import type { Settings } from "../platform/config.ts";

export function mountModels(app: Hono, db: DatabaseSync, settings: Settings) {
  // the door's ear (the transcription model) is not a chat model, so the picks never offer it
  const chatDoor = async () => (await doorModels(settings)).filter((id) => !EAR.test(id));
  app.get("/api/models", async (c) => c.json({ door: await chatDoor(), uses: listUses(db, settings) }));
  // what the models cost: time, counted from every recorded call — local models charge nothing else
  app.get("/api/models/calls", (c) => {
    const rows = db
      .prepare(
        `SELECT purpose, model, COUNT(*) AS calls, ROUND(AVG(ms) / 1000.0, 1) AS seconds, MAX(at) AS last,
                SUM(outcome != 'ok') AS failed
         FROM model_calls GROUP BY purpose, model ORDER BY MAX(at) DESC LIMIT 30`,
      )
      .all();
    return c.json({ calls: rows });
  });
  app.post(
    "/api/models",
    zValidator(
      "json",
      z.object({ use: z.enum(USES.map((u) => u.use) as [string, ...string[]]), model: z.string().min(1).max(200) }),
    ),
    async (c) => {
      const { use, model } = c.req.valid("json");
      // a pick must be a model the door offers right now; a down door refuses the switch rather than guessing
      const door = await chatDoor();
      if (door.length === 0) return c.json({ error: "the model door isn't answering: try again when it's up" }, 400);
      if (!door.includes(model)) return c.json({ error: "the door doesn't offer that model" }, 400);
      setModelFor(db, use as (typeof USES)[number]["use"], model);
      return c.json({ ok: true });
    },
  );
}
