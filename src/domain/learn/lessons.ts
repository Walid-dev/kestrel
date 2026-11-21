// The one lesson shape: say (the lines spoken first), explain, an example, the words with their meanings, and the
// check questions. Packs group lessons; a prepared answer is a lesson whose say lines are the answer.
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { Refused } from "../notes/documents.ts";

export const LessonBody = z.object({
  say: z.array(z.string()).default([]),
  explain: z.array(z.string()).default([]),
  example: z.string().default(""),
  words: z.array(z.object({ w: z.string(), m: z.string() })).default([]),
  check: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
});
export type LessonBody = z.infer<typeof LessonBody>;
export type Lesson = { id: string; pack: string; position: number; title: string; body: LessonBody };
export type Pack = { id: string; name: string; kind: "lesson-pack" | "answer-pack"; lessons: number };

export function addPack(db: DatabaseSync, name: string, kind: Pack["kind"] = "lesson-pack", id = randomUUID()): string {
  db.prepare("INSERT INTO packs (id, name, kind, added_at) VALUES (?, ?, ?, ?)").run(
    id,
    name,
    kind,
    new Date().toISOString(),
  );
  return id;
}

export function addLesson(
  db: DatabaseSync,
  pack: string,
  title: string,
  body: unknown,
  position = 0,
  id = randomUUID(),
): Lesson {
  const read = LessonBody.safeParse(body ?? {});
  if (!read.success) throw new Refused(`the lesson's shape is wrong: ${read.error.issues[0]?.message ?? ""}`);
  if (title.trim() === "") throw new Refused("a lesson needs its title");
  db.prepare("INSERT INTO lessons (id, pack, position, title, body, added_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    id,
    pack,
    position,
    title.trim(),
    JSON.stringify(read.data),
    new Date().toISOString(),
  );
  return { id, pack, position, title: title.trim(), body: read.data };
}

const row = (r: Record<string, unknown>): Lesson => ({
  id: String(r.id),
  pack: String(r.pack),
  position: Number(r.position),
  title: String(r.title),
  body: LessonBody.parse(JSON.parse(String(r.body))),
});

export function listPacks(db: DatabaseSync): Pack[] {
  return (
    db
      .prepare(
        "SELECT p.id, p.name, p.kind, COUNT(l.id) AS lessons FROM packs p LEFT JOIN lessons l ON l.pack = p.id GROUP BY p.id ORDER BY p.added_at",
      )
      .all() as Record<string, unknown>[]
  ).map((r) => ({ id: String(r.id), name: String(r.name), kind: r.kind as Pack["kind"], lessons: Number(r.lessons) }));
}

export function listLessons(db: DatabaseSync, pack: string): Lesson[] {
  return (
    db.prepare("SELECT * FROM lessons WHERE pack = ? ORDER BY position, added_at").all(pack) as Record<
      string,
      unknown
    >[]
  ).map(row);
}

export function getLesson(db: DatabaseSync, id: string): Lesson | null {
  const r = db.prepare("SELECT * FROM lessons WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? row(r) : null;
}

// a plain-text search across titles, say lines and words
export function searchLessons(db: DatabaseSync, q: string, limit = 30): Lesson[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const rows = (db.prepare("SELECT * FROM lessons").all() as Record<string, unknown>[]).map(row);
  return rows
    .filter((l) =>
      `${l.title} ${l.body.say.join(" ")} ${l.body.words.map((w) => w.w).join(" ")}`.toLowerCase().includes(needle),
    )
    .slice(0, limit);
}
