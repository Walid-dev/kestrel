// The Learn routes, mounted on the one app by main.ts: packs, lessons, search, Ask, the spaced rhythm, and Live —
// sound in, the nearest prepared answer out. A Refused from the domain answers 400 with its reason.
import type { DatabaseSync } from "node:sqlite";
import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { z } from "zod";
import { EAR, transcribe } from "../ai/asr.ts";
import { askLesson } from "../domain/learn/ask.ts";
import { addLesson, addPack, getLesson, listLessons, listPacks, searchLessons } from "../domain/learn/lessons.ts";
import { bestAnswer } from "../domain/learn/match.ts";
import { dueLessons, gradeLesson, neverGraded } from "../domain/learn/review.ts";
import { doorModels } from "../domain/models.ts";
import { Refused } from "../domain/notes/documents.ts";
import type { Settings } from "../platform/config.ts";

const MAX_SOUND_BYTES = 25_000_000; // a minute of phone audio is well under this

export function mountLearn(app: Hono, db: DatabaseSync, settings: Settings) {
  const refusing = (c: { json: (o: unknown, s: 400 | 500) => Response }, e: unknown) => {
    if (e instanceof Refused) return c.json({ error: e.message }, 400);
    throw e;
  };

  app.get("/api/learn/packs", (c) => c.json({ packs: listPacks(db) }));
  app.get("/api/learn/packs/:id", (c) =>
    c.json({
      lessons: listLessons(db, c.req.param("id")).map(({ body, ...l }) => ({ ...l, checks: body.check.length })),
    }),
  );
  app.get("/api/learn/lessons/:id", (c) => {
    const lesson = getLesson(db, c.req.param("id"));
    return lesson ? c.json(lesson) : c.json({ error: "no such lesson" }, 404);
  });
  app.get("/api/learn/search", (c) =>
    c.json({ lessons: searchLessons(db, c.req.query("q") ?? "").map(({ body, ...l }) => l) }),
  );
  app.post(
    "/api/learn/ask",
    zValidator("json", z.object({ lesson: z.string().min(1), question: z.string().min(1).max(2000) })),
    async (c) => {
      try {
        const { lesson, question } = c.req.valid("json");
        return c.json(await askLesson(db, settings, lesson, question));
      } catch (e) {
        return refusing(c, e);
      }
    },
  );
  app.get("/api/learn/due", (c) => {
    const ids = [...new Set([...dueLessons(db, new Date()), ...neverGraded(db)])].slice(0, 20);
    const lessons = ids.map((id) => getLesson(db, id)).filter((l) => l !== null);
    return c.json({ lessons });
  });
  app.post(
    "/api/learn/grade",
    zValidator("json", z.object({ lesson: z.string().min(1), grade: z.enum(["again", "good"]) })),
    (c) => {
      const { lesson, grade } = c.req.valid("json");
      return c.json(gradeLesson(db, lesson, grade, new Date()));
    },
  );
  app.post(
    "/api/learn/packs",
    zValidator(
      "json",
      z.object({
        name: z.string().min(1).max(120),
        kind: z.enum(["lesson-pack", "answer-pack"]).default("lesson-pack"),
      }),
    ),
    (c) => {
      const { name, kind } = c.req.valid("json");
      return c.json({ id: addPack(db, name, kind) });
    },
  );
  app.post(
    "/api/learn/lessons",
    zValidator(
      "json",
      z.object({
        pack: z.string().min(1),
        title: z.string().min(1).max(200),
        position: z.number().int().default(0),
        body: z.unknown(),
      }),
    ),
    (c) => {
      try {
        const { pack, title, position, body } = c.req.valid("json");
        return c.json(addLesson(db, pack, title, body, position));
      } catch (e) {
        return refusing(c, e);
      }
    },
  );
  // Live: the phone's sound in the body, the heard words and the nearest prepared answer back
  app.post("/api/learn/live", async (c) => {
    const kind = c.req.header("content-type") ?? "application/octet-stream";
    const sound = await c.req.arrayBuffer();
    if (sound.byteLength === 0) return c.json({ error: "no sound arrived" }, 400);
    if (sound.byteLength > MAX_SOUND_BYTES) return c.json({ error: "the recording is too long to send" }, 400);
    const ear = (await doorModels(settings)).find((id) => EAR.test(id));
    if (!ear) return c.json({ error: "the model door lists no ear right now" }, 502);
    const heard = await transcribe(settings, sound, kind, ear);
    if (heard.outcome !== "ok") return c.json({ error: heard.why }, 502);
    const near = bestAnswer(db, heard.text);
    return c.json({
      heard: heard.text,
      lesson: near ? getLesson(db, near.lesson) : null,
      score: near ? Math.round(near.score * 100) / 100 : 0,
    });
  });
}
