// The web, read from this computer through the model door's own tools: oMLX's search (DuckDuckGo, no account or key)
// and its page fetch. A deep check and Research use them, with search words from a listing or my question, never
// from a profile.
import type { ModelSettings } from "./client.ts";

export type Hit = { title: string; url: string; snippet: string };

async function web<T>(settings: ModelSettings, path: "search" | "fetch", body: Record<string, string>): Promise<T> {
  const res = await fetch(`${settings.url}/web/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  const j = (await res.json()) as T & { ok?: boolean; error?: { message?: string } };
  if (!res.ok || j.ok === false) throw new Error(j.error?.message ?? `web ${path} answered ${res.status}`);
  return j;
}

export async function searchWeb(settings: ModelSettings, query: string): Promise<Hit[]> {
  try {
    const j = await web<{ results?: { title?: string; url?: string; snippet?: string }[] }>(settings, "search", {
      query,
    });
    return (j.results ?? [])
      .map((r) => ({ title: String(r.title ?? ""), url: String(r.url ?? ""), snippet: String(r.snippet ?? "") }))
      .filter((r) => /^https?:\/\//.test(r.url));
  } catch {
    return []; // no web this time: the check goes on with what kestrel knows
  }
}

// a page as plain text: links become their words, menus and short link lines go
export function readable(markdown: string, max = 8000): string {
  const text = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.split(/\s+/).length >= 4 || /\d/.test(l))
    .join("\n");
  const h = text.search(/^#{1,2} /m);
  return (h > 0 && h < text.length / 2 ? text.slice(h) : text).slice(0, max);
}

export async function fetchPage(settings: ModelSettings, url: string, max = 8000): Promise<string> {
  const j = await web<{ content?: string }>(settings, "fetch", { url });
  return readable(String(j.content ?? ""), max);
}

export const hitsText = (hits: Hit[]) =>
  hits.map((h, i) => `[${i + 1}] ${h.title} — ${h.url}\n${h.snippet.slice(0, 300)}`).join("\n");
