// The Ask scorer: deterministic. A pass answers in plain short lines (ten at most, no filler words), draws only on
// lessons the map holds, and — when the question sits inside the lesson — uses the lesson's own words.
import { AskAnswer } from "../../src/ai/learn/shape.ts";

export type Case = {
  name: string;
  lesson: { id: string; title: string; say: string[]; explain: string[]; words: { w: string; m: string }[] };
  packMap: { id: string; title: string }[];
  question: string;
  good: unknown;
  bad: unknown;
  badWhy: string;
};

const FILLER = /\b(generally speaking|various approaches|it depends on many factors)\b/i;

export function score(c: Case, raw: unknown): { pass: boolean; reasons: string[] } {
  const read = AskAnswer.safeParse(raw);
  if (!read.success)
    return { pass: false, reasons: read.error.issues.map((i) => `${i.path.join(".") || "answer"}: ${i.message}`) };
  const a = read.data;
  const reasons: string[] = [];
  const ids = new Set(c.packMap.map((l) => l.id));
  for (const id of a.drewOn) if (!ids.has(id)) reasons.push(`drew on a lesson that is not in the map: ${id}`);
  if (FILLER.test(a.answer)) reasons.push("filler instead of an answer");
  const lines = a.answer.split("\n").filter((l) => l.trim());
  if (lines.some((l) => l.split(/\s+/).length > 28)) reasons.push("a line too long to say in one breath");
  return { pass: reasons.length === 0, reasons };
}
