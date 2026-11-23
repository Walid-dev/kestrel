// Writing's prompts, the way an application writes its texts: the apply skill's own step for them, followed as
// written, with my voice, my stories and my facts, and the posting. A text is a cover letter, the answer to a form's
// question, or any text I describe. A second prompt fixes exactly what the applications' check named, with the same
// files at hand. A third reviews the text as the company would read it (the match, the fit, the voice) and writes the
// better version, which the check reads again before it is kept.
export const LETTER_VERSION = 2;
export const SYSTEM =
  "You write for one person applying to a job, in their voice, from their own files only. Reply with ONE JSON OBJECT only, no prose around it.";

export type Kind = "letter" | "answer" | "text";
// what to write, in the step's own terms: the letter as letter.txt, an answer in voice.md's shape of an answer
export function whatToWrite(kind: Kind, ask: string): string {
  if (kind === "answer")
    return [
      `Write the answer to this question on the application form: ${ask}`,
      "In voice.md's shape and length of an answer: plain, direct, from one story when one fits.",
    ].join("\n");
  if (kind === "text") return `Write this, for this application: ${ask}`;
  return [
    "Write letter.txt as the step says: the greeting, the paragraphs, the close and my name, a blank line between",
    "paragraphs; no HTML, letterhead or date.",
  ].join("\n");
}

export type LetterInput = {
  step: string; // the apply skill's letter step, as written
  voice: string;
  stories: string;
  profile: string;
  title: string;
  org: string;
  job: string;
};

const context = (i: LetterInput) =>
  [
    "How an application writes its texts (the apply skill's step; follow it exactly):",
    i.step,
    "",
    "voice.md, the voice and the shape (take its tone, shape and length; never copy its example sentences):",
    i.voice,
    "",
    "stories.md, the only facts a letter may use:",
    i.stories,
    "",
    "profile.md, my facts (the name for the close):",
    i.profile,
    "",
    `The job: ${i.title}${i.org ? ` at ${i.org}` : ""}`,
    "The posting:",
    i.job,
  ].join("\n");

export function letterPrompt(i: LetterInput, kind: Kind = "letter", ask = ""): string {
  return [
    context(i),
    "",
    whatToWrite(kind, ask),
    "First name the two or three needs the text answers and the story for each.",
    "Give the text as its paragraphs in order, one string each.",
    'Answer: {"needs": ["<a need>"], "stories": ["<the story used for it>"], "text": ["<a paragraph>", "..."]}',
  ].join("\n");
}

export function fixPrompt(i: LetterInput, letter: string, findings: string): string {
  return [
    context(i),
    "",
    "The text:",
    letter,
    "",
    "The applications' check named these problems:",
    findings,
    "",
    "Fix exactly what it names: take out or correct each fact my files don't back, rewrite each copied phrase in",
    "new words, replace dashes used as punctuation. Change nothing else.",
    'Answer: {"text": ["<a paragraph>", "..."]} (the fixed text, its paragraphs in order)',
  ].join("\n");
}

export const REVIEW_VERSION = 1;
// the review the applications' check can't do: words it can't judge, only a reader can
export function reviewPrompt(i: LetterInput, text: string, kind: Kind = "letter", ask = ""): string {
  return [
    context(i),
    "",
    kind === "answer" ? `The form's question: ${ask}` : kind === "text" ? `What was asked for: ${ask}` : "",
    "The text written for this application:",
    text,
    "",
    `Review it as the person hiring for ${i.title || "this job"}${i.org ? ` at ${i.org}` : ""} would read it, then make it better.`,
    "- The match: it names this company and this job rightly, and nothing from another company or another job.",
    "- The fit: it answers the two or three things this posting asks most, each with a real story from stories.md.",
    "- Specific: a sentence that could go to any company unchanged is weak; say what would make it this company's.",
    "- The voice: it reads like voice.md (its tone, shape and length), told forward and in the positive.",
    "- The facts: only what stories.md and profile.md back.",
    "Name at most five issues, the most important first: the words each is about, why they weaken the text, the fix.",
    "Then write the better version: the same text with those fixes, in the same voice, shape and length, from",
    "stories.md's facts only. When the text is already strong, the verdict is ready: no issue, the text given back.",
    'Answer: {"verdict": "ready" | "better", "match": {"company": true | false, "job": true | false, "note": "<one',
    'line>"}, "issues": [{"quote": "<the words>", "why": "<why they weaken it>", "fix": "<what to do>"}], "better":',
    '["<a paragraph>", "..."]}',
  ]
    .filter((l, n) => l !== "" || n !== 2)
    .join("\n");
}
