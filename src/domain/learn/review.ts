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

// "due", one meaning wherever it is shown (Learn's front page, the pack pills, the quiz, Practice, the brief): a lesson
// I graded whose review date has come. One never graded is new, not due: unread is not "to review" (the brief,
// 2026-11-21). In SQL, with the lesson's review row as r and the time as its argument:
export const DUE = "(r.due IS NOT NULL AND r.due <= ?)";
// a new lesson Practice can ask: never graded, and with a check question
const NEW_WITH_CHECK = `(r.lesson IS NULL AND l.body LIKE '%"check":[{%')`;
const FROM_AREA =
  "FROM lessons l JOIN packs p ON p.id = l.pack LEFT JOIN reviews r ON r.lesson = l.id WHERE p.area = ?";

export function stateOf(review: { due: string | null; level: number | null }, now: Date): LessonState {
  if (review.due === null) return "new";
  return review.due <= now.toISOString() ? "due" : (review.level ?? 0) >= KNOWN ? "known" : "learning";
}

export function countDue(db: DatabaseSync, area: "learn" | "interview", now: Date): number {
  return (db.prepare(`SELECT COUNT(*) AS n ${FROM_AREA} AND ${DUE}`).get(area, now.toISOString()) as { n: number }).n;
}

// an area's lessons whose review date has come, the longest waiting first (the area filters before the limit, so
// another area's many never crowd it out)
export function dueLessons(db: DatabaseSync, area: "learn" | "interview", now: Date, limit = 20): string[] {
  return (
    db.prepare(`SELECT l.id ${FROM_AREA} AND ${DUE} ORDER BY r.due LIMIT ?`).all(area, now.toISOString(), limit) as {
      id: string;
    }[]
  ).map((r) => r.id);
}

// an area's lessons never graded that have a check question: Practice asks them after the due ones
export function neverGraded(db: DatabaseSync, area: "learn" | "interview", limit = 20): string[] {
  return (
    db.prepare(`SELECT l.id ${FROM_AREA} AND ${NEW_WITH_CHECK} ORDER BY l.added_at LIMIT ?`).all(area, limit) as {
      id: string;
    }[]
  ).map((r) => r.id);
}

// Practice: the due lessons, then the new ones it can ask, and how many of each there are in all
export function practiceList(
  db: DatabaseSync,
  area: "learn" | "interview",
  now: Date,
  limit = 20,
): { ids: string[]; due: number; fresh: number } {
  const due = dueLessons(db, area, now, limit);
  const fresh = (
    db.prepare(`SELECT COUNT(*) AS n ${FROM_AREA} AND ${NEW_WITH_CHECK}`).get(area) as {
      n: number;
    }
  ).n;
  return { ids: [...due, ...neverGraded(db, area, limit - due.length)], due: countDue(db, area, now), fresh };
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
    return {
      id: r.id,
      title: r.title,
      pack: r.pack,
      short,
      part,
      eyebrow,
      state: stateOf(r, now),
      position: r.position,
    };
  });
}

// the old Learn's progress, carried: { "p:<lesson id>": { level, due } }, matched to the imported lessons by their
// own id at the end of kestrel's id; a key with no lesson is named, never guessed
export function importOldProgress(db: DatabaseSync, progress: unknown): { landed: number; skipped: string[] } {
  const skipped: string[] = [];
  let landed = 0;
  if (progress === null || typeof progress !== "object")
    return { landed, skipped: ["the progress file is not an object"] };
  const find = db.prepare("SELECT id FROM lessons WHERE (id LIKE 'old:%' OR id LIKE 'prep:%') AND id LIKE ?");
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
