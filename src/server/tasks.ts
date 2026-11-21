// The Tasks routes, mounted on the one app by main.ts: the list, a new line, close with its note, reopen. An agent
// uses them through the kestrel command; a Refused answers 400 with its reason.
import type { DatabaseSync } from "node:sqlite";
import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { z } from "zod";
import { Refused } from "../domain/notes/documents.ts";
import { addTask, closeTask, listTasks, reopenTask } from "../domain/tasks/tasks.ts";

export function mountTasks(app: Hono, db: DatabaseSync) {
  const refusing = (c: { json: (o: unknown, s: 400 | 500) => Response }, e: unknown) => {
    if (e instanceof Refused) return c.json({ error: e.message }, 400);
    throw e;
  };

  app.get("/api/tasks", (c) => {
    const which = c.req.query("which");
    return c.json({ tasks: listTasks(db, which === "open" || which === "done" ? which : "all") });
  });
  app.post(
    "/api/tasks",
    zValidator("json", z.object({ text: z.string().min(1).max(500), who: z.string().max(80).default("") })),
    (c) => {
      try {
        const { text, who } = c.req.valid("json");
        return c.json(addTask(db, text, who));
      } catch (e) {
        return refusing(c, e);
      }
    },
  );
  app.post("/api/tasks/:id/close", zValidator("json", z.object({ note: z.string().min(1).max(500) })), (c) => {
    try {
      return c.json(closeTask(db, c.req.param("id"), c.req.valid("json").note));
    } catch (e) {
      return refusing(c, e);
    }
  });
  app.post("/api/tasks/:id/reopen", (c) => {
    try {
      return c.json(reopenTask(db, c.req.param("id")));
    } catch (e) {
      return refusing(c, e);
    }
  });
}
