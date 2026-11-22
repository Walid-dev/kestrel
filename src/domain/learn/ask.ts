// Ask on a lesson: the one client, the learn-ask pick, the pack's map as context. The call is awaited — an answer
// takes seconds on the fast model — and recorded like every call.
import type { DatabaseSync } from "node:sqlite";
import { callModel } from "../../ai/client.ts";
import { ASK_VERSION, askPrompt } from "../../ai/learn/prompt.ts";
import { AskAnswer } from "../../ai/learn/shape.ts";
import { begin } from "../../platform/activity.ts";
import type { Settings } from "../../platform/config.ts";
import { recordCall } from "../calls.ts";
import { modelFor } from "../models.ts";
import { Refused } from "../notes/documents.ts";
import { getLesson, lessonText, listLessons } from "./lessons.ts";

export async function askLesson(
  db: DatabaseSync,
  settings: Settings,
  lessonId: string,
  question: string,
): Promise<{ answer: string; drewOn: { id: string; title: string }[] }> {
  const lesson = getLesson(db, lessonId);
  if (!lesson) throw new Refused("no such lesson");
  if (question.trim() === "") throw new Refused("ask something");
  const packMap = listLessons(db, lesson.pack).map((l) => ({ id: l.id, title: l.title }));
  const { system, prompt } = askPrompt(
    {
      id: lesson.id,
      title: lesson.title,
      say: lesson.body.say,
      explain: lesson.body.blocks.length ? lessonText(lesson.body) : lesson.body.explain,
      words: lesson.body.words,
    },
    packMap,
    question.trim(),
  );
  const model = modelFor(db, settings, "learn-ask");
  const effective = { ...settings.models, fast: model, careful: model };
  const live = begin("model", `Ask: ${lesson.title}`.slice(0, 120), `/learn/lesson/${encodeURIComponent(lesson.id)}`);
  live.step(`${model} answers a question`);
  const got = await callModel(effective, { model, system, prompt, maxTokens: 2000, thinking: true }, AskAnswer);
  live.end(got.ok ? "done" : "failed", got.ok ? "" : got.why);
  recordCall(db, `learn-ask:v${ASK_VERSION}`, got);
  if (!got.ok) throw new Refused(`the model didn't answer well: ${got.why}`);
  const titles = new Map(packMap.map((l) => [l.id, l.title]));
  return {
    answer: got.value.answer,
    drewOn: got.value.drewOn.filter((id) => titles.has(id)).map((id) => ({ id, title: titles.get(id) as string })),
  };
}
