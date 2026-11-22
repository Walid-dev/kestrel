// The spaced rhythm, the old Learn's ladder: each "I knew it" climbs one level and waits longer (1, 1, 3, 7, 16, 35
// days); "again" starts over tomorrow. Three in a row and a lesson counts as known.
import type { DatabaseSync } from "node:sqlite";

export const GAPS = [1, 1, 3, 7, 16, 35]; // days to the next review, by level (times in a row it was known)
export const KNOWN = 3;
const DAY = 86_400_000;

export function gradeLesson(
  db: DatabaseSync,
  lesson: string,
  grade: "again" | "good",
  now: Date,
): { due: string; intervalDays: number; level: number } {
  const r = db.prepare("SELECT level FROM reviews WHERE lesson = ?").get(lesson) as { level: number } | undefined;
  const level = grade === "again" ? 0 : Math.min((r?.level ?? 0) + 1, GAPS.length - 1);
  const interval = GAPS[level];
  const due = new Date(now.getTime() + interval * DAY).toISOString();
  db.prepare(
    `INSERT INTO reviews (lesson, due, interval_days, ease, level) VALUES (?, ?, ?, 2.5, ?)
     ON CONFLICT (lesson) DO UPDATE SET due = excluded.due, interval_days = excluded.interval_days, level = excluded.level`,
  ).run(lesson, due, interval, level);
  return { due, intervalDays: interval, level };
}

export function dueLessons(db: DatabaseSync, now: Date, limit = 20): string[] {
  return (
    db.prepare("SELECT lesson FROM reviews WHERE due <= ? ORDER BY due LIMIT ?").all(now.toISOString(), limit) as {
      lesson: string;
    }[]
  ).map((r) => r.lesson);
}

// a lesson never graded is due the moment it has a check question
export function neverGraded(db: DatabaseSync, limit = 20): string[] {
  return (
    db
      .prepare(
        "SELECT l.id FROM lessons l LEFT JOIN reviews r ON r.lesson = l.id WHERE r.lesson IS NULL AND l.body LIKE '%\"check\":[{%' ORDER BY l.added_at LIMIT ?",
      )
      .all(limit) as { id: string }[]
  ).map((r) => r.id);
}

export type LessonState = "due" | "new" | "learning" | "known";

// each lesson of an area with its state, for the front page: review today first, then new, learning, known
export function lessonStates(
  db: DatabaseSync,
  area: "learn" | "interview",
  now: Date,
): {
  id: string;
  title: string;
  pack: string;
  short: string;
  part: string;
  eyebrow: string;
  state: LessonState;
  position: number;
}[] {
  const rows = db
    .prepare(
      `SELECT l.id, l.title, l.pack, l.position, l.body, r.due, r.level FROM lessons l
       JOIN packs p ON p.id = l.pack LEFT JOIN reviews r ON r.lesson = l.id
       WHERE p.area = ? ORDER BY p.added_at, l.position`,
    )
    .all(area) as {
    id: string;
    title: string;
    pack: string;
    position: number;
    body: string;
    due: string | null;
    level: number | null;
  }[];
  const iso = now.toISOString();
  return rows.map((r) => {
    let short = "";
    let part = "";
    let eyebrow = "";
    try {
      const b = JSON.parse(r.body) as { short?: unknown; part?: unknown; eyebrow?: unknown };
      short = typeof b.short === "string" ? b.short : "";
      part = typeof b.part === "string" ? b.part : "";
      eyebrow = typeof b.eyebrow === "string" ? b.eyebrow : "";
    } catch {
      // a body that can't be read shows its title alone
    }
    const state: LessonState =
      r.due === null ? "new" : r.due <= iso ? "due" : (r.level ?? 0) >= KNOWN ? "known" : "learning";
    return { id: r.id, title: r.title, pack: r.pack, short, part, eyebrow, state, position: r.position };
  });
}

// the old Learn's progress, carried: { "p:<lesson id>": { level, due } }, matched to the imported lessons by their
// own id at the end of kestrel's id; a key with no lesson is named, never guessed
export function importOldProgress(db: DatabaseSync, progress: unknown): { landed: number; skipped: string[] } {
  const skipped: string[] = [];
  let landed = 0;
  if (progress === null || typeof progress !== "object")
    return { landed, skipped: ["the progress file is not an object"] };
  const find = db.prepare("SELECT id FROM lessons WHERE id LIKE 'old:%' AND id LIKE ?");
  const put = db.prepare(
    `INSERT INTO reviews (lesson, due, interval_days, ease, level) VALUES (?, ?, ?, 2.5, ?)
     ON CONFLICT (lesson) DO UPDATE SET due = excluded.due, interval_days = excluded.interval_days, level = excluded.level`,
  );
  for (const [key, value] of Object.entries(progress)) {
    if (!key.startsWith("p:")) continue;
    const v = (value ?? {}) as { level?: unknown; due?: unknown };
    const own = key.slice(2);
    const hit = find.get(`%/${own}`) as { id: string } | undefined;
    if (!hit) {
      skipped.push(`progress for a lesson that isn't here: ${own}`);
      continue;
    }
    const level = Math.max(0, Math.min(Number(v.level) || 0, GAPS.length - 1));
    const due = typeof v.due === "string" && !Number.isNaN(Date.parse(v.due)) ? new Date(v.due).toISOString() : null;
    if (!due) {
      skipped.push(`progress without a due date: ${own}`);
      continue;
    }
    put.run(hit.id, due, GAPS[level], level);
    landed++;
  }
  return { landed, skipped };
}
