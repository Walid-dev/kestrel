// The read tools every agent in kestrel may use (v0.8, step 3), in one place: read one item by its id, search the web,
// read a web page. A page's own find stays with its app (each knows its data). Each tool says when it helps and its
// shape; Ask's prompt lists the ones its page allows, and Ask's loop runs them. Web search and page reading are the
// model door's own, as Research and the deep checks use them. A page about my own things (notes, writing, the
// applications, tasks, my prepared answers and my own packs) gets no web tool, so nothing of mine goes into a search;
// and a page with the web opens no document of mine.
import type { DatabaseSync } from "node:sqlite";
import { fetchPage, searchWeb } from "../../ai/web.ts";
import type { Settings } from "../../platform/config.ts";
import { getLesson, lessonText } from "../learn/lessons.ts";
import { getDocument } from "../notes/documents.ts";
import { getListing } from "../search/listings.ts";

export type ToolName = "read" | "web" | "page";
type O = Record<string, unknown>;
const READ_CHARS = 6000;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// a page with a web tool opens lessons and listings only: a document of mine read there could go into a search next
const withWeb = (tools: ToolName[]) => tools.includes("web") || tools.includes("page");

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

export const TOOLS: Record<
  ToolName,
  {
    when: string;
    shape: string;
    doing: string;
    run: (db: DatabaseSync, settings: Settings, args: O, tools: ToolName[]) => Promise<string>;
  }
> = {
  read: {
    when: "open a lesson, a listing or a document the page or a link names, to answer from its own words",
    shape: '{"ref": "lesson:<id>" | "listing:<id>" | "document:<id>"}',
    doing: "Reading what the page names",
    run: async (db, _s, a, tools) => {
      const ref = str(a.ref);
      if (withWeb(tools) && ref.startsWith("document:"))
        return `${ref}: a document isn't opened on a page with the web.`;
      const text = readRef(db, ref);
      return text ? `${ref}:\n${text.slice(0, READ_CHARS)}` : `${ref || "(no ref)"}: nothing by that id.`;
    },
  },
  web: {
    when: "search the web when the answer needs facts you may not know or that change (versions, prices, news)",
    shape: '{"query": "<a few plain words, never anything about me>"}',
    doing: "Searching the web",
    run: async (_db, settings, a) => {
      const query = str(a.query).slice(0, 200);
      if (!query) return "(no query)";
      const hits = await searchWeb(settings.models, query);
      return hits.length
        ? hits
            .slice(0, 6)
            .map((h, i) => `[${i + 1}] ${h.title} (${h.url})\n${h.snippet}`)
            .join("\n")
        : `Nothing found for "${query}".`;
    },
  },
  page: {
    when: "read one page a web search returned, when its snippet isn't enough",
    shape: '{"url": "https://…"}',
    doing: "Reading a page",
    run: async (_db, settings, a) => {
      const url = str(a.url);
      if (!/^https:\/\//.test(url)) return `${url || "(no url)"}: only an https page can be read.`;
      return `${url}:\n${await fetchPage(settings.models, url, READ_CHARS)}`;
    },
  },
};
export const isTool = (k: string): k is ToolName => Object.hasOwn(TOOLS, k);

// the tools in a prompt, each a fenced block of JSON, as the page's find is
export const toolLines = (names: ToolName[]): string[] =>
  names.map((n) =>
    n === "read" && withWeb(names)
      ? `- to open a lesson or a listing the page or a link names, to answer from its own words: \`\`\`read\n{"ref": "lesson:<id>" | "listing:<id>"}\n\`\`\``
      : `- to ${TOOLS[n].when}: \`\`\`${n}\n${TOOLS[n].shape}\n\`\`\``,
  );

// one look the model asked for; a tool that fails says so in words, so the model answers without it
export async function runTool(
  db: DatabaseSync,
  settings: Settings,
  name: ToolName,
  args: unknown,
  tools: ToolName[],
): Promise<string> {
  try {
    return await TOOLS[name].run(db, settings, args && typeof args === "object" ? (args as O) : {}, tools);
  } catch (e) {
    return `${name} didn't work: ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`;
  }
}
