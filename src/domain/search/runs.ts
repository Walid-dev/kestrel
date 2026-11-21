// One run of one search: the collector speaks, the engine keeps and scores, and the run lands in the record with its
// problem in plain words — an empty page is a problem, never "nothing new".
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import type { DatabaseSync } from "node:sqlite";
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

export function runSearch(db: DatabaseSync, spec: Spec, now: Date): Promise<Run> {
  const next = line.then(() => runSearchNow(db, spec, now));
  line = next.catch(() => {});
  return next;
}

async function runSearchNow(db: DatabaseSync, spec: Spec, now: Date): Promise<Run> {
  const t0 = Date.now();
  const script = collectorPath(spec);
  const collected = await runCollector(script, spec.args, {
    timeoutMs: spec.limits.timeoutMs,
    maxBytes: spec.limits.maxBytes,
    cwd: dirname(script),
    env: spec.env,
  });
  const { found, kept } = keepItems(
    db,
    spec.id,
    collected.items,
    (spec.scoring ?? {}) as Scoring,
    now,
    spec.limits.perRun,
    spec.kind,
  );
  const problem = collected.problem || (found === 0 ? "the page answered empty" : "");
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
