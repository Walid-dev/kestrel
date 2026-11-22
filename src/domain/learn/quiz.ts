// The quiz: questions from my lessons, the lessons' own Check yourself first (instant, no model); a lesson without one
// gets a question the model writes. I answer in my words; the model marks the meaning and says why. What I missed in
// the last two weeks comes back first, then what is due for review, then the rest at random.
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { callModel } from "../../ai/client.ts";
import { gradePrompt, makePrompt, QUIZ_VERSION, SYSTEM } from "../../ai/quiz/prompt.ts";
import { Grade, Made } from "../../ai/quiz/shape.ts";
import { record } from "../../platform/activity.ts";
import type { Settings } from "../../platform/config.ts";
import { recordCall } from "../calls.ts";
import { modelFor } from "../models.ts";
import { Refused } from "../notes/documents.ts";
import { type Area, getLesson, type LessonBody, lessonText } from "./lessons.ts";

export type QuizItem = { lesson: string; title: string; packName: string; q: string | null; a: string | null };

export function pickQuiz(
  db: DatabaseSync,
  opts: { area: Area; pack?: string; group?: string; count: number },
  now: Date,
  random: () => number = Math.random,
): QuizItem[] {
  const where = ["p.area = ?"];
  const args: string[] = [opts.area];
  if (opts.pack) {
    where.push("p.id = ?");
    args.push(opts.pack);
  }
  if (opts.group) {
    where.push("p.grp = ?");
    args.push(opts.group);
  }
  const since = new Date(now.getTime() - 14 * 86_400_000).toISOString();
  const rows = db
    .prepare(
      `SELECT l.id, l.title, l.body, p.name AS packName,
              (SELECT count(*) FROM quiz_answers q WHERE q.lesson = l.id AND q.verdict != 'right' AND q.at >= ?) AS missed,
              (SELECT r.due FROM reviews r WHERE r.lesson = l.id) AS due
       FROM lessons l JOIN packs p ON p.id = l.pack WHERE ${where.join(" AND ")}`,
    )
    .all(since, ...args) as {
    id: string;
    title: string;
    body: string;
    packName: string;
    missed: number;
    due: string | null;
  }[];
  const nowIso = now.toISOString();
  const ranked = rows
    .map((r) => {
      const checks = (JSON.parse(r.body) as Partial<LessonBody>).check ?? [];
      // a lesson with its own check first; among them, missed, then due, then the rest, each at random within
      const tier = (checks.length ? 0 : 3) + (r.missed > 0 ? 0 : r.due && r.due <= nowIso ? 1 : 2);
      return { r, checks, rank: tier + random() * 0.9 };
    })
    .sort((a, b) => a.rank - b.rank)
    .slice(0, Math.max(1, Math.min(30, opts.count)));
  return ranked.map(({ r, checks }) => {
    const c = checks.length ? checks[Math.floor(random() * checks.length)] : null;
    return { lesson: r.id, title: r.title, packName: r.packName, q: c?.q ?? null, a: c?.a ?? null };
  });
}

const textOf = (body: LessonBody) => lessonText(body).filter(Boolean).join("\n");

const modelOf = (db: DatabaseSync, settings: Settings) => {
  const model = modelFor(db, settings, "quiz");
  return { model, effective: { ...settings.models, careful: model, fast: model } };
};

// a question for a lesson that has none of its own
export async function makeQuestion(
  db: DatabaseSync,
  settings: Settings,
  lessonId: string,
): Promise<{ q: string; a: string }> {
  const lesson = getLesson(db, lessonId);
  if (!lesson) throw new Refused("no such lesson");
  const { model, effective } = modelOf(db, settings);
  const got = await callModel(
    effective,
    { model, system: SYSTEM, prompt: makePrompt(lesson.title, textOf(lesson.body)), maxTokens: 800, thinking: true },
    Made,
  );
  recordCall(db, `quiz-make:v${QUIZ_VERSION}`, got);
  if (!got.ok) throw new Refused(`the model didn't write a question: ${got.why}`);
  return got.value;
}

export async function gradeAnswer(
  db: DatabaseSync,
  settings: Settings,
  input: { lesson: string; question: string; expected: string; answer: string },
): Promise<Grade> {
  const lesson = getLesson(db, input.lesson);
  if (!lesson) throw new Refused("no such lesson");
  const answer = input.answer.trim();
  if (!answer) throw new Refused("answer something first");
  const { model, effective } = modelOf(db, settings);
  const got = await callModel(
    effective,
    {
      model,
      system: SYSTEM,
      prompt: gradePrompt(
        { title: lesson.title, question: input.question, expected: input.expected, lesson: textOf(lesson.body) },
        answer,
      ),
      maxTokens: 1500,
      thinking: true,
    },
    Grade,
  );
  recordCall(db, `quiz-grade:v${QUIZ_VERSION}`, got);
  if (!got.ok) throw new Refused(`the model didn't mark it: ${got.why}`);
  const at = new Date().toISOString();
  db.prepare("INSERT INTO quiz_answers (id, lesson, question, answer, verdict, at) VALUES (?, ?, ?, ?, ?, ?)").run(
    randomUUID(),
    lesson.id,
    input.question,
    answer,
    got.value.verdict,
    at,
  );
  const said = { right: "right", partly: "partly right", wrong: "not quite" }[got.value.verdict];
  record("quiz", `Quiz: ${lesson.title}`, `/learn/lesson/${encodeURIComponent(lesson.id)}`, said);
  return got.value;
}
