// A brief from the day's items, in two model calls and a check. The pick groups the items about one event into a story
// and chooses the day's 6 to 10; the best free link of each story is read whole (an AI lab's own page first); the
// write tells each story plainly. Then the code checks the answer, and trusts nothing it can check: a story's links
// are only items gathered for it (the model writes item numbers, never a link, and any web address in its words is
// cut), and every number it writes must be in its sources' text, or the story says so. No database here: the run
// (brief.ts) and the eval (evals/news/) both call it.
import { callModel, failureWords, type ModelAnswer, type ModelSettings, type Outcome } from "../../ai/client.ts";
import { hostOf } from "../../ai/news/feeds.ts";
import { type PromptItem, type PromptStory, pickPrompt, SYSTEM, writePrompt } from "../../ai/news/prompt.ts";
import { BriefAnswer, PickAnswer } from "../../ai/news/shape.ts";
import type { NewsBrief, NewsLink, NewsStory, Section } from "../../shared/news.ts";
import { pool } from "./gather.ts";
import { paywalled, type Source } from "./sources.ts";

// an item as a brief chooses from it, numbered for the prompts
export type WindowItem = {
  id: number;
  url: string;
  title: string;
  summary: string;
  at: string; // when it happened, or when it was first seen
  sources: Source[]; // every source that carried it, the first finder first
  score: number | null;
  thread: string | null;
  threadBy: string; // the short name of the source whose thread it is
  also?: string[]; // the same headline's links from other outlets, told with it and never told again
};
// a story the pick chose: its number (the order of importance), its section and its items, the main one first
export type Picked = { n: number; section: Section; ids: number[] };
// an article read for a story
export type Page = { url: string; host: string; title: string; text: string };

// the brief, and what it came from: the answers as the model gave them (the eval judges those as well), the stories
// picked, the links told (never to be told again), the articles read
export type Composed =
  | {
      ok: true;
      brief: NewsBrief;
      pick: PickAnswer;
      picked: Picked[];
      written: BriefAnswer;
      used: string[];
      pages: number;
      calls: ModelAnswer<unknown>[];
    }
  | { ok: false; why: string; calls: ModelAnswer<unknown>[] };

const STORIES = 10;
const PER_SECTION = 3;

// a failed call's reason, in the words the page shows: the one mapping every screen uses (ai/client.ts)
const WHY = (why: Outcome) => failureWords(why, "Make it now to try again");

export const promptItem = (i: WindowItem, now: Date): PromptItem => ({
  id: i.id,
  source: i.sources[0]?.name ?? "",
  section: i.sources[0]?.topic ?? "tech",
  hours: Math.max(0, Math.round((now.getTime() - Date.parse(i.at)) / 3_600_000)),
  score: i.score,
  paywall: paywalled(hostOf(i.url)),
  title: i.title,
  summary: i.summary,
});

// the pick, checked: items that exist and aren't in an earlier story, three stories a section at most, ten in all
export function readPick(answer: PickAnswer, items: WindowItem[]): Picked[] {
  const known = new Set(items.map((i) => i.id));
  const taken = new Set<number>();
  const perSection = new Map<Section, number>();
  const out: Picked[] = [];
  for (const s of answer.stories) {
    const ids = [...new Set(s.items)].filter((id) => known.has(id) && !taken.has(id));
    const count = perSection.get(s.section) ?? 0;
    if (!ids.length || count >= PER_SECTION) continue;
    for (const id of ids) taken.add(id);
    perSection.set(s.section, count + 1);
    out.push({ n: out.length + 1, section: s.section, ids });
    if (out.length === STORIES) break;
  }
  return out;
}

const firstParty = (i: WindowItem) => i.sources.some((s) => s.firstParty);

// each story's best link read whole, four at a time: a lab's own page first, never a paywalled one; a page that fails
// or reads under 300 characters leaves the story to its summaries
export function readStories(
  picked: Picked[],
  items: WindowItem[],
  readPage: (url: string) => Promise<string>,
): Promise<(Page | null)[]> {
  const byId = new Map(items.map((i) => [i.id, i]));
  return pool(picked, 4, async (p) => {
    const links = p.ids
      .map((id) => byId.get(id))
      .filter((i): i is WindowItem => Boolean(i) && !paywalled(hostOf(i?.url ?? "")))
      .sort((a, b) => Number(firstParty(b)) - Number(firstParty(a)));
    for (const i of links.slice(0, 2)) {
      try {
        const text = await readPage(i.url);
        if (text.length >= 300) return { url: i.url, host: hostOf(i.url), title: i.title, text: text.slice(0, 3000) };
      } catch {
        // the next link, or the summaries
      }
    }
    return null;
  });
}

// the model's words with every link and web address taken out: a link on the page comes from an item, never from them.
// An address with a scheme, a www. or a path goes (openai.com/blog/x), the sentence's own stop kept; a bare name
// (Claude.ai) stays, as plain text it links nowhere
const ADDRESS = /<?\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.|(?:[a-z0-9-]+\.)+[a-z]{2,}\/)[^\s<>"']*[^\s<>"'.,;:!?)]>?/gi;
export const clean = (s: string): string =>
  s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(ADDRESS, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();

const cutAt = (s: string, n: number) => {
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), n / 2)).trimEnd()}…`;
};

// the numbers that carry a claim: one with a decimal, a currency, a percent or a size, or of two digits or more (a
// lone digit is too common to check). Thousands' commas go, so 1,886 and 1886 are one number. Each keeps its unit
// (%, thousand, million, billion, trillion) and its currency: $40bn is not $40tn, nor 40%
const NUMBER =
  /([$€£¥]\s?)?(\d+(?:[.,]\d+)*)(\s?(?:%|per\s?cent\b|percent\b|bn\b|billion\b|tn\b|trillion\b|mn?\b|million\b|k\b|thousand\b))?/gi;
export type Num = { n: string; unit: string; cur: string };
const UNIT: [RegExp, string][] = [
  [/^(%|per\s?cent)$/, "%"],
  [/^(k|thousand)$/, "k"],
  [/^(mn?|million)$/, "m"],
  [/^(bn|billion)$/, "bn"],
  [/^(tn|trillion)$/, "tn"],
];
export function numbersIn(text: string, all = false): Num[] {
  const out: Num[] = [];
  for (const m of text.matchAll(NUMBER)) {
    const n = m[2].replace(/,(?=\d{3}(?!\d))/g, "");
    const word = (m[3] ?? "").trim().toLowerCase();
    const unit = UNIT.find(([re]) => re.test(word))?.[1] ?? "";
    if (all || m[1] || unit || /[.,]/.test(n) || n.replace(/^0+/, "").length >= 2)
      out.push({ n, unit, cur: (m[1] ?? "").trim() });
  }
  return out;
}
// a number is grounded when its sources hold the same value with the same unit (a bare one, any unit), and the same
// currency when both name one
const holds = (source: Num[], x: Num) =>
  source.some((s) => s.n === x.n && (!x.unit || s.unit === x.unit) && (!x.cur || !s.cur || s.cur === x.cur));
const grounded = (text: string, source: Num[], all = false) => numbersIn(text, all).every((x) => holds(source, x));

const linkOf = (i: WindowItem): NewsLink => {
  const host = hostOf(i.url);
  return {
    url: i.url,
    host,
    title: i.title,
    source: i.sources[0]?.short ?? host,
    paywall: paywalled(host),
    score: i.score,
    thread: i.thread,
    threadBy: i.threadBy,
    at: i.at,
  };
};

// the brief as kept, from the write's answer, checked against the pick: each story matched to its picked one by number
// (by place when the model numbered none), its links from its own items only (the pick's, when it named none of
// them), a headline of 90 characters at most, and its numbers found in its sources or the story marked unsure
export function assemble(
  items: WindowItem[],
  picked: Picked[],
  written: BriefAnswer,
  pages: (Page | null)[],
): { brief: NewsBrief; used: string[] } {
  const byId = new Map(items.map((i) => [i.id, i]));
  const numbered = written.stories.some((s) => picked.some((p) => p.n === s.story));
  const done = new Map<number, NewsStory>();
  const used: string[] = [];
  written.stories.forEach((w, place) => {
    const p = numbered ? picked.find((x) => x.n === w.story) : picked[place];
    if (!p || done.has(p.n)) return;
    const own = p.ids.map((id) => byId.get(id)).filter((i): i is WindowItem => Boolean(i));
    const named = [...new Set(w.items)].filter((id) => p.ids.includes(id));
    const links = (named.length ? named.map((id) => byId.get(id)) : own).filter((i): i is WindowItem => Boolean(i));
    const headline = cutAt(clean(w.headline), 90);
    const text = clean(w.text);
    if (!headline || !text || !links.length) return;
    const page = pages[p.n - 1];
    // what the model was shown of this story: its items (their points too) and the article read; never their dates,
    // which the prompt doesn't show, so a 24 or an 11 from a timestamp grounds nothing
    const shown = own.flatMap((i) => [i.title, i.summary, i.score == null ? "" : String(i.score)]);
    const source = numbersIn([...shown, page?.title ?? "", page?.text ?? ""].join(" "), true);
    const figure = clean(w.figure).slice(0, 24);
    // a story with any number its sources don't hold says so, and loses its pill: the pill is the claim made loudest
    const unsure = !grounded(figure, source, true) || !grounded(`${headline} ${text}`, source);
    done.set(p.n, {
      section: p.section,
      headline,
      text,
      figure: unsure ? "" : figure,
      trend: figure && !unsure ? w.trend : "none",
      links: links.map(linkOf),
      unsure,
    });
    used.push(...own.flatMap((i) => [i.url, ...(i.also ?? [])]));
  });
  const stories = [...done.entries()].sort((a, b) => a[0] - b[0]).map(([, s]) => s);
  // the opening sums the day up: a sentence with a number no picked story's sources hold is left out
  const day = numbersIn(
    [
      ...picked.flatMap((p) => p.ids.map((id) => byId.get(id))).flatMap((i) => (i ? [i.title, i.summary] : [])),
      ...picked.flatMap((p) => p.ids.map((id) => String(byId.get(id)?.score ?? ""))),
      ...pages.flatMap((p) => (p ? [p.title, p.text] : [])),
    ].join(" "),
    true,
  );
  const opening = written.opening
    .map(clean)
    .filter((s) => s && grounded(s, day))
    .slice(0, 4);
  return { brief: { opening, stories, quiet: clean(written.quiet) }, used };
}

// the two calls and the check between them. onStep hears each step as it starts (phases 2 to 4 of a run)
export async function composeBrief(
  models: ModelSettings,
  use: { pick: string; write: string },
  items: WindowItem[],
  before: { headlines: string[]; opening: string[] },
  readPage: (url: string) => Promise<string>,
  now: Date,
  onStep: (phase: number, text: string) => void = () => {},
  interests?: string[],
): Promise<Composed> {
  const calls: ModelAnswer<unknown>[] = [];
  // the model each step runs on is the one the client may call: the Models page can pick any the door offers
  const door = (model: string) => ({ ...models, careful: model, fast: model });
  onStep(2, "Choosing the stories");
  const pick = await callModel(
    door(use.pick),
    {
      model: use.pick,
      system: SYSTEM,
      prompt: pickPrompt(
        items.map((i) => promptItem(i, now)),
        before.headlines,
        interests,
      ),
      maxTokens: 1500,
      thinking: false,
    },
    PickAnswer,
  );
  calls.push(pick);
  if (!pick.ok) return { ok: false, why: WHY(pick.why), calls };
  const picked = readPick(pick.value, items);
  if (!picked.length) return { ok: false, why: "the model picked no story from the items", calls };
  // a day with a dozen items or more always holds three stories: fewer is a broken answer, not a quiet day
  if (picked.length < 3 && items.length >= 12)
    return { ok: false, why: `the model picked only ${picked.length} of a full day's stories`, calls };
  onStep(3, `Reading ${picked.length} articles`);
  const pages = await readStories(picked, items, readPage);
  onStep(4, "Writing the brief");
  const byId = new Map(items.map((i) => [i.id, i]));
  const stories: PromptStory[] = picked.map((p) => ({
    n: p.n,
    section: p.section,
    items: p.ids
      .slice(0, 6)
      .map((id) => byId.get(id))
      .filter((i): i is WindowItem => Boolean(i))
      .map((i) => promptItem(i, now)),
    page: pages[p.n - 1]
      ? { host: pages[p.n - 1]?.host ?? "", title: pages[p.n - 1]?.title ?? "", text: pages[p.n - 1]?.text ?? "" }
      : null,
  }));
  const write = await callModel(
    door(use.write),
    {
      model: use.write,
      system: SYSTEM,
      prompt: writePrompt(stories, before.opening),
      maxTokens: 8000,
      thinking: true,
    },
    BriefAnswer,
  );
  calls.push(write);
  if (!write.ok) return { ok: false, why: WHY(write.why), calls };
  const { brief, used } = assemble(items, picked, write.value, pages);
  if (!brief.stories.length) return { ok: false, why: "the model's brief had no story it could link", calls };
  // the pick's rule again: a full day told in one or two stories is a broken write, and the last good brief stays
  if (brief.stories.length < 3 && items.length >= 12)
    return { ok: false, why: `the model's brief kept only ${brief.stories.length} of a full day's stories`, calls };
  return {
    ok: true,
    brief,
    pick: pick.value,
    picked,
    written: write.value,
    used,
    pages: pages.filter(Boolean).length,
    calls,
  };
}
