// Ask, on any page: the model is the page's helper. It sees what the page shows (each app writes that: the open
// lesson, a quiz question with my answer…) and the conversation so far, and answers in Markdown — the direct answer
// first, plain English, code when it helps. The page is context, never a limit: a question beyond it is answered
// from what the model knows, or from the web when the answer needs it (the tools every page lists,
// domain/ask/tools.ts). A lesson the page lists can be linked by its id, and the page turns the link into one.
import { catalogLines } from "../../shared/blocks.ts";
import type { Turn } from "../client.ts";

// v6: the web on every page, searched only when the answer needs it, each fact from it cited by its number
export const ASK_VERSION = 6;
// an answer's room, its thinking and its words together (the evals use it too). 12,000, as Writing's calls, where 6,000
// ran out while the fast model thought about a change to many listings; the time limit (client.ts) already stops a
// call at ten minutes, so the room adds no wait beyond it
export const ASK_MAX_TOKENS = 12_000;

// what a page shows the model: which app, what the page is, its title and link (for Live), its content in words, and
// what the model may do there (find, a change to propose, the read tools), in the app's own words. sources: the page's
// own numbered sources, a report's, which the context cites as [n]: the conversation's web pages number after them
export type AskPage = {
  app: string;
  what: string;
  title: string;
  link: string;
  context: string;
  tools?: string;
  sources?: { n: number; title: string; url: string }[];
};

export function askSystem(page: AskPage): string {
  return [
    `You are the helper inside kestrel, my own app, on its ${page.app} page: ${page.what}.`,
    "What the page shows is below. Use it, and go beyond it whenever the question needs more: you know the subject.",
    "Answer what I ask, directly: the answer first, then how it works, then an example when it helps.",
    "Write plain English for a non-native reader: short sentences, short paragraphs, no filler.",
    "Format in Markdown: **bold** for the key words, `backticks` for names and code, a list for points, a fenced code",
    "block with its language for code, a small table when it compares things. No heading for a short answer.",
    "A drawing makes an answer easier to read when its subject has that shape. Use one only then: the one kind whose",
    "line below fits best, in place of a list or a table that would say the same; at most two in an answer, none in",
    "a short one. Each is a fenced block of JSON with its kind as the fence's language; the page draws it:",
    ...catalogLines(["flow", "compare", "tree", "timeline", "chart", "callout", "check"], "fence"),
    "Keep it as short as the question allows; go long when I ask for detail.",
    "When a lesson the page lists covers part of the answer, link it as [its title](lesson:<its id>).",
    "When you don't know, or the page doesn't say, say so plainly. Never invent facts about me.",
    "",
    `THE PAGE: ${page.title}`,
    page.context,
    ...(page.tools ? ["", page.tools] : []),
  ].join("\n");
}

export function askMessages(page: AskPage, history: Turn[], question: string): { system: string; messages: Turn[] } {
  return { system: askSystem(page), messages: [...history, { role: "user", content: question }] };
}
