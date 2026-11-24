// The news sources: public feeds that need no account, each with the topic it mostly covers and how many of its items
// a brief may take. All were read and counted before they were chosen (docs/decisions.md, 2026-11-24): news sites
// with free articles, the AI labs' own pages, the builders who try things first, and Hacker News as a sign of what
// builders talk about. A new source is an entry, not code: news/sources.json in the data folder can add sources or
// drop these by id.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { FeedSpec } from "../../ai/news/feeds.ts";
import { dataDir } from "../../platform/paths.ts";
import { SECTION_KEYS } from "../../shared/news.ts";

const JsonMap = z.object({
  list: z.string().default(""),
  title: z.string().min(1),
  url: z.string().min(1),
  date: z.string().default(""),
  summary: z.string().default(""),
  score: z.string().default(""),
  thread: z.string().default(""),
});

export const Source = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/, "an id is lowercase letters, digits and dashes"),
  name: z.string().min(1).max(60),
  short: z.string().min(1).max(20), // the name on a story's line and on Home ("CNBC")
  url: z
    .string()
    .refine((u) => URL.canParse(u) && u.startsWith("https://"), "a feed's address is https")
    .refine((u) => !/\{(?!since\}|yesterday\})/.test(u), "an address may hold only {since} and {yesterday}"),
  kind: z.enum(["rss", "json"]).default("rss"),
  topic: z.enum(SECTION_KEYS),
  cap: z.number().int().min(1).max(20).default(6), // its newest items a brief may choose from
  firstParty: z.boolean().default(false), // the lab's own announcements: read first when a story is opened
  hosts: z.array(z.string()).default([]),
  linkFrom: z.enum(["link", "description"]).default("link"),
  json: JsonMap.optional(),
  minScore: z.number().default(0),
  enabled: z.boolean().default(true),
});
export type Source = z.infer<typeof Source>;
export const spec = (s: Source): FeedSpec => s;

// sites whose articles need a subscription: their links get a lock, and a story is read from another link first
export const PAYWALLED = [
  "bloomberg.com",
  "ft.com",
  "wsj.com",
  "nytimes.com",
  "theinformation.com",
  "economist.com",
  "barrons.com",
  "washingtonpost.com",
  "theatlantic.com",
  "wired.com",
];
export const paywalled = (host: string): boolean => PAYWALLED.some((h) => host === h || host.endsWith(`.${h}`));

// the order is the brief's reading order when two items are equal: the news first, then the labs, then the builders
export const SOURCES: Source[] = z.array(Source).parse([
  {
    id: "techmeme",
    name: "Techmeme",
    short: "Techmeme",
    url: "https://www.techmeme.com/feed.xml",
    topic: "money",
    cap: 8,
    // its item's own link is Techmeme's page; the article it is about is the first outside link in the description
    linkFrom: "description",
  },
  {
    id: "cnbc-tech",
    name: "CNBC Technology",
    short: "CNBC",
    url: "https://www.cnbc.com/id/19854910/device/rss/rss.html",
    topic: "money",
  },
  {
    id: "techcrunch-ai",
    name: "TechCrunch AI",
    short: "TechCrunch",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
    topic: "money",
  },
  {
    id: "guardian-ai",
    name: "The Guardian, AI",
    short: "Guardian",
    url: "https://www.theguardian.com/technology/artificialintelligenceai/rss",
    topic: "money",
    cap: 4,
  },
  {
    id: "dcd",
    name: "DatacenterDynamics",
    short: "DCD",
    url: "https://www.datacenterdynamics.com/en/rss/",
    topic: "money",
    cap: 4,
  },
  {
    id: "openai",
    name: "OpenAI News",
    short: "OpenAI",
    url: "https://openai.com/news/rss.xml",
    topic: "models",
    cap: 4,
    firstParty: true,
  },
  {
    // a community mirror (anthropic.com has no feed): its links must stay on Anthropic's own sites
    id: "anthropic",
    name: "Anthropic News",
    short: "Anthropic",
    url: "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_news.xml",
    topic: "models",
    cap: 3,
    firstParty: true,
    hosts: ["anthropic.com", "claude.com"],
  },
  {
    id: "claude-blog",
    name: "Claude blog",
    short: "Claude",
    url: "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_claude.xml",
    topic: "building",
    cap: 3,
    firstParty: true,
    hosts: ["anthropic.com", "claude.com"],
  },
  {
    id: "deepmind",
    name: "Google DeepMind",
    short: "DeepMind",
    url: "https://deepmind.google/blog/rss.xml",
    topic: "models",
    cap: 3,
    firstParty: true,
  },
  {
    id: "mistral",
    name: "Mistral AI",
    short: "Mistral",
    url: "https://mistral.ai/rss.xml",
    topic: "models",
    cap: 2,
    firstParty: true,
  },
  {
    id: "hf-papers",
    name: "Hugging Face Daily Papers",
    short: "HF Papers",
    url: "https://huggingface.co/api/daily_papers?date={yesterday}&limit=100",
    kind: "json",
    topic: "models",
    cap: 3,
    // the voted list of yesterday's papers: only those that drew real interest
    minScore: 20,
    json: {
      list: "",
      title: "paper.title|title",
      url: "https://huggingface.co/papers/{paper.id}",
      date: "publishedAt|paper.publishedAt",
      summary: "paper.summary|summary",
      score: "paper.upvotes",
    },
  },
  {
    id: "the-decoder",
    name: "The Decoder",
    short: "Decoder",
    url: "https://the-decoder.com/feed/",
    topic: "models",
  },
  {
    id: "hf-blog",
    name: "Hugging Face blog",
    short: "Hugging Face",
    url: "https://huggingface.co/blog/feed.xml",
    topic: "building",
    cap: 3,
  },
  {
    id: "simon-willison",
    name: "Simon Willison",
    short: "Willison",
    url: "https://simonwillison.net/atom/everything/",
    topic: "building",
    cap: 4,
  },
  {
    id: "latent-space",
    name: "Latent Space",
    short: "Latent Space",
    url: "https://www.latent.space/feed",
    topic: "building",
    cap: 3,
  },
  {
    // stories over 150 points since the window opened: what builders talk about, with the thread beside the article
    id: "hn",
    name: "Hacker News",
    short: "HN",
    url: "https://hn.algolia.com/api/v1/search?tags=story&numericFilters=created_at_i%3E{since}%2Cpoints%3E150&hitsPerPage=50",
    kind: "json",
    topic: "building",
    cap: 10,
    json: {
      list: "hits",
      title: "title",
      url: "url",
      date: "created_at",
      score: "points",
      thread: "https://news.ycombinator.com/item?id={objectID}",
    },
  },
  {
    id: "ars",
    name: "Ars Technica",
    short: "Ars",
    url: "https://feeds.arstechnica.com/arstechnica/index",
    topic: "tech",
    cap: 5,
  },
  {
    id: "bbc-tech",
    name: "BBC Technology",
    short: "BBC",
    url: "https://feeds.bbci.co.uk/news/technology/rss.xml",
    topic: "tech",
    cap: 4,
  },
  {
    id: "understanding-ai",
    name: "Understanding AI",
    short: "Understanding AI",
    url: "https://www.understandingai.org/feed",
    topic: "views",
    cap: 2,
  },
]);

// news/sources.json in the data folder: {"drop": ["<id>"], "add": [<a source>]}. A file that can't be read leaves the
// list as it is and says why once, in the log: the morning never stops over it
const Override = z.object({
  drop: z.array(z.string()).default([]),
  add: z.array(Source).default([]),
});

export function loadSources(dir: string = dataDir()): Source[] {
  const file = join(dir, "news", "sources.json");
  if (!existsSync(file)) return SOURCES;
  try {
    const o = Override.parse(JSON.parse(readFileSync(file, "utf8")));
    const kept = SOURCES.filter((s) => !o.drop.includes(s.id) && !o.add.some((a) => a.id === s.id));
    return [...kept, ...o.add];
  } catch (e) {
    const why =
      e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ") : "not JSON";
    console.error(`news/sources.json is wrong, the built-in sources are used: ${why.slice(0, 200)}`);
    return SOURCES;
  }
}
