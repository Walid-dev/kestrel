// The Tasks routes, mounted on the one app by main.ts: the list, a new task, an edit, a delete, my own tick, an agent's
// close with its note, reopen. An agent uses them through the kestrel command; a Refused answers 400 with its reason.
import type { DatabaseSync } from "node:sqlite";
import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { z } from "zod";
import { Refused } from "../domain/notes/documents.ts";
import { addTask, checkTask, closeTask, deleteTask, editTask, listTasks, reopenTask } from "../domain/tasks/tasks.ts";
import { record } from "../platform/activity.ts";

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
    zValidator("json", z.object({ text: z.string().min(1).max(2000), who: z.string().max(80).default("") })),
    (c) => {
      try {
        const { text, who } = c.req.valid("json");
        const made = addTask(db, text, who);
        record("task", `New task: ${made.text}`, "/tasks");
        return c.json(made);
      } catch (e) {
        return refusing(c, e);
      }
    },
  );
  app.post("/api/tasks/:id/close", zValidator("json", z.object({ note: z.string().min(1).max(500) })), (c) => {
    try {
      const done = closeTask(db, c.req.param("id"), c.req.valid("json").note);
      record("task", `Done: ${done.text}`, "/tasks", done.note);
      return c.json(done);
    } catch (e) {
      return refusing(c, e);
    }
  });
  app.patch(
    "/api/tasks/:id",
    zValidator("json", z.object({ text: z.string().max(2000).optional(), who: z.string().max(80).optional() })),
    (c) => {
      try {
        return c.json(editTask(db, c.req.param("id"), c.req.valid("json")));
      } catch (e) {
        return refusing(c, e);
      }
    },
  );
  app.delete("/api/tasks/:id", (c) => {
    try {
      deleteTask(db, c.req.param("id"));
      return c.json({ ok: true });
    } catch (e) {
      return refusing(c, e);
    }
  });
  app.post("/api/tasks/:id/check", (c) => {
    try {
      const done = checkTask(db, c.req.param("id"));
      record("task", `Done: ${done.text}`, "/tasks");
      return c.json(done);
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
