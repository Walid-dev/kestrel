// The quiz's prompts: marking one answer against the lesson's own answer (the meaning, never the wording), and,
// for a lesson with no check of its own, writing one question that checks its main idea.
export const QUIZ_VERSION = 3;
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

// outside my own packs, a question and an explanation are about the field, never one person's setup (my ask,
// 2026-11-23: a quiz on AI models asked how big my own model was)
const FIELD =
  "Keep to the subject as the field knows it: never ask or explain through one person's own setup (their machine, their models, their apps, their projects), even where the lesson mentions it.";

// avoid: the lesson's own questions, so a new one asks about something else
export function makePrompt(title: string, lesson: string, mine = false, avoid: string[] = []): string {
  return [
    `The lesson: ${title}`,
    lesson.slice(0, 6000),
    "",
    "Write one question that checks the lesson's main idea, answerable in a sentence or two, and its answer.",
    ...(avoid.length
      ? [
          "These questions are already asked; write a new one on another point of the lesson, not a rewording:",
          ...avoid.map((q) => `- ${q}`),
        ]
      : []),
    ...(mine ? [] : [FIELD]),
    'Answer: {"q": "<the question>", "a": "<the answer, one or two short sentences>"}',
  ].join("\n");
}

// the explanation after a question: a small lesson of its own, so the answer is understood, not just read. Ground
// truth is the lesson; the model adds what it knows to make it clear (a breakdown, an analogy, code when the topic is
// technical, the usual mistake, a line to keep)
export const EXPLAIN_VERSION = 2;
export function explainPrompt(m: Marking, mine = false): string {
  return [
    ...(mine ? [] : [FIELD, ""]),
    `The lesson: ${m.title}`,
    "What the lesson teaches (the ground truth; add what you know to make it clear, never contradict it):",
    m.lesson.slice(0, 8000),
    "",
    `The question: ${m.question}`,
    `The lesson's short answer: ${m.expected}`,
    "",
    "Explain the answer so I truly understand it, as a patient teacher for a developer who learns by understanding.",
    "Plain English, short sentences, one idea per line: each line is read aloud on its own. Speak to me as you.",
    "The parts, in this order, each under its subhead except the analogy:",
    "- In one line: the answer in one plain sentence.",
    "- Break it down: three to six lines, step by step: what each term means, how it works, how the things differ.",
    "- Picture it: one everyday analogy, as a callout titled Picture it, with no subhead of its own.",
    "- In code, only when the topic is technical: a short realistic example (5 to 20 lines) with a comment, in the",
    "  language's own comment style, on the lines that matter; when the question compares two things, show both, one",
    "  code block each, or a table.",
    "- Watch out: the usual mistake or confusion, in one or two lines.",
    "Then one short line to remember.",
    "",
    "The shape, using only these block types:",
    "{",
    '  "blocks": [',
    '    {"type": "subhead", "text": "<the part\'s name>"},',
    '    {"type": "lines", "lines": ["<a line>", "..."]},',
    '    {"type": "callout", "title": "Picture it", "text": ["<a line>"]},',
    '    {"type": "code", "text": "<the code, with \\n between its lines>"},',
    '    {"type": "table", "head": ["<column>", "..."], "rows": [["<cell>", "..."]]}',
    "  ],",
    '  "remember": "<one short line>"',
    "}",
  ].join("\n");
}
