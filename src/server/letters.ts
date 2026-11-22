// The cover letter lab's routes: my voice and stories (read, and saved with the previous version kept), the jobs a
// letter can be tried for, a try (it runs in the background, Live follows it), the tries, one try whole, its PDF.
import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { z } from "zod";
import {
  getLetter,
  labMissing,
  letterJobs,
  letterPdf,
  listLetters,
  readFiles,
  saveFile,
  startLetter,
  sweepLetters,
} from "../domain/letters.ts";
import { Refused } from "../domain/notes/documents.ts";
import type { Settings } from "../platform/config.ts";

export function mountLetters(app: Hono, db: DatabaseSync, settings: Settings) {
  sweepLetters(db);
  const refusing = (c: { json: (o: unknown, s: 400) => Response }, e: unknown) => {
    if (e instanceof Refused) return c.json({ error: e.message }, 400);
    throw e;
  };
  app.get("/api/letters/files", (c) => {
    const missing = labMissing(settings);
    return c.json(missing ? { ready: false, why: missing } : { ready: true, ...readFiles(settings) });
  });
  app.put("/api/letters/files/:which", zValidator("json", z.object({ text: z.string().max(400_000) })), (c) => {
    const which = c.req.param("which");
    if (which !== "voice" && which !== "stories") return c.json({ error: "only the voice and the stories" }, 400);
    try {
      saveFile(settings, which, c.req.valid("json").text);
      return c.json({ ok: true });
    } catch (e) {
      return refusing(c, e);
    }
  });
  app.get("/api/letters/jobs", (c) => c.json({ jobs: letterJobs(db) }));
  app.post("/api/letters", zValidator("json", z.object({ listing: z.string().min(1) })), (c) => {
    try {
      return c.json({ id: startLetter(db, settings, c.req.valid("json").listing) }, 202);
    } catch (e) {
      return refusing(c, e);
    }
  });
  app.get("/api/letters", (c) => c.json({ letters: listLetters(db, c.req.query("listing") || undefined) }));
  app.get("/api/letters/:id", (c) => {
    const r = getLetter(db, c.req.param("id"));
    return r ? c.json(r) : c.json({ error: "no such try" }, 404);
  });
  app.get("/api/letters/:id/pdf", (c) => {
    const file = letterPdf(c.req.param("id"));
    if (!file) return c.json({ error: "this try has no PDF" }, 404);
    return c.body(readFileSync(file), 200, {
      "content-type": "application/pdf",
      "content-disposition": "inline",
      "cache-control": "no-store",
    });
  });
}
