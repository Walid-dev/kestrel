// Research's page gathering, for every app that reads the web (Research, Shopping): the queries searched one after
// another, their hits merged (each link once, a few from each search, in the order found), then a few more pages than
// needed opened at once, and the first that read well kept, in the order tried. Each app says how it searches, how it
// reads a page (the door's reader for Research; kestrel's own fetch first for Shopping) and which hits to try.
import type { Hit } from "../ai/web.ts";

// a page kept: its number among the hits (as the report cites it), its title, link and words
export type GatheredPage = { n: number; title: string; url: string; text: string };

export type Gather = {
  search: (query: string) => Promise<Hit[]>;
  read: (hit: Hit) => Promise<string>;
  pages: number; // pages to keep
  perSearch: number; // hits taken from each search
  spare?: number; // pages opened beyond the need, for the ones that fail (3)
  minChars?: number; // a page shorter than this reads as failed (300)
  order?: (hits: Hit[]) => Hit[]; // which hits to try, in order; all of them in the order found when unsaid
  onSearch?: (queries: number) => void; // told as the searches start
  onRead?: (pages: number) => void; // told as the reading starts
};

// the hits of every search, each link once, in the order found
export function mergeHits(lists: Hit[][], perSearch: number): Hit[] {
  const out: Hit[] = [];
  for (const list of lists)
    for (const h of list.slice(0, perSearch)) if (!out.some((x) => x.url === h.url)) out.push(h);
  return out;
}

export async function gatherPages(queries: string[], how: Gather): Promise<{ hits: Hit[]; pages: GatheredPage[] }> {
  how.onSearch?.(queries.length);
  const lists: Hit[][] = [];
  for (const q of queries) lists.push(await how.search(q));
  const hits = mergeHits(lists, how.perSearch);
  if (!hits.length) return { hits, pages: [] };
  how.onRead?.(how.pages);
  const tries = (how.order ? how.order(hits) : hits).slice(0, how.pages + (how.spare ?? 3));
  const opened = await Promise.allSettled(tries.map((h) => how.read(h)));
  const pages: GatheredPage[] = [];
  opened.forEach((o, i) => {
    if (o.status === "fulfilled" && o.value.length > (how.minChars ?? 300) && pages.length < how.pages)
      pages.push({ n: hits.indexOf(tries[i]) + 1, title: tries[i].title, url: tries[i].url, text: o.value });
  });
  return { hits, pages };
}
