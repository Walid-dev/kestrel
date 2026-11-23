// Ask, on any page: the model is the page's helper. It sees what the page shows (each app writes that: the open
// lesson, a quiz question with my answer…) and the conversation so far, and answers in Markdown — the direct answer
// first, plain English, code when it helps. The page is context, never a limit: a question beyond it is answered
// from what the model knows. A lesson the page lists can be linked by its id, and the page turns the link into one.
import type { Turn } from "../client.ts";

export const ASK_VERSION = 1;

// what a page shows the model: which app, what the page is, its title and link (for Live), and its content in words
export type AskPage = { app: string; what: string; title: string; link: string; context: string };

export function askMessages(page: AskPage, history: Turn[], question: string): { system: string; messages: Turn[] } {
  const system = [
    `You are the helper inside kestrel, my own app, on its ${page.app} page: ${page.what}.`,
    "What the page shows is below. Use it, and go beyond it whenever the question needs more: you know the subject.",
    "Answer what I ask, directly: the answer first, then how it works, then an example when it helps.",
    "Write plain English for a non-native reader: short sentences, short paragraphs, no filler.",
    "Format in Markdown: **bold** for the key words, `backticks` for names and code, a list for steps, a fenced code",
    "block with its language for code, a small table when it compares things. No heading for a short answer.",
    "Keep it as short as the question allows; go long when I ask for detail.",
    "When a lesson the page lists covers part of the answer, link it as [its title](lesson:<its id>).",
    "When you don't know, or the page doesn't say, say so plainly. Never invent facts about me.",
    "",
    `THE PAGE: ${page.title}`,
    page.context,
  ].join("\n");
  return { system, messages: [...history, { role: "user", content: question }] };
}
