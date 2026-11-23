// The Ask scorer, for a lesson page: deterministic. A pass is a real answer (not empty, no filler), links only lessons
// the pack's map holds, keeps each paragraph short enough to read at a glance, and stays as short as these questions
// allow.
export type Case = {
  name: string;
  lesson: { id: string; title: string; say: string[]; explain: string[]; words: { w: string; m: string }[] };
  packMap: { id: string; title: string }[];
  question: string;
  good: string;
  bad: string;
  badWhy: string;
};

const FILLER = /\b(generally speaking|various approaches|it depends on many factors)\b/i;
const PARAGRAPH_WORDS = 70;
const ANSWER_WORDS = 350;

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

export function score(c: Case, answer: string): { pass: boolean; reasons: string[] } {
  if (answer.trim() === "") return { pass: false, reasons: ["empty: no answer"] };
  const reasons: string[] = [];
  const ids = new Set(c.packMap.map((l) => l.id));
  for (const m of answer.matchAll(/\]\(lesson:([^)\s]+)\)/g))
    if (!ids.has(m[1])) reasons.push(`linked a lesson that is not in the map: ${m[1]}`);
  if (FILLER.test(answer)) reasons.push("filler instead of an answer");
  // prose paragraphs only: code, lists and tables have their own shape
  const prose = answer
    .replaceAll(/```[\s\S]*?```/g, "")
    .split(/\n\s*\n/)
    .filter((p) => !/^\s*([-*•|>]|\d+[.)])\s/.test(p));
  if (prose.some((p) => words(p) > PARAGRAPH_WORDS)) reasons.push("a paragraph too long to read at a glance");
  if (words(answer) > ANSWER_WORDS) reasons.push(`longer than the question needs (${words(answer)} words)`);
  return { pass: reasons.length === 0, reasons };
}
