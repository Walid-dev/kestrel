// The morning brief, as a job like Research: one at a time, its steps on Live and on the page, a restart marking an
// unfinished one failed. Each morning at the set time (or the minute the computer wakes after it, until noon) it reads
// the feeds again, takes what is new since yesterday morning and not told before, and composes the brief
// (compose.ts). A source down is skipped and named; a model that fails leaves yesterday's brief on the page with the
// reason. Between briefs the feeds are read every two hours, quietly (several hold only a few hours). Every brief is
// kept, about 10 KB a day, until I delete its day (days.ts).
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { NEWS_VERSION } from "../../ai/news/prompt.ts";
import { fetchPage } from "../../ai/web.ts";
import { begin } from "../../platform/activity.ts";
import { type NewsSettings, newsOf, type Settings } from "../../platform/config.ts";
import { plainWords } from "../../platform/plain.ts";
import {
  type NewsBrief,
  type NewsMeta,
  type NewsRun,
  type NewsSourceHealth,
  type NewsState,
  WINDOW_HOURS,
} from "../../shared/news.ts";
import { recordCall } from "../calls.ts";
import { modelFor } from "../models.ts";
import { Refused } from "../notes/documents.ts";
import { isDue } from "../search/specs.ts";
import { askedOn } from "./ask.ts";
import { composeBrief, type WindowItem } from "./compose.ts";
import { type Gathered, gather, lastRead, networkReader, type Reader } from "./gather.ts";
import { loadSources, type Source } from "./sources.ts";

// what a run reaches outside: the sources, how a feed is read, how an article is read, the clock. Tests pass made-up
// ones; the app takes the defaults (the network through publicUrl, the model door's page reader)
export type NewsDeps = {
  sources?: Source[];
  read?: Reader;
  readPage?: (url: string) => Promise<string>;
  clock?: () => Date;
};

const ALL_ITEMS = 90; // the most a pick reads: about 30,000 characters
const pad = (n: number) => String(n).padStart(2, "0");
export const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

type ItemRow = {
  url: string;
  sources: string;
  title: string;
  summary: string;
  at: string;
  score: number | null;
  thread: string | null;
  thread_by: string | null;
};

// the words of a title, for telling two outlets' copies of one headline apart from two stories
const titleKey = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

// what a brief chooses from: the items of the last 36 hours that no brief of an earlier day has told, each source's
// newest up to its cap (or its best-scored, for a source that scores), one headline told twice made one item, the
// newest 90 at most, numbered for the prompts. Today's own briefs don't count: Make it now writes today's brief
// again, from all of it, and the new one replaces the morning's in full
export function itemsWindow(db: DatabaseSync, sources: Source[], now: Date): { items: WindowItem[]; twice: number } {
  const since = new Date(now.getTime() - WINDOW_HOURS * 3_600_000).toISOString();
  const rows = db
    .prepare(
      `SELECT url, sources, title, summary, at, score, thread, thread_by FROM news_items
       WHERE at >= ? AND at <= ? AND url NOT IN (
         SELECT u.url FROM news_used u LEFT JOIN news_briefs b ON b.id = u.brief WHERE b.day IS NULL OR b.day <> ?
       ) ORDER BY at DESC`,
    )
    .all(since, now.toISOString(), localDay(now)) as ItemRow[];
  const byId = new Map(sources.filter((s) => s.enabled).map((s) => [s.id, s]));
  const groups = new Map<string, { row: ItemRow; carried: Source[] }[]>();
  for (const row of rows) {
    const carried = (JSON.parse(row.sources) as string[]).flatMap((id) => byId.get(id) ?? []);
    if (!carried.length) continue; // only a source since dropped carried it
    const own = groups.get(carried[0].id);
    if (own) own.push({ row, carried });
    else groups.set(carried[0].id, [{ row, carried }]);
  }
  const chosen: { row: ItemRow; carried: Source[] }[] = [];
  for (const [id, list] of groups) {
    const s = byId.get(id);
    if (!s) continue;
    const ranked = s.json?.score ? [...list].sort((a, b) => (b.row.score ?? 0) - (a.row.score ?? 0)) : list;
    chosen.push(...ranked.slice(0, s.cap));
  }
  chosen.sort((a, b) => b.row.at.localeCompare(a.row.at));
  const items: WindowItem[] = [];
  const byTitle = new Map<string, WindowItem>();
  for (const { row, carried } of chosen) {
    const key = titleKey(row.title);
    const twin = key.length >= 16 ? byTitle.get(key) : undefined;
    if (twin) {
      for (const s of carried) if (!twin.sources.includes(s)) twin.sources.push(s);
      twin.also = [...(twin.also ?? []), row.url];
      twin.score = Math.max(twin.score ?? 0, row.score ?? 0) || null;
      if (!twin.thread && row.thread) {
        twin.thread = row.thread;
        twin.threadBy = (row.thread_by && byId.get(row.thread_by)?.short) || "";
      }
      continue;
    }
    const item: WindowItem = {
      id: 0,
      url: row.url,
      title: row.title,
      summary: row.summary,
      at: row.at,
      sources: [...carried],
      score: row.score,
      thread: row.thread,
      threadBy: (row.thread_by && byId.get(row.thread_by)?.short) || "",
    };
    items.push(item);
    byTitle.set(key, item);
  }
  const kept = items.slice(0, ALL_ITEMS);
  kept.forEach((i, at) => {
    i.id = at + 1;
  });
  return { items: kept, twice: kept.filter((i) => i.sources.length > 1).length };
}

// ── The run ──────────────────────────────────────────────────────────────────────────────────────────────────────

let busy = false;
let collecting = false;
let work: Promise<unknown> = Promise.resolve();
// the tests wait for what a tick started in the background
export const newsSettled = (): Promise<unknown> => work;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// "18 of 19 read · down: DatacenterDynamics (timed out)"
export function readLine(got: Gathered): string {
  const down = got.failed.map((f) => `${f.name} (${f.why})`);
  const named = down.length > 3 ? [...down.slice(0, 3), `${down.length - 3} more`] : down;
  return `${got.read} of ${got.sources} read${named.length ? ` · down: ${named.join(", ")}` : ""}`;
}

// the newest brief of an earlier day that told something, for the next one not to repeat it (today's own is the one
// a new brief replaces)
function lastTold(db: DatabaseSync, day: string): NewsBrief | null {
  const rows = db
    .prepare(
      "SELECT brief FROM news_briefs WHERE state = 'done' AND brief IS NOT NULL AND day < ? ORDER BY started DESC LIMIT 5",
    )
    .all(day) as { brief: string }[];
  for (const r of rows) {
    const b = JSON.parse(r.brief) as NewsBrief;
    if (b.stories.length) return b;
  }
  return null;
}

// a brief with stories was written today already
const toldToday = (db: DatabaseSync, day: string): boolean =>
  Boolean(
    db
      .prepare(
        "SELECT 1 FROM news_briefs WHERE state = 'done' AND day = ? AND json_array_length(brief, '$.stories') > 0 LIMIT 1",
      )
      .get(day),
  );

// Make it now, and the morning's own: refused while one is written. The row is made before the work starts, so the
// page and Live show it at once; done resolves when the brief is written or has failed
export function startNews(
  db: DatabaseSync,
  settings: Settings,
  deps: NewsDeps = {},
): { id: string; done: Promise<void> } {
  if (busy) throw new Refused("the news is being written: one at a time, like the model");
  const clock = deps.clock ?? (() => new Date());
  const now = clock();
  const id = randomUUID();
  db.prepare("INSERT INTO news_briefs (id, day, state, phase, step, started) VALUES (?, ?, 'running', 0, ?, ?)").run(
    id,
    localDay(now),
    "Starting",
    now.toISOString(),
  );
  busy = true;
  // the run catches its own failures; one past that (the database itself) is one plain line, never a crash
  const done = writeBrief(db, settings, id, deps)
    .catch((e) => console.error(`the news brief stopped: ${plainWords((e as Error).message)}`))
    .finally(() => {
      busy = false;
    });
  work = done;
  return { id, done };
}

async function writeBrief(db: DatabaseSync, settings: Settings, id: string, deps: NewsDeps): Promise<void> {
  const clock = deps.clock ?? (() => new Date());
  const sources = (deps.sources ?? loadSources()).filter((s) => s.enabled);
  const live = begin("news", "The news brief", `/news?day=${localDay(clock())}`);
  const steps: NewsRun["steps"] = [];
  const step = (phase: number, text: string) => {
    steps.push({ at: clock().toISOString(), phase, text });
    db.prepare("UPDATE news_briefs SET phase = ?, step = ?, steps = ? WHERE id = ?").run(
      phase,
      text,
      JSON.stringify(steps),
      id,
    );
    live.step(text);
  };
  const meta: NewsMeta = {
    sources: sources.length,
    read: 0,
    failed: [],
    items: 0,
    twice: 0,
    pages: 0,
    model: "",
    unsure: 0,
  };
  const finish = (state: "done" | "failed", brief: NewsBrief | null, error = "") => {
    db.prepare(
      "UPDATE news_briefs SET state = ?, step = '', finished = ?, brief = ?, meta = ?, error = ? WHERE id = ?",
    ).run(state, clock().toISOString(), brief ? JSON.stringify(brief) : null, JSON.stringify(meta), error, id);
    const sections = new Set(brief?.stories.map((s) => s.section)).size;
    live.end(
      state,
      state === "failed"
        ? error
        : brief?.stories.length
          ? `${plural(brief.stories.length, "story", "stories")} in ${plural(sections, "section")}`
          : "a quiet morning",
    );
  };
  try {
    if (!sources.length) return finish("failed", null, "no source is on: news/sources.json drops them all");
    step(0, `Reading ${plural(sources.length, "source")}`);
    const got = await gather(db, sources, clock(), deps.read ?? networkReader());
    meta.read = got.read;
    meta.failed = got.failed.map((f) => ({ name: f.name, why: f.why }));
    step(0, readLine(got));
    const now = clock();
    const { items, twice } = itemsWindow(db, sources, now);
    meta.items = items.length;
    meta.twice = twice;
    // nothing new: from what the feeds held before, if the network is down now; else a quiet morning, said so
    if (!items.length) {
      if (!got.read) return finish("failed", null, "no source answered: is the network up?");
      // an empty brief never shadows a full one of the same day
      if (toldToday(db, localDay(now))) return finish("failed", null, "nothing new to tell: today's brief stays");
      return finish("done", { opening: [], stories: [], quiet: "A quiet morning: nothing new since the last brief." });
    }
    step(1, `${plural(items.length, "new item")}, ${twice} told twice`);
    const pick = modelFor(db, settings, "news-pick");
    const write = modelFor(db, settings, "news-write");
    meta.model = write;
    const last = lastTold(db, localDay(now));
    const composed = await composeBrief(
      settings.models,
      { pick, write },
      items,
      { headlines: last?.stories.map((s) => s.headline) ?? [], opening: last?.opening ?? [] },
      deps.readPage ?? ((url) => fetchPage(settings.models, url, 3000)),
      now,
      step,
      newsOf(settings).interests,
    );
    composed.calls.forEach((c, i) => {
      recordCall(db, `${i === 0 ? "news-pick" : "news-write"}:v${NEWS_VERSION}`, c);
    });
    if (!composed.ok) return finish("failed", null, composed.why);
    meta.pages = composed.pages;
    meta.unsure = composed.brief.stories.filter((s) => s.unsure).length;
    // the items told are never told again: the next brief starts from what is new
    const told = db.prepare("INSERT OR IGNORE INTO news_used (url, brief) VALUES (?, ?)");
    for (const url of composed.used) told.run(url, id);
    finish("done", composed.brief);
  } catch (e) {
    finish("failed", null, `the brief stopped: ${plainWords(e instanceof Error ? e.message : String(e))}`);
  }
}

const RETRY_MS = 15 * 60_000;

// is this morning's brief due? From the set time until the latest hour (noon), once a day, catching up when the
// computer wakes after the time, as the searches do (isDue). Before the time, yesterday's is never chased; after the
// latest hour a missed morning waits for the next one. A morning that failed (a restart cut it short, the model's
// door wasn't up yet after a wake) is tried once more, 15 minutes later; a second failure waits for Make it now
export function briefDue(db: DatabaseSync, news: NewsSettings, now: Date): boolean {
  const [h, m] = news.time.split(":").map(Number);
  const slot = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
  if (now < slot) return false;
  if (now.getHours() >= Math.max(news.latestHour, h + 1)) return false;
  const done = db.prepare("SELECT MAX(started) AS at FROM news_briefs WHERE state = 'done'").get() as {
    at: string | null;
  };
  if (!isDue({ times: [news.time], everyMinutes: 0 }, done.at, now)) return false;
  const tries = db
    .prepare("SELECT COUNT(*) AS n, MAX(started) AS at FROM news_briefs WHERE state <> 'done' AND started >= ?")
    .get(slot.toISOString()) as { n: number; at: string | null };
  if (tries.n >= 2) return false;
  return !tries.at || now.getTime() - Date.parse(tries.at) >= RETRY_MS;
}

// the scheduler's minute: the brief when due, else a read of the feeds every two hours. Both run in the background,
// so the searches never wait on them; what started is said back for the tick's list. While an application is at
// work (it has the model), the brief waits for a later tick before the latest hour; the feeds are still read
export function newsTick(
  db: DatabaseSync,
  settings: Settings,
  now: Date,
  deps: NewsDeps = {},
  applying = false,
): "brief" | "collect" | null {
  const news = newsOf(settings);
  if (!news.enabled || busy || collecting) return null;
  if (!applying && briefDue(db, news, now)) {
    startNews(db, settings, deps);
    return "brief";
  }
  const last = lastRead(db);
  if (last && now.getTime() - Date.parse(last) < news.collectEveryMinutes * 60_000) return null;
  collecting = true;
  work = gather(db, deps.sources ?? loadSources(), now, deps.read ?? networkReader())
    .then((got) => {
      // quiet unless several sources fail at once: one down every two hours would be noise on Live
      if (got.failed.length < 3) return;
      const a = begin("news", "Reading the news feeds", "/news");
      a.end("failed", readLine(got));
    })
    .catch((e) => console.error(`the news read failed: ${plainWords((e as Error).message)}`))
    .finally(() => {
      collecting = false;
    });
  return "collect";
}

// a restart while a brief was written: it can't finish now, so it says so instead of spinning forever
export function sweepNews(db: DatabaseSync): void {
  db.prepare(
    "UPDATE news_briefs SET state = 'failed', step = '', error = 'kestrel restarted while it ran: make it again' WHERE state = 'running'",
  ).run();
}

// ── What the page reads ──────────────────────────────────────────────────────────────────────────────────────────

const runOf = (r: Record<string, unknown>): NewsRun => ({
  id: String(r.id),
  day: String(r.day),
  state: r.state as NewsRun["state"],
  phase: Number(r.phase),
  step: String(r.step),
  steps: JSON.parse(String(r.steps ?? "[]")),
  started: String(r.started),
  finished: r.finished == null ? null : String(r.finished),
  error: String(r.error),
  brief: r.brief ? (JSON.parse(String(r.brief)) as NewsBrief) : null,
  meta: r.meta ? (JSON.parse(String(r.meta)) as NewsMeta) : null,
});

// the brief to show (the newest written, of a day or of all), and the newest run when it is newer: one being
// written, or one that failed, while the last good brief stays readable; with how many questions each of its
// stories was asked
export function newsState(db: DatabaseSync, settings: Settings, day?: string): NewsState {
  const brief = (
    day
      ? db.prepare("SELECT * FROM news_briefs WHERE state = 'done' AND day = ? ORDER BY started DESC LIMIT 1").get(day)
      : db.prepare("SELECT * FROM news_briefs WHERE state = 'done' ORDER BY started DESC LIMIT 1").get()
  ) as Record<string, unknown> | undefined;
  const newest = day
    ? undefined
    : (db.prepare("SELECT * FROM news_briefs ORDER BY started DESC LIMIT 1").get() as
        | Record<string, unknown>
        | undefined);
  const news = newsOf(settings);
  const shown = brief ? runOf(brief) : null;
  return {
    enabled: news.enabled,
    time: news.time,
    brief: shown,
    run: newest && newest.state !== "done" ? runOf(newest) : null,
    asked: shown ? askedOn(db, shown.id, shown.brief?.stories.length ?? 0) : [],
  };
}

// each source with how its reads go, and what it brought in the window
export function sourcesHealth(db: DatabaseSync, now: Date, sources: Source[] = loadSources()): NewsSourceHealth[] {
  const since = new Date(now.getTime() - WINDOW_HOURS * 3_600_000).toISOString();
  const fresh = new Map(
    (
      db
        .prepare(
          `SELECT j.value AS id, COUNT(*) AS n FROM news_items, json_each(news_items.sources) AS j
           WHERE news_items.at >= ? GROUP BY j.value`,
        )
        .all(since) as { id: string; n: number }[]
    ).map((r) => [r.id, r.n]),
  );
  const health = db.prepare("SELECT * FROM news_sources WHERE id = ?");
  return sources
    .filter((s) => s.enabled)
    .map((s) => {
      const h = health.get(s.id) as Record<string, string | null> | undefined;
      return {
        id: s.id,
        name: s.name,
        short: s.short,
        topic: s.topic,
        lastTry: h?.last_try ?? null,
        lastOk: h?.last_ok ?? null,
        error: h?.last_error ?? "",
        downSince: h?.down_since ?? null,
        fresh: fresh.get(s.id) ?? 0,
      };
    });
}
