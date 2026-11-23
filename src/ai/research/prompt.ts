// Research's prompts: the plan (which searches to run, for a deep look) and the report, written like a lesson — the
// point first, short lines read aloud one by one, each technical word explained, only what the numbered pages say.
import { catalogLines } from "../../shared/blocks.ts";
import { type Hit, hitsText } from "../web.ts";

export const RESEARCH_VERSION = 3;
export const SYSTEM = "You research for one person. Reply with ONE JSON OBJECT only, no prose around it.";

export type Level = "quick" | "deep";

// before searching: whether the answer depends on facts about me it doesn't have. What it knows about me helps it ask
// less; nothing about me goes into a search
export function askPrompt(question: string, about: string): string {
  return [
    `The question: ${question}`,
    "",
    "What you know about the person asking:",
    about.trim() || "(nothing yet)",
    "",
    "Before researching, decide whether a good answer depends on facts about this person you don't have: their",
    "situation, goals, constraints, health, budget, place or preferences. If it does, ask up to three short questions,",
    "the most useful first, each answerable in a few words. Ask nothing the question or what you know already says.",
    "If a good answer doesn't depend on them, ask none.",
    'Answer: {"questions": ["<a short question>"]}',
  ].join("\n");
}

// the searches: from the question and my answers to its questions, never from what is kept about me
export function planPrompt(question: string, answers = ""): string {
  return [
    "Plan a web search that answers this question well. It can be about anything: health, money, travel, a purchase,",
    "a decision, how something works, tech.",
    "Write 3 or 4 short search queries, each from a different angle (what it is, how it works or compares, recent",
    "facts, practical advice), in the words a web page on the topic would use. Keep personal details out of them.",
    `The question: ${question}`,
    ...(answers ? ["What the person answered:", answers] : []),
    'Answer: {"queries": ["<query>", "..."]}',
  ].join("\n");
}

// a page the model read: its number matches the hits list, so [n] in the report points at it
export type Read = { n: number; title: string; url: string; text: string };

export function reportPrompt(
  question: string,
  level: Level,
  hits: Hit[],
  pages: Read[],
  person: { about?: string; answers?: string } = {},
): string {
  const size =
    level === "quick"
      ? "8 to 15 lines in all, in one or two blocks"
      : "20 to 40 lines in all, under 3 to 6 subheads, with a table or a callout where it helps";
  return [
    `The question: ${question}`,
    ...(person.answers ? ["", "What the person answered before you searched:", person.answers] : []),
    ...(person.about
      ? ["", "About the person (fit the answer to them; don't repeat it back to them):", person.about]
      : []),
    "",
    "Write the answer as a lesson for someone who wants to understand it quickly and remember it. It can be about",
    "anything; answer for this person, with what they should do. When it touches health, money or the law, say once,",
    "plainly, when a professional should be asked, without hedging every line.",
    "The plain style: the point first, then how it works, then what to do with it. Short sentences, one idea each,",
    "active voice, no filler, no hedges. Each line is read aloud on its own: one or two sentences per line.",
    "Explain each technical word the first time it appears, in a few plain words.",
    "Use only what the numbered pages say. Cite a page as [n] at the end of the line it supports.",
    "When the pages disagree or don't settle something, say so in unsure; never fill a gap with a guess.",
    `Length: ${size}.`,
    "",
    "The shape:",
    "{",
    '  "title": "<the question as a short title>",',
    '  "short": "<the answer in one or two sentences>",',
    '  "blocks": [',
    '    {"type": "lines", "lines": ["<a line>", "..."]},',
    '    {"type": "subhead", "text": "<a short heading>"},',
    '    {"type": "callout", "title": "<a label, like Watch out or In short>", "text": ["<a line>"]},',
    '    {"type": "table", "head": ["<column>", "..."], "rows": [["<cell>", "..."]]},',
    '    {"type": "code", "text": "<code, only when the question is about code>"}',
    "  ],",
    '  "words": [{"w": "<a term>", "m": "<what it means, plainly>"}],',
    '  "unsure": ["<what the pages did not settle>"],',
    '  "sources": [<the numbers of the pages the answer used>]',
    "}",
    "A block can also be a drawing the page draws, only when the subject has its shape, at most two in a report:",
    ...catalogLines(["flow", "compare", "tree", "timeline", "chart"], "typed"),
    "",
    "The search results:",
    hitsText(hits),
    "",
    "The pages, read:",
    ...pages.map((p) => `[${p.n}] ${p.title} (${p.url})\n${p.text}`),
  ].join("\n");
}
