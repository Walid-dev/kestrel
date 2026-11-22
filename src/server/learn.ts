// The Learn routes, mounted on the one app by main.ts: packs by area (Learn, Interview prep), the front page's
// overview, lessons, search, Ask, the review ladder, and the interview helper's ears — sound in, the nearest prepared
// answer out. A Refused from the domain answers 400 with its reason.
import type { DatabaseSync } from "node:sqlite";
import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { z } from "zod";
import { hear } from "../ai/asr.ts";
import { askLesson } from "../domain/learn/ask.ts";
import type { Area } from "../domain/learn/lessons.ts";
import {
  addLesson,
  addPack,
  getLesson,
  listLessons,
  listPacks,
  searchLessons,
  setPackArea,
  setPackGroup,
} from "../domain/learn/lessons.ts";
import { bestAnswer } from "../domain/learn/match.ts";
import { gradeAnswer, makeQuestion, pickQuiz } from "../domain/learn/quiz.ts";
import { dueLessons, gradeLesson, lessonStates, neverGraded } from "../domain/learn/review.ts";
import { Refused } from "../domain/notes/documents.ts";
import { record } from "../platform/activity.ts";
import type { Settings } from "../platform/config.ts";

const MAX_SOUND_BYTES = 2_000_000; // the ears take 2 MB at most: about a minute of 16 kHz speech
const area = (v: string | undefined): Area | undefined => (v === "learn" || v === "interview" ? v : undefined);

export function mountLearn(app: Hono, db: DatabaseSync, settings: Settings) {
  const refusing = (c: { json: (o: unknown, s: 400 | 500) => Response }, e: unknown) => {
    if (e instanceof Refused) return c.json({ error: e.message }, 400);
    throw e;
  };

  app.get("/api/learn/packs", (c) => c.json({ packs: listPacks(db, area(c.req.query("area"))) }));
  app.get("/api/learn/overview", (c) => {
    const where = area(c.req.query("area")) ?? "learn";
    const lessons = lessonStates(db, where, new Date());
    const count = (s: string) => lessons.filter((l) => l.state === s).length;
    return c.json({
      summary: { due: count("due"), new: count("new"), learning: count("learning"), known: count("known") },
      packs: listPacks(db, where),
      lessons,
    });
  });
  app.post("/api/learn/packs/:id/area", zValidator("json", z.object({ area: z.enum(["learn", "interview"]) })), (c) => {
    try {
      setPackArea(db, c.req.param("id"), c.req.valid("json").area);
      return c.json({ ok: true });
    } catch (e) {
      return refusing(c, e);
    }
  });
  app.post("/api/learn/packs/:id/group", zValidator("json", z.object({ group: z.string().max(40) })), (c) => {
    try {
      setPackGroup(db, c.req.param("id"), c.req.valid("json").group);
      return c.json({ ok: true });
    } catch (e) {
      return refusing(c, e);
    }
  });
  app.get("/api/learn/packs/:id", (c) =>
    c.json({
      lessons: listLessons(db, c.req.param("id")).map(({ body, ...l }) => ({
        ...l,
        part: body.part,
        short: body.short,
        checks: body.check.length,
      })),
    }),
  );
  app.get("/api/learn/lessons/:id", (c) => {
    const lesson = getLesson(db, c.req.param("id"));
    if (!lesson) return c.json({ error: "no such lesson" }, 404);
    const r = db.prepare("SELECT due, level FROM reviews WHERE lesson = ?").get(lesson.id) as
      | { due: string; level: number }
      | undefined;
    const pack = db.prepare("SELECT name, area FROM packs WHERE id = ?").get(lesson.pack) as
      | { name: string; area: Area }
      | undefined;
    const state = !r ? "new" : r.due <= new Date().toISOString() ? "due" : r.level >= 3 ? "known" : "learning";
    return c.json({ ...lesson, state, packName: pack?.name ?? "", area: pack?.area ?? "learn" });
  });
  app.get("/api/learn/search", (c) =>
    c.json({
      lessons: searchLessons(db, c.req.query("q") ?? "", area(c.req.query("area"))).map(({ body, ...l }) => ({
        ...l,
        short: body.short,
      })),
    }),
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
  // the quiz: questions picked from the lessons, a question made for a lesson without one, an answer marked
  app.get("/api/learn/quiz", (c) =>
    c.json({
      items: pickQuiz(
        db,
        {
          area: area(c.req.query("area")) ?? "learn",
          pack: c.req.query("pack") || undefined,
          group: c.req.query("group") || undefined,
          count: Number(c.req.query("count") ?? "10") || 10,
        },
        new Date(),
      ),
    }),
  );
  app.post("/api/learn/quiz/make", zValidator("json", z.object({ lesson: z.string().min(1) })), async (c) => {
    try {
      return c.json(await makeQuestion(db, settings, c.req.valid("json").lesson));
    } catch (e) {
      return refusing(c, e);
    }
  });
  app.post(
    "/api/learn/quiz/grade",
    zValidator(
      "json",
      z.object({
        lesson: z.string().min(1),
        question: z.string().min(1).max(4000),
        expected: z.string().max(8000),
        answer: z.string().min(1).max(4000),
      }),
    ),
    async (c) => {
      try {
        return c.json(await gradeAnswer(db, settings, c.req.valid("json")));
      } catch (e) {
        return refusing(c, e);
      }
    },
  );
  app.get("/api/learn/due", (c) => {
    const ids = [...new Set([...dueLessons(db, new Date()), ...neverGraded(db)])];
    const which = area(c.req.query("area")) ?? "learn";
    const lessons = ids
      .map((id) => getLesson(db, id))
      .filter((l) => l !== null)
      .filter((l) => {
        const p = db.prepare("SELECT area FROM packs WHERE id = ?").get(l.pack) as { area: string } | undefined;
        return p?.area === which;
      })
      .slice(0, 20);
    return c.json({ lessons });
  });
  app.post(
    "/api/learn/grade",
    zValidator("json", z.object({ lesson: z.string().min(1), grade: z.enum(["again", "good"]) })),
    (c) => {
      const { lesson, grade } = c.req.valid("json");
      if (!getLesson(db, lesson)) return c.json({ error: "no such lesson" }, 400);
      const got = gradeLesson(db, lesson, grade, new Date());
      const title = getLesson(db, lesson)?.title ?? "a lesson";
      record(
        "lesson",
        `${grade === "good" ? "Knew it" : "Again"}: ${title}`,
        `/learn/lesson/${encodeURIComponent(lesson)}`,
        `next review in ${got.intervalDays} day${got.intervalDays === 1 ? "" : "s"}`,
      );
      return c.json(got);
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
    async (c, next) => {
      // a lesson is words, not a payload: refuse anything over the cap before reading it
      if (Number(c.req.header("content-length") ?? "0") > 300_000)
        return c.json({ error: "that lesson is too big to be a lesson" }, 400);
      return next();
    },
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
  // the interview helper: the phone's recording (a 16 kHz WAV) in, the heard words and the nearest prepared answer out
  app.post("/api/interview/hear", async (c) => {
    const kind = c.req.header("content-type") ?? "audio/wav";
    // the size is judged before the body is read, so a runaway recording never fills the memory
    if (Number(c.req.header("content-length") ?? "0") > MAX_SOUND_BYTES)
      return c.json({ error: "the recording is too long: a question fits in a minute" }, 400);
    const sound = await c.req.arrayBuffer();
    if (sound.byteLength === 0) return c.json({ error: "no sound arrived" }, 400);
    if (sound.byteLength > MAX_SOUND_BYTES)
      return c.json({ error: "the recording is too long: a question fits in a minute" }, 400);
    const heard = await hear(settings, sound, kind);
    if (heard.outcome !== "ok") return c.json({ error: heard.why }, 502);
    const near = bestAnswer(db, heard.text);
    return c.json({
      heard: heard.text,
      lesson: near ? getLesson(db, near.lesson) : null,
      score: near ? Math.round(near.score * 100) / 100 : 0,
    });
  });
}
