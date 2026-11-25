// The Ask routes, the same for every app: a page's conversation (read it, ask, start over), my tap on a change the
// model proposed, and Undo on one it made. The answer streams into its row; the page reads the conversation again
// while one is writing. A Refused answers 400 with its reason.
import type { DatabaseSync } from "node:sqlite";
import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { z } from "zod";
import { listApplications } from "../domain/apply/apply.ts";
import { ASK_APPS, actOn, askPage, clearConversation, conversation, sweepAsks, undoOn } from "../domain/ask/ask.ts";
import { Refused } from "../domain/notes/documents.ts";
import type { Settings } from "../platform/config.ts";
import { bus } from "./events.ts";

export function mountAsk(app: Hono, db: DatabaseSync, settings: Settings) {
  sweepAsks(db);
  const page = z.object({ app: z.enum(ASK_APPS), ref: z.string().min(1).max(300) });
  const refusing = (c: { json: (o: unknown, s: 400) => Response }, e: unknown) => {
    if (e instanceof Refused) return c.json({ error: e.message }, 400);
    throw e;
  };
  app.get("/api/ask", zValidator("query", page), (c) => {
    const { app: name, ref } = c.req.valid("query");
    return c.json({ messages: conversation(db, name, ref) });
  });
  app.post("/api/ask", zValidator("json", page.extend({ text: z.string().min(1).max(4000) })), (c) => {
    try {
      return c.json({ messages: askPage(db, settings, c.req.valid("json")).messages });
    } catch (e) {
      return refusing(c, e);
    }
  });
  // my tap on a card: the change runs; an application it queued rings the bus, so the live strip hears it
  const card = z.object({ id: z.string().min(1).max(80), card: z.number().int().min(0).max(9) });
  app.post("/api/ask/act", zValidator("json", card), (c) => {
    try {
      const messages = actOn(db, settings, c.req.valid("json"));
      bus.emit("change", { kind: "apply", counts: listApplications(db).counts });
      return c.json({ messages });
    } catch (e) {
      return refusing(c, e);
    }
  });
  // Undo on a card my tap ran (a stage, a delete): its change goes back, once
  app.post("/api/ask/undo", zValidator("json", card), (c) => {
    try {
      return c.json({ messages: undoOn(db, c.req.valid("json")) });
    } catch (e) {
      return refusing(c, e);
    }
  });
  app.delete("/api/ask", zValidator("query", page), (c) => {
    try {
      const { app: name, ref } = c.req.valid("query");
      clearConversation(db, name, ref);
      return c.json({ ok: true });
    } catch (e) {
      return refusing(c, e);
    }
  });
}
