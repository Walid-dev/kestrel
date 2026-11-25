// The morning news as the pages and the server share it: the sections in the order the brief reads them, the five
// steps of a run, a brief as it is kept, and the days kept as the history lists and finds them. Nothing from Node
// here, and no zod: the web may import only src/shared.

export type Section = "money" | "models" | "building" | "tech" | "views";

// each section's heading, and the short name its stories' chip carries
export const SECTIONS: { key: Section; label: string; short: string }[] = [
  { key: "money", label: "The industry and its money", short: "Money" },
  { key: "models", label: "Models and research", short: "Models" },
  { key: "building", label: "Building with AI", short: "Building" },
  { key: "tech", label: "The wider tech day", short: "Tech" },
  { key: "views", label: "Views", short: "View" },
];
export const SECTION_KEYS = SECTIONS.map((s) => s.key) as [Section, ...Section[]];

// what the brief follows, in my words: broad on purpose (one passing debate is an example, never the beat). Settings
// may replace the list (news.interests); the pick reads it as what to cover when the day has it
export const NEWS_INTERESTS = [
  "new AI models and what they can do",
  "AI research that changes what is possible",
  "building software with AI: tools, agents, coding",
  "the AI industry: the companies, their money, chips and data centres, rules",
  "the wider tech day",
];

// the steps a run goes through, in order: the page draws them as a stepper while it writes
export const PHASES = [
  "Reading the sources",
  "The new items",
  "Choosing the stories",
  "Reading the articles",
  "Writing",
];

// one link of a story: always an item kestrel gathered, never a link the model wrote
export type NewsLink = {
  url: string;
  host: string; // without www
  title: string;
  source: string; // the short name of the source that carried it first ("CNBC")
  paywall: boolean; // its site asks for a subscription
  score: number | null; // Hacker News points, a paper's upvotes
  thread: string | null; // where it is discussed (Hacker News, Techmeme)
  threadBy: string; // that place's short name
  at: string; // when it happened, or when it was first seen
};

export type NewsStory = {
  section: Section;
  headline: string;
  text: string;
  figure: string; // the one number that matters, as its sources write it; "" when none
  trend: "up" | "down" | "none";
  links: NewsLink[];
  unsure: boolean; // a number in it wasn't found in its sources
};

export type NewsBrief = { opening: string[]; stories: NewsStory[]; quiet: string };

export type NewsMeta = {
  sources: number;
  read: number;
  failed: { name: string; why: string }[];
  items: number; // the new items it chose from
  twice: number; // of them, told by two sources or more
  pages: number; // articles read whole
  model: string;
  unsure: number; // stories with a number not found in their sources
};

export type NewsRun = {
  id: string;
  day: string; // the local day it is for, YYYY-MM-DD
  state: "running" | "done" | "failed";
  phase: number; // 0 to 4, PHASES
  step: string;
  steps: { at: string; phase: number; text: string }[];
  started: string;
  finished: string | null;
  error: string;
  brief: NewsBrief | null;
  meta: NewsMeta | null;
};

// GET /api/news: the brief to show (the newest written, of the day asked or any), the newest run when it is newer
// than that one (running now, or today's that failed), and how many questions Ask took on each of the brief's
// stories, in their order, with whether it is answering on each now and whether each is starred; dayStars: the
// stories starred from its day in all, an earlier brief's too (they stay when the day is deleted). time: when the
// morning's brief is written, "08:00"
export type NewsState = {
  enabled: boolean;
  time: string;
  brief: NewsRun | null;
  run: NewsRun | null;
  asked: number[];
  answering: boolean[];
  starred: boolean[];
  dayStars: number;
};

// GET /api/news/days: each day's newest brief, newest day first, a page at a time (?before= the last day of the page
// above), with its stories starred; how many days are kept in all, the first of them, and how many stories are
// starred in all (a deleted day's included)
export type NewsDay = { day: string; id: string; stories: number; lead: string; starred: number };
export type NewsDays = { days: NewsDay[]; total: number; since: string | null; starred: number };

// GET /api/news/stars: every story starred, the newest starred first: a copy of the story as its brief told it, its
// day, its brief and its number there (#s<n>), when it was starred, and whether its day's page still shows that brief
// (the day not deleted, the brief not replaced by Make it now): then it opens there, else the copy opens itself
export type NewsStar = { brief: string; n: number; day: string; starred: string; shown: boolean; story: NewsStory };
export type NewsStars = { stars: NewsStar[] };

// GET /api/news/find: the stories whose headline or text hold every word, newest day first, at most 50 (more: others
// matched too). n is the story's number on its day's page, #s<n>
export type NewsFound = { day: string; n: number; section: Section; headline: string };
export type NewsFind = { found: NewsFound[]; more: boolean };

// GET /api/news/sources: each source and how its reads go
export type NewsSourceHealth = {
  id: string;
  name: string;
  short: string;
  topic: Section;
  lastTry: string | null;
  lastOk: string | null;
  error: string; // the last failure's reason, "" when the last read was good
  downSince: string | null;
  fresh: number; // the items it brought in the last 36 hours
};

// how long a story stays new: items from the last 36 hours (a morning brief covers yesterday morning to now)
export const WINDOW_HOURS = 36;
