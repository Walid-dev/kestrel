// Research's prompts: the plan (which searches to run, for a deep look) and the report, written like a lesson — the
// point first, short lines read aloud one by one, each technical word explained, only what the numbered pages say.
import { type Hit, hitsText } from "../web.ts";

export const RESEARCH_VERSION = 1;
export const SYSTEM = "You research for one person. Reply with ONE JSON OBJECT only, no prose around it.";

export type Level = "quick" | "deep";

export function planPrompt(question: string): string {
  return [
    "Plan a web search that answers this question well.",
    "Write 3 or 4 short search queries, each from a different angle (what it is, how it works or compares, recent",
    "facts, practical advice), in the words a web page on the topic would use.",
    `The question: ${question}`,
    'Answer: {"queries": ["<query>", "..."]}',
  ].join("\n");
}

// a page the model read: its number matches the hits list, so [n] in the report points at it
export type Read = { n: number; title: string; url: string; text: string };

export function reportPrompt(question: string, level: Level, hits: Hit[], pages: Read[]): string {
  const size =
    level === "quick"
      ? "8 to 15 lines in all, in one or two blocks"
      : "20 to 40 lines in all, under 3 to 6 subheads, with a table or a callout where it helps";
  return [
    `The question: ${question}`,
    "",
    "Write the answer as a lesson for someone who wants to understand it quickly and remember it.",
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
    "",
    "The search results:",
    hitsText(hits),
    "",
    "The pages, read:",
    ...pages.map((p) => `[${p.n}] ${p.title} (${p.url})\n${p.text}`),
  ].join("\n");
}
