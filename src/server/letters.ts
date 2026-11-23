// Writing's routes: my voice and stories (read, and saved with the previous version kept), the jobs a text can be
// written for, a try (a cover letter, an answer or any text; it runs in the background and Live follows it), the
// tries, one try whole, and a letter's PDF.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { z } from "zod";
import {
  deleteLetter,
  getLetter,
  labMissing,
  letterJobs,
  letterPdf,
  listLetters,
  readFiles,
  reviewForApplication,
  startLetter,
  sweepLetters,
} from "../domain/letters.ts";
import { openFile, Refused } from "../domain/notes/documents.ts";
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
  // my voice and stories open in Notes, where they are reworked and every save is kept as a version
  app.post("/api/letters/files/:which/open", (c) => {
    const which = c.req.param("which");
    if (which !== "voice" && which !== "stories") return c.json({ error: "only the voice and the stories" }, 400);
    try {
      return c.json(openFile(db, settings, join(settings.apply.folder, `${which}.md`)));
    } catch (e) {
      return refusing(c, e);
    }
  });
  app.get("/api/letters/jobs", (c) => c.json({ jobs: letterJobs(db) }));
  app.post(
    "/api/letters",
    zValidator(
      "json",
      z.object({
        listing: z.string().min(1),
        kind: z.enum(["letter", "answer", "text"]).default("letter"),
        ask: z.string().max(4000).default(""),
      }),
    ),
    (c) => {
      try {
        const { listing, kind, ask } = c.req.valid("json");
        return c.json({ id: startLetter(db, settings, listing, kind, ask) }, 202);
      } catch (e) {
        return refusing(c, e);
      }
    },
  );
  app.get("/api/letters", (c) => c.json({ letters: listLetters(db, c.req.query("listing") || undefined) }));
  app.get("/api/letters/:id", (c) => {
    const r = getLetter(db, c.req.param("id"));
    return r ? c.json(r) : c.json({ error: "no such try" }, 404);
  });
  // the applications' review (the apply skill's apply-review): a text and its posting in, the review and its better
  // version out; it waits for the model, a minute or two
  app.post(
    "/api/letters/review",
    zValidator(
      "json",
      z.object({
        text: z.string().min(40).max(20_000),
        job: z.string().min(200).max(60_000),
        title: z.string().max(200).optional(),
        org: z.string().max(200).optional(),
        kind: z.enum(["letter", "answer", "text"]).optional(),
        ask: z.string().max(4000).optional(),
      }),
    ),
    async (c) => {
      try {
        return c.json(await reviewForApplication(db, settings, c.req.valid("json")));
      } catch (e) {
        return refusing(c, e);
      }
    },
  );
  app.delete("/api/letters/:id", (c) => {
    try {
      deleteLetter(db, c.req.param("id"));
      return c.json({ ok: true });
    } catch (e) {
      return refusing(c, e);
    }
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
