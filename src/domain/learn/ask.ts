// Ask on a lesson: what the lesson page shows the model — the open lesson whole, and the pack's map, so an answer
// can link the lesson that covers it. The conversation itself is Ask's (src/domain/ask/ask.ts).
import type { DatabaseSync } from "node:sqlite";
import type { AskPage } from "../../ai/ask/prompt.ts";
import type { ToolName } from "../ask/tools.ts";
import { getLesson, lessonText, listLessons } from "./lessons.ts";
import { getQuiz } from "./quiz.ts";

const LESSON_CHARS = 24_000; // a long guide still leaves room for the conversation

export function lessonPage(db: DatabaseSync, ref: string): AskPage | null {
  const lesson = getLesson(db, ref);
  if (!lesson) return null;
  const group = (db.prepare("SELECT grp FROM packs WHERE id = ?").get(lesson.pack) as { grp: string } | undefined)?.grp;
  return lessonAskPage(
    { id: lesson.id, title: lesson.title, text: lessonText(lesson.body) },
    listLessons(db, lesson.pack).map((l) => ({ id: l.id, title: l.title })),
    group === "Personal",
  );
}

// outside my own packs a lesson teaches the field, not my setup (my ask, 2026-11-23: "I'm here to learn real lessons")
const FIELD =
  "Teach the subject as the field knows it: the standard practice, the well-known tools and real examples from the industry. Don't bring my own setup, apps, models or projects into it unless I ask about them, even where the lesson mentions them.";
const MINE = "This lesson is about my own setup: answer about it, and say plainly where the general practice differs.";

// the page in words, from the lesson's lines and the pack's map (the eval builds it the same way)
export function lessonAskPage(
  lesson: { id: string; title: string; text: string[] },
  map: { id: string; title: string }[],
  mine = false,
): AskPage {
  return {
    tools: mine ? MINE : FIELD,
    app: "learn",
    what: "a lesson I am reading in my learning app",
    title: lesson.title,
    link: `/learn/lesson/${encodeURIComponent(lesson.id)}`,
    context: [
      `THE OPEN LESSON (${lesson.id}): ${lesson.title}`,
      lesson.text.join("\n").slice(0, LESSON_CHARS),
      `THE PACK'S LESSONS:\n${map
        .slice(0, 120)
        .map((l) => `- ${l.id}: ${l.title}`)
        .join("\n")}`,
    ].join("\n\n"),
  };
}

// the shared tools a lesson or a quiz question lists (domain/ask/tools.ts). My prepared answers (Interview prep), my
// own packs (the Personal group) and an interview quiz carry my own words, so they list read alone: each search there
// waits for my tap with its exact words, and the page reader opens only what one of my approved searches returned.
// Every other lesson teaches the field and lists the web: its searches run as the model writes them.
const WEB: ToolName[] = ["read", "web", "page"];
export const isMine = (db: DatabaseSync, lessonId: string): boolean => {
  const p = db
    .prepare("SELECT p.area, p.grp FROM lessons l JOIN packs p ON p.id = l.pack WHERE l.id = ?")
    .get(lessonId) as { area: string; grp: string } | undefined;
  return !p || p.area === "interview" || p.grp === "Personal";
};
export const lessonTools = (db: DatabaseSync, ref: string): ToolName[] => (isMine(db, ref) ? ["read"] : WEB);
export function quizTools(db: DatabaseSync, ref: string): ToolName[] {
  const cut = ref.lastIndexOf(":");
  const quiz = cut > 0 ? getQuiz(db, ref.slice(0, cut)) : null;
  const item = quiz?.items[Number(ref.slice(cut + 1))];
  return !quiz || !item || quiz.area === "interview" || isMine(db, item.lesson) ? ["read"] : WEB;
}
