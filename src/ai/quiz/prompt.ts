// The quiz's prompts: marking one answer against the lesson's own answer (the meaning, never the wording), and,
// for a lesson with no check of its own, writing one question that checks its main idea.
export const QUIZ_VERSION = 1;
export const SYSTEM = "You are a fair, kind teacher. Reply with ONE JSON OBJECT only, no prose around it.";

export type Marking = { title: string; question: string; expected: string; lesson: string };

export function gradePrompt(m: Marking, answer: string): string {
  return [
    `The lesson: ${m.title}`,
    "What the lesson teaches (for you; don't quote it):",
    m.lesson.slice(0, 6000),
    "",
    `The question: ${m.question}`,
    `The lesson's answer: ${m.expected}`,
    `My answer: ${answer}`,
    "",
    "Mark the meaning, not the wording: my own words, a synonym or a small typo are fine.",
    "right: the key idea is there. partly: part of it, or right with one mistake. wrong: missing or mistaken.",
    "Then tell me why in one or two plain sentences, speaking to me as you. Then give the correct answer in one to",
    "four short lines; when the answer is code, a line can be an object with the code.",
    'Answer: {"verdict": "right" | "partly" | "wrong", "why": "<one or two sentences>",',
    '"correct": ["<a short line>", {"code": "<code, when it helps>"}]}',
  ].join("\n");
}

export function makePrompt(title: string, lesson: string): string {
  return [
    `The lesson: ${title}`,
    lesson.slice(0, 6000),
    "",
    "Write one question that checks the lesson's main idea, answerable in a sentence or two, and its answer.",
    'Answer: {"q": "<the question>", "a": "<the answer, one or two short sentences>"}',
  ].join("\n");
}
