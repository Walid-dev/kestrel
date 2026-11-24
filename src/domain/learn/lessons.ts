// The one lesson shape. A lesson to say has say lines, an explanation, an example, words and checks; a guide topic
// carries its blocks as written (lines, entries, examples, diagrams, tables) with the same checks. Packs group
// lessons and live in an area: Learn, or Interview prep.
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { Refused } from "../notes/documents.ts";
import { DUE } from "./review.ts";

export const LessonBody = z.object({
  eyebrow: z.string().default(""), // the topic or the part, small above the title
  part: z.string().default(""), // a guide's part, so its contents can fold by part
  short: z.string().default(""), // the one-line lede under the title
  say: z.array(z.string()).default([]),
  explain: z.array(z.string()).default([]),
  example: z.string().default(""),
  words: z.array(z.object({ w: z.string(), m: z.string() })).default([]),
  check: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
  blocks: z.array(z.record(z.string(), z.unknown())).default([]), // a guide topic's blocks, rendered as written
});
export type LessonBody = z.infer<typeof LessonBody>;
export type Lesson = { id: string; pack: string; position: number; title: string; body: LessonBody };
export type Area = "learn" | "interview";
export type Pack = {
  id: string;
  name: string;
  kind: "lesson-pack" | "answer-pack";
  area: Area;
  group: string; // the parent it sits under in Learn (AI, Platform, My stack…); empty: none yet
  lessons: number;
  due: number; // its review date has come (review.ts says what due means)
  known: number;
};

export function addPack(
  db: DatabaseSync,
  name: string,
  kind: Pack["kind"] = "lesson-pack",
  id: string = randomUUID(),
  area: Area = kind === "answer-pack" ? "interview" : "learn",
): string {
  db.prepare("INSERT INTO packs (id, name, kind, area, added_at) VALUES (?, ?, ?, ?, ?)").run(
    id,
    name,
    kind,
    area,
    new Date().toISOString(),
  );
  return id;
}

export function setPackArea(db: DatabaseSync, id: string, area: Area): void {
  const got = db.prepare("UPDATE packs SET area = ? WHERE id = ?").run(area, id);
  if (got.changes === 0) throw new Refused("no such pack");
}

export function setPackGroup(db: DatabaseSync, id: string, group: string): void {
  const got = db.prepare("UPDATE packs SET grp = ? WHERE id = ?").run(group.trim().slice(0, 40), id);
  if (got.changes === 0) throw new Refused("no such pack");
}

export function addLesson(
  db: DatabaseSync,
  pack: string,
  title: string,
  body: unknown,
  position = 0,
  id: string = randomUUID(),
): Lesson {
  const read = LessonBody.safeParse(body ?? {});
  if (!read.success) throw new Refused(`the lesson's shape is wrong: ${read.error.issues[0]?.message ?? ""}`);
  if (title.trim() === "") throw new Refused("a lesson needs its title");
  if (!db.prepare("SELECT id FROM packs WHERE id = ?").get(pack)) throw new Refused("no such pack");
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

export function listPacks(db: DatabaseSync, area?: Area, now: Date = new Date()): Pack[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.kind, p.area, p.grp, COUNT(l.id) AS lessons,
              SUM(CASE WHEN ${DUE} THEN 1 ELSE 0 END) AS due,
              SUM(CASE WHEN r.level >= 3 THEN 1 ELSE 0 END) AS known
       FROM packs p LEFT JOIN lessons l ON l.pack = p.id LEFT JOIN reviews r ON r.lesson = l.id
       ${area ? "WHERE p.area = ?" : ""}
       GROUP BY p.id ORDER BY p.added_at`,
    )
    .all(now.toISOString(), ...(area ? [area] : [])) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    kind: r.kind as Pack["kind"],
    area: r.area as Area,
    group: String(r.grp ?? ""),
    lessons: Number(r.lessons),
    due: Number(r.due ?? 0),
    known: Number(r.known ?? 0),
  }));
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

// every line of a lesson as plain words, the blocks' too: for search, for Ask, for anything that reads the whole
export function lessonText(body: LessonBody): string[] {
  const out: string[] = [body.short, ...body.say, ...body.explain, body.example];
  const lineOf = (v: unknown): string =>
    typeof v === "string"
      ? v
      : v && typeof v === "object" && "like" in v
        ? String((v as { like: unknown }).like)
        : v && typeof v === "object" && "code" in v
          ? ""
          : "";
  const lines = (v: unknown) => (Array.isArray(v) ? v.map(lineOf) : [lineOf(v)]);
  for (const b of body.blocks) {
    if (typeof b.term === "string") out.push(`${b.term}${typeof b.full === "string" ? ` (${b.full})` : ""}`);
    for (const k of ["lines", "explain", "example", "text"]) if (k in b) out.push(...lines(b[k]));
    if (typeof b.title === "string") out.push(b.title);
    if (Array.isArray(b.items)) for (const it of b.items) out.push(...lines(it));
    if (Array.isArray(b.rows)) for (const r of b.rows) if (Array.isArray(r)) out.push(r.map(String).join(": "));
  }
  for (const w of body.words) out.push(`${w.w}: ${w.m}`);
  return out
    .map((s) =>
      s
        .replaceAll(/`([^`]+)`/g, "$1")
        .replaceAll(/\*\*([^*]+)\*\*/g, "$1")
        .trim(),
    )
    .filter(Boolean);
}

export function searchLessons(db: DatabaseSync, q: string, area?: Area, limit = 40): Lesson[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const rows = (
    db
      .prepare(`SELECT l.* FROM lessons l JOIN packs p ON p.id = l.pack ${area ? "WHERE p.area = ?" : ""}`)
      .all(...(area ? [area] : [])) as Record<string, unknown>[]
  ).map(row);
  const scored = rows
    .map((l) => {
      const title = l.title.toLowerCase().includes(needle) ? 2 : 0;
      const text = lessonText(l.body).join(" ").toLowerCase().includes(needle) ? 1 : 0;
      return { l, s: title + text };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map((x) => x.l);
}
