// One run of one search: the collector speaks, the engine keeps and scores, and the run lands in the record with its
// problem in plain words — an empty page is a problem, never "nothing new".
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { begin } from "../../platform/activity.ts";
import { runCollector } from "./collect.ts";
import { keepItems } from "./listings.ts";
import type { Scoring } from "./score.ts";
import { collectorPath, type Spec } from "./specs.ts";

export type Run = {
  id: string;
  search: string;
  started: string;
  ms: number;
  found: number;
  kept: number;
  problem: string;
};

// one run at a time, whoever asks: the collectors share one computer and one browser tab, so the tick and Run now
// join the same line instead of interleaving on the page
let line: Promise<unknown> = Promise.resolve();
// the searches in the line now, queued or running: a hunt's Search now counts them down
const pending = new Set<string>();
export const pendingSearches = (): ReadonlySet<string> => pending;
// the line's round: the runs it took since it was last empty and how many of them ended, so a run says its place on
// Live ("3 of 20"); the round starts again once the line is empty
let inLine = 0;
let round = { ended: 0, joined: 0 };

export function runSearch(db: DatabaseSync, spec: Spec, now: Date): Promise<Run> {
  if (inLine === 0) round = { ended: 0, joined: 0 };
  const mine = round;
  inLine++;
  mine.joined++;
  pending.add(spec.id);
  // its place is read as it runs: the ones before it have ended by then, and the round may have grown
  const place = (): [number, number] => [mine.ended + 1, mine.joined];
  const next = line
    .then(() => runSearchNow(db, spec, now, place))
    .finally(() => {
      pending.delete(spec.id);
      inLine--;
      mine.ended++;
    });
  line = next.catch(() => {});
  return next;
}

// a collector's progress line as a count of what it found so far ("2 scrolls for more, 40 ads" is 40): only the number
// reaches Live, never the line's words (a search's terms, a page's address)
const FOUND = /(\d[\d,]*)\s+(?:ads?|listings?|jobs?|items?|results?|postings?)\b/gi;
export function countOf(line: string): number | null {
  const last = [...line.matchAll(FOUND)].at(-1);
  return last ? Number(last[1].replaceAll(",", "")) : null;
}

async function runSearchNow(db: DatabaseSync, spec: Spec, now: Date, place: () => [number, number]): Promise<Run> {
  const t0 = Date.now();
  const script = collectorPath(spec);
  const live = begin("search", `Search: ${spec.hunt || spec.name}`, "/searches");
  // Live's sentence for it, as the old Live said it: its name, its place in the line, what it found so far
  // ("Model A · Kijiji: 3 of 20, 42 ads so far"); each new count takes the sentence's place
  const noun = spec.kind === "deals" ? "ads" : "jobs";
  let count: number | null = null;
  const say = (again: boolean) => {
    const [at, of] = place();
    const parts = [of > 1 ? `${at} of ${of}` : "", count === null ? "" : `${count} ${noun} so far`].filter(Boolean);
    live.step(`${spec.name}: ${parts.join(", ") || "searching"}`, again);
  };
  say(false);
  const collected = await runCollector(script, spec.args, {
    timeoutMs: spec.limits.timeoutMs,
    maxBytes: spec.limits.maxBytes,
    cwd: dirname(script),
    env: spec.env,
    onLine: (l) => {
      const n = countOf(l);
      if (n === null || n === count) return;
      count = n;
      say(true);
    },
  });
  const { found, kept } = keepItems(
    db,
    spec.id,
    collected.items,
    (spec.scoring ?? {}) as Scoring,
    now,
    spec.limits.perRun,
    spec.kind,
    // a spec names its hunt only when it groups several searches (the chair hunt); without one, its listings stay under
    // the search itself, as the imported ones do, so one search never shows as two tabs
    { hunt: spec.hunt, category: spec.category },
  );
  const problem = collected.problem || (found === 0 ? "the page answered empty" : "");
  live.step(`${found} found, ${kept} new`);
  live.end(problem ? "failed" : "done", problem);
  const run: Run = {
    id: randomUUID(),
    search: spec.id,
    started: now.toISOString(),
    ms: Date.now() - t0,
    found,
    kept,
    problem,
  };
  db.prepare(
    "INSERT INTO search_runs (id, search, started, ms, found, kept, problem) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(run.id, run.search, run.started, run.ms, run.found, run.kept, run.problem);
  return run;
}

export function lastRun(db: DatabaseSync, searchId: string): Run | null {
  const r = db.prepare("SELECT * FROM search_runs WHERE search = ? ORDER BY started DESC LIMIT 1").get(searchId) as
    | Record<string, unknown>
    | undefined;
  return r
    ? {
        id: String(r.id),
        search: String(r.search),
        started: String(r.started),
        ms: Number(r.ms),
        found: Number(r.found),
        kept: Number(r.kept),
        problem: String(r.problem),
      }
    : null;
}
