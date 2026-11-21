// Live's matcher: the heard words against every prepared answer's question, plain token overlap, no model. The
// nearest answer above the floor wins; below it, Live says so instead of guessing.
import type { DatabaseSync } from "node:sqlite";
import { LessonBody } from "./lessons.ts";

const STOP = new Set(
  (
    "a an the is are was were be been do does did doing you your yours we our ours it its of to in on at and or " +
    "for with about what how why when where who which whom this that these those i me my am can could would should " +
    "have has had will tell say said us them they their there so if then than as not no yes please"
  ).split(" "),
);

export const heardWords = (s: string): string[] =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replaceAll(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));

// 0..1: shared meaningful words over the sizes of both sides, so a long ramble doesn't win on volume
export function scoreMatch(question: string, heard: string): number {
  const q = new Set(heardWords(question));
  const h = new Set(heardWords(heard));
  if (q.size === 0 || h.size === 0) return 0;
  let hit = 0;
  for (const w of h) if (q.has(w)) hit++;
  return hit / Math.sqrt(q.size * h.size);
}

export const MATCH_FLOOR = 0.25;

export function bestAnswer(db: DatabaseSync, heard: string): { lesson: string; score: number } | null {
  const rows = db
    .prepare(
      `SELECT l.id, l.title, l.body FROM lessons l JOIN packs p ON p.id = l.pack
       WHERE p.kind = 'answer-pack' ORDER BY l.pack, l.position`,
    )
    .all() as { id: string; title: string; body: string }[];
  let best: { lesson: string; score: number } | null = null;
  for (const row of rows) {
    const read = LessonBody.safeParse(JSON.parse(row.body));
    const questions = [row.title, ...(read.success ? read.data.check.map((c) => c.q) : [])];
    const score = Math.max(...questions.map((q) => scoreMatch(q, heard)));
    if (score >= MATCH_FLOOR && (best === null || score > best.score)) best = { lesson: row.id, score };
  }
  return best;
}
