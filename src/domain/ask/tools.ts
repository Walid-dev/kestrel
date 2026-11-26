// The read tools every Ask has (v0.8, step 3; the web on every page since 2026-11-25), in one place: read one item by
// its id, search the web, read a web page. A page's own find stays with its app (each knows its data). Ask's prompt
// lists them with when each helps and its shape (toolsText), and Ask's loop runs them (domain/ask/ask.ts). The search
// and the page reader are the model door's own, as Research and the deep checks use them.
// Every page has the web, in one of two ways (WebMode). A page without my things (News, Research, Searches, the
// field's lessons and their quiz: its helper lists the web) searches as the model writes, and opens no document or
// lesson of mine, so nothing of mine can go into a search there. A page of my own (Notes, Writing, Applications,
// Tasks, my prepared answers, my own lessons and their quiz) shows each search as a card with its exact words, which
// runs only on my tap, and its page reader opens only an address one of my approved searches returned: nothing of mine
// leaves in a search I didn't see, or in an address.
import type { DatabaseSync } from "node:sqlite";
import { fetchPage, webSearch } from "../../ai/web.ts";
import type { Settings } from "../../platform/config.ts";
import { isMine } from "../learn/ask.ts";
import { getLesson, lessonText } from "../learn/lessons.ts";
import { getDocument } from "../notes/documents.ts";
import { getListing } from "../search/listings.ts";

export type ToolName = "read" | "web" | "page";
// free: searches run as the model writes them; tap: each waits for my tap, its words in sight
export type WebMode = "free" | "tap";
// a page an answer found or read, by the number it cites it with ([2]): numbered across the whole conversation (after
// the page's own numbered sources, a report's), so a number means one page wherever it is cited
export type Source = { n: number; title: string; url: string };

const READ_CHARS = 6000;
const HITS = 6; // the door gives about three a search; a few more never hurt
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
export const isTool = (k: string): k is ToolName => k === "read" || k === "web" || k === "page";
// a page whose helper lists the web searches freely; any other is a page of my own
export const webMode = (tools: ToolName[]): WebMode => (tools.includes("web") ? "free" : "tap");
// what Live says while each runs
export const DOING: Record<ToolName, string> = {
  read: "Reading what the page names",
  web: "Searching the web",
  page: "Reading a page",
};

// one item by its ref, as links name them: a lesson, a listing, a document in Notes
function readRef(db: DatabaseSync, ref: string): string {
  const [kind, ...rest] = ref.split(":");
  const id = rest.join(":");
  if (kind === "lesson") {
    const l = getLesson(db, id);
    return l ? `${l.title}\n${lessonText(l.body).filter(Boolean).join("\n")}` : "";
  }
  if (kind === "listing") {
    const l = getListing(db, id);
    if (!l) return "";
    const d = l.data;
    return [
      `${str(d.title)}${str(d.org) || str(d.company) ? ` at ${str(d.org) || str(d.company)}` : ""}`,
      `Stage: ${l.status}; found ${l.found.slice(0, 10)}; ${l.link}`,
      str(d.why) && `The model's read: ${str(d.why)}`,
      str(d.description) || str(d.excerpt),
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (kind === "document") {
    const doc = getDocument(db, id);
    return doc ? `${doc.name}\n${doc.text}` : "";
  }
  return "";
}

// read: where searches run without my tap, a document of mine, my prepared answer or a lesson of my own stays shut,
// since its words could go into a search next
export function readLook(db: DatabaseSync, args: unknown, mode: WebMode): string {
  const ref = str((args as { ref?: unknown } | null)?.ref);
  if (mode === "free" && ref.startsWith("document:")) return `${ref}: a document isn't opened on a page with the web.`;
  if (mode === "free" && ref.startsWith("lesson:") && isMine(db, ref.slice("lesson:".length)))
    return `${ref}: a lesson of my own isn't opened on a page with the web.`;
  const text = readRef(db, ref);
  return text ? `${ref}:\n${text.slice(0, READ_CHARS)}` : `${ref || "(no ref)"}: nothing by that id.`;
}

// a search's words as they show: what draws nothing goes before the card and the search see them (zero-width and
// format characters, the tag characters that can spell a hidden text, controls, private-use and unassigned code
// points, and the other default-ignorable ones), any run of spaces or line breaks is one space, so the words on my
// card are exactly the words sent (review: hidden words)
export const visibleWords = (s: string): string =>
  s
    .replace(/\s/gu, " ")
    .replace(/[\p{C}\p{Default_Ignorable_Code_Point}]/gu, "")
    .replace(/ {2,}/g, " ")
    .trim();
export const queryOf = (args: unknown): string =>
  Array.from(visibleWords(str((args as { query?: unknown } | null)?.query)))
    .slice(0, 200) // by code point, so a cut never leaves half a character
    .join("");

// a page's number: the one it has in the conversation already, or the next (added to this answer's own)
export function cite(known: Source[], mine: Source[], url: string, title: string): number {
  const had = [...known, ...mine].find((s) => s.url === url);
  if (had) return had.n;
  const n = Math.max(0, ...known.map((s) => s.n), ...mine.map((s) => s.n)) + 1;
  mine.push({ n, title, url });
  return n;
}

// a web search: what goes back to the model (each hit with its number, or plainly that it found nothing or didn't
// work, so the answer says so instead of making up what the search would have said) and what its card says
export async function searchLook(
  settings: Settings,
  query: string,
  known: Source[],
  mine: Source[],
): Promise<{ text: string; state: "done" | "failed"; result: string }> {
  const { hits, failed } = await webSearch(settings.models, query);
  if (failed)
    return {
      text: `The web search for "${query}" didn't work (${failed}). Say plainly that it failed, answer only from what you know, and say what you couldn't check.`,
      state: "failed",
      result: "The search didn't work.",
    };
  if (!hits.length)
    return {
      text: `The web search for "${query}" found nothing. Say so plainly, and never fill the gap with facts you aren't sure of.`,
      state: "failed",
      result: "Nothing found.",
    };
  const shown = hits.slice(0, HITS);
  const lines = shown.map(
    (h) => `[${cite(known, mine, h.url, h.title)}] ${h.title} (${h.url})\n${h.snippet.slice(0, 400)}`,
  );
  return {
    text: `THE WEB SEARCH FOR "${query}" (cite a result by its number, as [2]):\n${lines.join("\n")}`,
    state: "done",
    result: `${shown.length} ${shown.length === 1 ? "result" : "results"}`,
  };
}

// a web page as plain text, with its number: any public https page where searches run freely; on a page of my own,
// only one that one of my approved searches returned (a source of the conversation already)
export async function pageLook(
  settings: Settings,
  args: unknown,
  mode: WebMode,
  known: Source[],
  mine: Source[],
): Promise<string> {
  const url = str((args as { url?: unknown } | null)?.url);
  if (!/^https:\/\//.test(url)) return `${url || "(no url)"}: only an https page can be read.`;
  if (mode === "tap" && ![...known, ...mine].some((s) => s.url === url))
    return `${url}: here only a page one of my approved searches returned can be opened.`;
  try {
    const text = await fetchPage(settings.models, url, READ_CHARS);
    return `[${cite(known, mine, url, "")}] ${url}:\n${text || "(the page had no words to read)"}`;
  } catch (e) {
    return `${url}: it didn't open (${(e instanceof Error ? e.message : String(e)).slice(0, 160)}). Say so if it matters.`;
  }
}

// the tools as Ask's prompt lists them after the page's own: each a fenced block of JSON, as a page's find is, then
// when to search and how to cite
export function toolsText(mode: WebMode): string {
  const tap = mode === "tap";
  return [
    "To look further before you answer, write one of these; kestrel runs it and gives you what it returned (two",
    "rounds of looks at most, then answer):",
    tap
      ? '- to open a lesson, a listing or a document the page or a link names, to answer from its own words: ```read\n{"ref": "lesson:<id>" | "listing:<id>" | "document:<id>"}\n```'
      : '- to open a lesson or a listing the page or a link names, to answer from its own words: ```read\n{"ref": "lesson:<id>" | "listing:<id>"}\n```',
    '- to search the web: ```web\n{"query": "<a few plain words, never anything about me>"}\n```',
    tap ? "  On this page I see the search's exact words first, and it runs only if I tap Search: one at a time." : "",
    tap
      ? '- to read a page one of my searches here returned, when its snippet isn\'t enough: ```page\n{"url": "https://…"}\n```'
      : '- to read one page a search returned or the page links, when its snippet isn\'t enough: ```page\n{"url": "https://…"}\n```',
    "Search only when the answer needs it: facts that change (versions, prices, news, dates, who holds a job), something",
    "you don't know, or when I ask you to look something up. Never by routine, and not for what the page or what you know",
    "already answers. Cite each fact you took from the web with its source's number right after it, as [2]. When a",
    "search found nothing or didn't work, say so plainly and answer only from what you know: never invent what it would",
    "have said.",
  ]
    .filter(Boolean)
    .join("\n");
}
