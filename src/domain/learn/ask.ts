// Ask on a lesson: what the lesson page shows the model — the open lesson whole, and the pack's map, so an answer
// can link the lesson that covers it. The conversation itself is Ask's (src/domain/ask/ask.ts).
import type { DatabaseSync } from "node:sqlite";
import type { AskPage } from "../../ai/ask/prompt.ts";
import { getLesson, lessonText, listLessons } from "./lessons.ts";

const LESSON_CHARS = 24_000; // a long guide still leaves room for the conversation

export function lessonPage(db: DatabaseSync, ref: string): AskPage | null {
  const lesson = getLesson(db, ref);
  if (!lesson) return null;
  return lessonAskPage(
    { id: lesson.id, title: lesson.title, text: lessonText(lesson.body) },
    listLessons(db, lesson.pack).map((l) => ({ id: l.id, title: l.title })),
  );
}

// the page in words, from the lesson's lines and the pack's map (the eval builds it the same way)
export function lessonAskPage(
  lesson: { id: string; title: string; text: string[] },
  map: { id: string; title: string }[],
): AskPage {
  return {
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
