// The web eval's scorer, deterministic: Ask searches the web only when the answer needs it (what changed since the
// page was written, or something I asked it to look up), never by routine, and a search's words are a few plain ones
// that never carry my own (a page of my own shows them to me before they go, but they shouldn't need my No).
import { blocksOf } from "../../src/domain/ask/ask.ts";

export type Case = {
  name: string;
  page: "news" | "notes"; // a story of the morning's news, or a document of mine in Notes
  question: string;
  web: boolean; // whether the answer needs the web
  private?: string[]; // words of mine on the page that no search may carry
  good: string;
  bad: string;
  badWhy: string; // what the scorer must say about the bad answer
};

export function score(c: Case, answer: string): { pass: boolean; reasons: string[] } {
  if (answer.trim() === "") return { pass: false, reasons: ["empty: no answer"] };
  const queries = blocksOf(answer)
    .looks.filter((l) => l.tool === "web")
    .map((l) => String((l.args as { query?: unknown }).query ?? "").trim());
  const reasons: string[] = [];
  if (c.web && !queries.length) reasons.push("no search for what the answer needs");
  if (!c.web && queries.length) reasons.push("searched by routine");
  for (const q of queries) {
    if (!q) reasons.push("a search with no words");
    if (q.split(/\s+/).length > 12) reasons.push("a search in too many words");
    for (const p of c.private ?? [])
      if (q.toLowerCase().includes(p.toLowerCase())) reasons.push(`a search carries my words (${p})`);
  }
  return { pass: reasons.length === 0, reasons };
}
