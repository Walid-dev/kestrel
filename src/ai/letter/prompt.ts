// The cover letter's prompts, the way an application writes one: the apply skill's own letter step, followed as
// written, with my voice, my stories and my facts, and the posting. A second prompt fixes exactly what the
// applications' check named, with the same files at hand.
export const LETTER_VERSION = 1;
export const SYSTEM =
  "You write one cover letter for one person, in their voice, from their own files only. Reply with ONE JSON OBJECT only, no prose around it.";

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

export function letterPrompt(i: LetterInput): string {
  return [
    context(i),
    "",
    "Write letter.txt as the step says: the greeting, the paragraphs, the close and my name, a blank line between",
    "paragraphs; no HTML, letterhead or date. First name the job's two or three main needs and the story for each.",
    'Answer: {"needs": ["<a need>"], "stories": ["<the story used for it>"], "letter": "<the whole letter, a blank line between paragraphs>"}',
  ].join("\n");
}

export function fixPrompt(i: LetterInput, letter: string, findings: string): string {
  return [
    context(i),
    "",
    "The letter:",
    letter,
    "",
    "The applications' check named these problems:",
    findings,
    "",
    "Fix exactly what it names: take out or correct each fact my files don't back, rewrite each copied phrase in",
    "new words, replace dashes used as punctuation. Change nothing else.",
    'Answer: {"letter": "<the fixed letter, a blank line between paragraphs>"}',
  ].join("\n");
}
