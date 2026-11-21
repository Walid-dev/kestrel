// The spaced rhythm, simple on purpose: again puts a lesson back tomorrow; good grows the gap (1, 3, then ×ease);
// the due list is what Practice asks.
import type { DatabaseSync } from "node:sqlite";

export function gradeLesson(
  db: DatabaseSync,
  lesson: string,
  grade: "again" | "good",
  now: Date,
): { due: string; intervalDays: number } {
  const r = db.prepare("SELECT interval_days, ease FROM reviews WHERE lesson = ?").get(lesson) as
    | { interval_days: number; ease: number }
    | undefined;
  const ease = r?.ease ?? 2.5;
  const interval =
    grade === "again"
      ? 1
      : r === undefined || r.interval_days === 0
        ? 1
        : r.interval_days === 1
          ? 3
          : Math.round(r.interval_days * ease * 10) / 10;
  const nextEase = grade === "again" ? Math.max(1.3, ease - 0.2) : ease;
  const due = new Date(now.getTime() + interval * 86_400_000).toISOString();
  db.prepare(
    "INSERT INTO reviews (lesson, due, interval_days, ease) VALUES (?, ?, ?, ?) ON CONFLICT (lesson) DO UPDATE SET due = ?, interval_days = ?, ease = ?",
  ).run(lesson, due, interval, nextEase, due, interval, nextEase);
  return { due, intervalDays: interval };
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
