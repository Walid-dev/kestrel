// The quiz: questions from my lessons, the lessons' own Check yourself first (instant, no model); a lesson without one
// gets a question the model writes, and a quiz of new questions has the model write each one, away from the lesson's
// own. I answer in my words; the model marks the meaning and says why. What I missed in
// the last two weeks comes back first, then what is due for review, then the rest at random. After each question, an
// explanation: a small lesson written once by the local model (its own pick, the fast one unless I change it) and kept.
// A quiz is kept as I take it — its questions, my answers and marks, the question I'm on — so leaving loses nothing,
// and Ask on a question sees all of it. A quiz draws from a topic, or from the packs or lessons I pick in it; one I
// no longer use is archived (off the list, kept) or deleted.
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { AskPage } from "../../ai/ask/prompt.ts";
import { callModel, failureWords, type Outcome } from "../../ai/client.ts";
import { EXPLAIN_VERSION, explainPrompt, gradePrompt, makePrompt, QUIZ_VERSION, SYSTEM } from "../../ai/quiz/prompt.ts";
import { Explained, Grade, Made } from "../../ai/quiz/shape.ts";
import { record } from "../../platform/activity.ts";
import type { Settings } from "../../platform/config.ts";
import { clampCount, type QuizLesson, questionsFrom } from "../../shared/quiz.ts";
import { recordCall } from "../calls.ts";
import { modelFor } from "../models.ts";
import { Refused } from "../notes/documents.ts";
import { type Area, getLesson, LessonBody, lessonText } from "./lessons.ts";
import { lessonStates } from "./review.ts";

// a model that didn't answer because its door is down: the routes say 503 (the server's trouble, try again later), not
// 400 (a request that was wrong). Still a Refused, so a caller that knows only Refused keeps working
export class ModelDown extends Refused {}
const refusal = (why: Outcome, message: string) => (why === "down" ? new ModelDown(message) : new Refused(message));

export type QuizItem = { lesson: string; title: string; packName: string; q: string | null; a: string | null };

// what a quiz draws from: an area, narrowed to a group (a topic), then to picked packs, then to picked lessons
export type QuizFrom = { area: Area; group?: string; packs?: string[]; lessons?: string[] };

// the packs picked must be in the area and the topic: an id from another area, or one deleted since the page loaded,
// is refused with words, never quietly dropped (the quiz would then draw from more than I picked)
function checkPacks(db: DatabaseSync, from: QuizFrom): void {
  for (const id of new Set(from.packs ?? [])) {
    const p = db.prepare("SELECT area, grp FROM packs WHERE id = ?").get(id) as
      | { area: string; grp: string }
      | undefined;
    if (!p || p.area !== from.area || (from.group && p.grp !== from.group))
      throw new Refused("A picked pack isn't in this topic any more. Pick again.");
  }
}

export function pickQuiz(
  db: DatabaseSync,
  opts: QuizFrom & { count: number; fresh?: boolean },
  now: Date,
  random: () => number = Math.random,
): QuizItem[] {
  checkPacks(db, opts);
  const where = ["p.area = ?"];
  const args: string[] = [opts.area];
  if (opts.group) {
    where.push("p.grp = ?");
    args.push(opts.group);
  }
  const packs = [...new Set(opts.packs ?? [])];
  if (packs.length) {
    where.push(`p.id IN (${packs.map(() => "?").join(", ")})`);
    args.push(...packs);
  }
  const since = new Date(now.getTime() - 14 * 86_400_000).toISOString();
  let rows = db
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
  const picked = new Set(opts.lessons ?? []);
  if (picked.size) {
    // every picked lesson must be among what the area, topic and packs hold: same reason as the packs
    const there = new Set(rows.map((r) => r.id));
    if ([...picked].some((id) => !there.has(id)))
      throw new Refused("A picked lesson isn't in this topic any more. Pick again.");
    rows = rows.filter((r) => picked.has(r.id));
  }
  const nowIso = now.toISOString();
  const ranked = rows
    .map((r) => {
      const checks = (JSON.parse(r.body) as Partial<LessonBody>).check ?? [];
      // a lesson with its own check first (new questions: any lesson); among them, missed, then due, then the rest,
      // each at random within
      const tier = (checks.length || opts.fresh ? 0 : 3) + (r.missed > 0 ? 0 : r.due && r.due <= nowIso ? 1 : 2);
      return { r, checks, rank: tier + random() * 0.9 };
    })
    .sort((a, b) => a.rank - b.rank);
  // each lesson's questions, in turn: its own checks in a random order (null: one the model writes). Only a quiz on
  // picked lessons goes round them again with their next question, so two picked lessons can still make a round of
  // six; a topic or a pack asks each lesson once, as it always has.
  const round = picked.size > 0;
  const turns = ranked.map(({ r, checks }) => {
    const own = opts.fresh ? [] : shuffled(checks, random);
    const slots: ({ q: string; a: string } | null)[] = own.length
      ? own
      : Array(questionsFrom(checks.length, Boolean(opts.fresh), true)).fill(null);
    return { r, slots: slots.slice(0, questionsFrom(checks.length, Boolean(opts.fresh), round)) };
  });
  const items: QuizItem[] = [];
  const want = clampCount(opts.count);
  for (let round = 0; items.length < want; round++) {
    const at = turns.filter((t) => round < t.slots.length);
    if (!at.length) break;
    for (const { r, slots } of at) {
      if (items.length >= want) break;
      const c = slots[round];
      items.push({ lesson: r.id, title: r.title, packName: r.packName, q: c?.q ?? null, a: c?.a ?? null });
    }
  }
  return items;
}

function shuffled<T>(list: T[], random: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// the lessons the quiz's start shows as pills: each with its pack, whether it is due (Learn's own lesson state, so a
// pill says what the lesson's row in Learn says) and how many checks of its own it has (what the start's count needs)
export function quizLessons(db: DatabaseSync, area: Area, now: Date = new Date()): QuizLesson[] {
  const checks = new Map(
    (
      db.prepare("SELECT l.id, l.body FROM lessons l JOIN packs p ON p.id = l.pack WHERE p.area = ?").all(area) as {
        id: string;
        body: string;
      }[]
    ).map((r) => {
      try {
        const c = (JSON.parse(r.body) as { check?: unknown }).check;
        return [r.id, Array.isArray(c) ? c.length : 0] as const;
      } catch {
        return [r.id, 0] as const; // a body that can't be read gives a question the model writes
      }
    }),
  );
  return lessonStates(db, area, now).map((l) => ({
    id: l.id,
    title: l.title,
    pack: l.pack,
    due: l.state === "due",
    checks: checks.get(l.id) ?? 0,
  }));
}

const textOf = (body: LessonBody) => lessonText(body).filter(Boolean).join("\n");

const modelOf = (db: DatabaseSync, settings: Settings) => {
  const model = modelFor(db, settings, "quiz");
  return { model, effective: { ...settings.models, careful: model, fast: model } };
};

// a question for a lesson that has none of its own
// a lesson of my own packs (the Personal group) may speak of my setup; every other teaches the field
const mineOf = (db: DatabaseSync, pack: string) =>
  (db.prepare("SELECT grp FROM packs WHERE id = ?").get(pack) as { grp: string } | undefined)?.grp === "Personal";

export async function makeQuestion(
  db: DatabaseSync,
  settings: Settings,
  lessonId: string,
  // the questions this quiz already asks on the lesson: a second turn on it asks something else
  asked: string[] = [],
): Promise<{ q: string; a: string }> {
  const lesson = getLesson(db, lessonId);
  if (!lesson) throw new Refused("no such lesson");
  const { model, effective } = modelOf(db, settings);
  const got = await callModel(
    effective,
    {
      model,
      system: SYSTEM,
      prompt: makePrompt(lesson.title, textOf(lesson.body), mineOf(db, lesson.pack), [
        ...new Set([...(lesson.body.check ?? []).map((c) => c.q), ...asked]),
      ]),
      maxTokens: 800,
      thinking: true,
    },
    Made,
  );
  recordCall(db, `quiz-make:v${QUIZ_VERSION}`, got);
  if (!got.ok) throw refusal(got.why, failureWords(got.why));
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
  if (!got.ok) throw refusal(got.why, failureWords(got.why));
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

// a kept explanation, or null
export function keptExplanation(db: DatabaseSync, lesson: string, question: string): Explained | null {
  const r = db.prepare("SELECT body FROM quiz_explanations WHERE lesson = ? AND question = ?").get(lesson, question) as
    | { body: string }
    | undefined;
  return r ? (JSON.parse(r.body) as Explained) : null;
}

// the question explained: kept after the first time, so the next quiz shows it at once (the mark's own why already
// speaks to my answer)
export async function explainAnswer(
  db: DatabaseSync,
  settings: Settings,
  input: { lesson: string; question: string; expected: string },
): Promise<Explained & { kept: boolean }> {
  const lesson = getLesson(db, input.lesson);
  if (!lesson) throw new Refused("no such lesson");
  const kept = keptExplanation(db, lesson.id, input.question);
  if (kept) return { ...kept, kept: true };
  const model = modelFor(db, settings, "quiz-explain");
  const effective = { ...settings.models, careful: model, fast: model };
  const got = await callModel(
    effective,
    {
      model,
      system: SYSTEM,
      prompt: explainPrompt(
        {
          title: lesson.title,
          question: input.question,
          expected: input.expected,
          lesson: textOf(lesson.body),
        },
        mineOf(db, lesson.pack),
      ),
      // room to think and to write a rich answer: a short one is what this replaces
      maxTokens: 8000,
      thinking: true,
    },
    Explained,
  );
  recordCall(db, `quiz-explain:v${EXPLAIN_VERSION}`, got);
  if (!got.ok) throw refusal(got.why, failureWords(got.why));
  db.prepare(
    `INSERT INTO quiz_explanations (lesson, question, body, model, at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (lesson, question) DO UPDATE SET body = excluded.body, model = excluded.model, at = excluded.at`,
  ).run(lesson.id, input.question, JSON.stringify(got.value), model, new Date().toISOString());
  return { ...got.value, kept: false };
}

// "I don't know" counts as a miss, so the lesson comes back first next time; no model is asked
export function skipQuestion(db: DatabaseSync, input: { lesson: string; question: string }): void {
  const lesson = getLesson(db, input.lesson);
  if (!lesson) throw new Refused("no such lesson");
  db.prepare(
    "INSERT INTO quiz_answers (id, lesson, question, answer, verdict, at) VALUES (?, ?, ?, ?, 'wrong', ?)",
  ).run(randomUUID(), lesson.id, input.question, "(I didn't know)", new Date().toISOString());
}

// ---- a quiz as I take it, kept ----

export type QuizAnswer = {
  answer: string;
  verdict: Grade["verdict"];
  why: string;
  correct: Grade["correct"];
  skipped: boolean;
};
export type Quiz = {
  id: string;
  area: Area;
  scope: string; // what it was drawn from, in words: Everything, a group, a pack, a lesson, "AI · 3 lessons"
  items: QuizItem[];
  answers: (QuizAnswer | null)[];
  place: number; // the question I'm on; items.length once it ended
  started: string;
  updated: string;
  finished: string | null;
  archived: string | null; // when I archived it: off the list, kept; null while on the list
};
export type QuizSummary = Omit<Quiz, "items" | "answers"> & {
  total: number;
  answered: number;
  right: number;
  partly: number;
};

const readQuiz = (r: Record<string, unknown>): Quiz => ({
  id: String(r.id),
  area: r.area as Area,
  scope: String(r.scope),
  items: JSON.parse(String(r.items)) as QuizItem[],
  answers: JSON.parse(String(r.answers)) as (QuizAnswer | null)[],
  place: Number(r.place),
  started: String(r.started),
  updated: String(r.updated),
  finished: r.finished == null ? null : String(r.finished),
  archived: r.archived == null ? null : String(r.archived),
});

export function getQuiz(db: DatabaseSync, id: string): Quiz | null {
  const r = db.prepare("SELECT * FROM quizzes WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? readQuiz(r) : null;
}
const mustQuiz = (db: DatabaseSync, id: string): Quiz => {
  const q = getQuiz(db, id);
  if (!q) throw new Refused("that quiz isn't there any more");
  return q;
};
const save = (db: DatabaseSync, id: string, what: "items" | "answers", value: unknown) =>
  db
    .prepare(`UPDATE quizzes SET ${what} = ?, updated = ? WHERE id = ?`)
    .run(JSON.stringify(value), new Date().toISOString(), id);

// what a quiz is drawn from, in words, for its card: one or two lessons' titles, one or two packs' names, or the topic
// with how many it picked ("AI · 3 lessons"). Two quizzes on different pairs of lessons must not share a name: the
// list, Archived and the delete question would show two cards I can't tell apart.
function scopeOf(db: DatabaseSync, from: QuizFrom): string {
  const topic = from.group || "Everything";
  const name = (table: "packs" | "lessons", col: "name" | "title", id: string) =>
    (db.prepare(`SELECT ${col} AS n FROM ${table} WHERE id = ?`).get(id) as { n: string } | undefined)?.n ?? "";
  const packs = [...new Set(from.packs ?? [])].map((id) => name("packs", "name", id));
  const lessons = [...new Set(from.lessons ?? [])];
  if (lessons.length === 1 || lessons.length === 2)
    return lessons.map((id) => name("lessons", "title", id)).join(" + ");
  if (lessons.length) return `${packs.length === 1 ? packs[0] : topic} · ${lessons.length} lessons`;
  if (packs.length === 1 || packs.length === 2) return packs.join(" + ");
  if (packs.length) return `${topic} · ${packs.length} packs`;
  return topic;
}

// a new quiz from the lessons: picked as pickQuiz picks, kept at once
export function startQuiz(
  db: DatabaseSync,
  opts: QuizFrom & { count: number; fresh?: boolean },
  now: Date = new Date(),
  random: () => number = Math.random,
): Quiz {
  const items = pickQuiz(db, opts, now, random);
  if (!items.length) throw new Refused("No lessons there yet.");
  const id = randomUUID();
  const at = now.toISOString();
  db.prepare(
    "INSERT INTO quizzes (id, area, scope, items, answers, place, started, updated) VALUES (?, ?, ?, ?, ?, 0, ?, ?)",
  ).run(id, opts.area, scopeOf(db, opts), JSON.stringify(items), JSON.stringify(items.map(() => null)), at, at);
  return mustQuiz(db, id);
}

// the quizzes on the page: every one I haven't archived, the started ones first (the last touched on top), then the
// ended ones. No cap: a quiz leaves the list only when I archive or delete it, never by being the thirteenth.
// archived: the archived ones instead, the last archived on top.
export function listQuizzes(db: DatabaseSync, opts: { archived?: boolean } = {}): QuizSummary[] {
  const rows = db
    .prepare(
      opts.archived
        ? "SELECT * FROM quizzes WHERE archived IS NOT NULL ORDER BY archived DESC"
        : "SELECT * FROM quizzes WHERE archived IS NULL ORDER BY finished IS NOT NULL, updated DESC",
    )
    .all() as Record<string, unknown>[];
  return rows.map(readQuiz).map(({ items, answers, ...q }) => ({
    ...q,
    total: items.length,
    answered: answers.filter(Boolean).length,
    right: answers.filter((a) => a?.verdict === "right").length,
    partly: answers.filter((a) => a?.verdict === "partly").length,
  }));
}

// off the list, kept as it is: its questions, my answers and its Ask talks wait for Restore
export function archiveQuiz(db: DatabaseSync, id: string, now: Date = new Date()): Quiz {
  const quiz = mustQuiz(db, id);
  if (!quiz.archived) db.prepare("UPDATE quizzes SET archived = ? WHERE id = ?").run(now.toISOString(), id);
  return mustQuiz(db, id);
}

// back on the list, where it was: its place, its answers and its last touch unchanged
export function restoreQuiz(db: DatabaseSync, id: string): Quiz {
  mustQuiz(db, id);
  db.prepare("UPDATE quizzes SET archived = NULL WHERE id = ?").run(id);
  return mustQuiz(db, id);
}

const itemAt = (quiz: Quiz, index: number): QuizItem => {
  const item = quiz.items[index];
  if (!item) throw new Refused("no such question in this quiz");
  return item;
};

// a lesson without its own check gets a question written for it, once: kept in the quiz, so coming back finds it
export async function makeQuizQuestion(db: DatabaseSync, settings: Settings, id: string, index: number): Promise<Quiz> {
  const quiz = mustQuiz(db, id);
  const item = itemAt(quiz, index);
  if (item.q && item.a) return quiz;
  const asked = quiz.items.filter((it, i) => i !== index && it.lesson === item.lesson && it.q).map((it) => it.q ?? "");
  const made = await makeQuestion(db, settings, item.lesson, asked);
  const fresh = mustQuiz(db, id); // read again: the model took seconds
  if (!fresh.items[index].q) {
    fresh.items[index] = { ...fresh.items[index], q: made.q, a: made.a };
    save(db, id, "items", fresh.items);
  }
  return mustQuiz(db, id);
}

// my answer, marked by the model and kept with the quiz (a second tap on the same question changes nothing)
export async function answerQuiz(
  db: DatabaseSync,
  settings: Settings,
  id: string,
  index: number,
  answer: string,
): Promise<Quiz> {
  const quiz = mustQuiz(db, id);
  const item = itemAt(quiz, index);
  if (!item.q) throw new Refused("the question isn't written yet");
  if (quiz.answers[index]) return quiz;
  const grade = await gradeAnswer(db, settings, {
    lesson: item.lesson,
    question: item.q,
    expected: item.a ?? "",
    answer,
  });
  const fresh = mustQuiz(db, id);
  if (!fresh.answers[index]) {
    fresh.answers[index] = { answer: answer.trim(), ...grade, skipped: false };
    save(db, id, "answers", fresh.answers);
  }
  return mustQuiz(db, id);
}

// "I don't know": a miss, kept, and the explanation does the teaching
export function skipQuiz(db: DatabaseSync, id: string, index: number): Quiz {
  const quiz = mustQuiz(db, id);
  const item = itemAt(quiz, index);
  if (!item.q) throw new Refused("the question isn't written yet");
  if (quiz.answers[index]) return quiz;
  skipQuestion(db, { lesson: item.lesson, question: item.q });
  quiz.answers[index] = {
    answer: "",
    verdict: "wrong",
    why: "Here is how it works.",
    correct: [item.a ?? ""],
    skipped: true,
  };
  save(db, id, "answers", quiz.answers);
  return mustQuiz(db, id);
}

// the question I'm on; past the last one, the quiz has ended
export function moveQuiz(db: DatabaseSync, id: string, place: number): Quiz {
  const quiz = mustQuiz(db, id);
  const p = Math.max(0, Math.min(quiz.items.length, Math.floor(place)));
  const now = new Date().toISOString();
  db.prepare("UPDATE quizzes SET place = ?, updated = ?, finished = ? WHERE id = ?").run(
    p,
    now,
    p >= quiz.items.length ? (quiz.finished ?? now) : null,
    id,
  );
  return mustQuiz(db, id);
}

// gone for good: the quiz and its Ask talks. My answers stay in quiz_answers, by lesson, so what I missed in it still
// comes back first for two weeks (pickQuiz), and the kept explanations stay for the next quiz that asks the same.
export function deleteQuiz(db: DatabaseSync, id: string): void {
  mustQuiz(db, id);
  db.prepare("DELETE FROM quizzes WHERE id = ?").run(id);
  db.prepare("DELETE FROM ask_messages WHERE app = 'quiz' AND ref LIKE ?").run(`${id}:%`);
}

// Ask on a quiz question (ref: the quiz's id and the question's place, "<id>:<n>"): the question, the lesson's answer,
// mine and its mark, the explanation I was shown, and the lesson it comes from
export function quizPage(db: DatabaseSync, ref: string): AskPage | null {
  const cut = ref.lastIndexOf(":");
  const quiz = cut > 0 ? getQuiz(db, ref.slice(0, cut)) : null;
  const index = Number(ref.slice(cut + 1));
  const item = quiz && Number.isInteger(index) ? quiz.items[index] : undefined;
  if (!quiz || !item?.q) return null;
  const mine = quiz.answers[index];
  const lesson = getLesson(db, item.lesson);
  const explained = keptExplanation(db, item.lesson, item.q);
  const said = !mine
    ? "I haven't answered yet."
    : mine.skipped
      ? "I said I didn't know."
      : `${mine.answer}\nTHE MARK: ${mine.verdict}. ${mine.why}`;
  const shown = explained
    ? [...lessonText(LessonBody.parse({ blocks: explained.blocks })), explained.remember].filter(Boolean).join("\n")
    : "";
  return {
    app: "quiz",
    what: "a question from my lessons, with my answer, its mark and the explanation I was shown",
    title: `Quiz: ${item.title}`,
    link: `/quiz/${quiz.id}`,
    context: [
      `THE QUESTION: ${item.q}`,
      `THE LESSON'S ANSWER: ${item.a ?? ""}`,
      `MY ANSWER: ${said}`,
      shown && `THE EXPLANATION I WAS SHOWN:\n${shown.slice(0, 8000)}`,
      lesson && `THE LESSON IT COMES FROM (${lesson.id}): ${lesson.title}\n${textOf(lesson.body).slice(0, 8000)}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
