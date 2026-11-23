// The Ask routes, the same for every app: a page's conversation (read it, ask, start over). The answer streams into
// its row; the page reads the conversation again while one is writing. A Refused answers 400 with its reason.
import type { DatabaseSync } from "node:sqlite";
import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { z } from "zod";
import { ASK_APPS, askPage, clearConversation, conversation, sweepAsks } from "../domain/ask/ask.ts";
import { Refused } from "../domain/notes/documents.ts";
import type { Settings } from "../platform/config.ts";

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
