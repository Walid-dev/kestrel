// A hunt's line under its title, as the old hunt page said it: its switch (On searches and pings me for a great find,
// Quiet searches and says nothing, Paused doesn't search on its own), its last search (what it found new, how many
// the rules set aside, the best of them) and when it searches next.
import type { DatabaseSync } from "node:sqlite";
import { LEFT } from "./listings.ts";
import { nextRun, readSpecFile, type Spec, writeSpecFile } from "./specs.ts";

export type HuntMode = "on" | "quiet" | "paused";

export function modeOf(specs: Pick<Spec, "enabled" | "auto" | "alerts">[]): HuntMode {
  const live = specs.filter((s) => s.enabled);
  if (!live.some((s) => s.auto)) return "paused";
  return live.some((s) => s.auto && s.alerts) ? "on" : "quiet";
}

// the switch, written to each of the hunt's search files
export function setHuntMode(specs: Pick<Spec, "id">[], mode: HuntMode, dir?: string): void {
  for (const s of specs) {
    const file = readSpecFile(s.id, dir);
    if (file) writeSpecFile(s.id, { ...file, auto: mode !== "paused", alerts: mode === "on" }, dir);
  }
}

export type LastSearch = {
  at: string;
  found: number;
  kept: number;
  leftOut: number;
  problem: string;
  best: { id: string; title: string; org: string } | null;
};

const GO_MS = 3600_000; // the runs of one go (Search now on a hunt of many searches) count as one search

// the hunt's last search, its runs of the same go added up, with what it kept new and the best of it
export function lastSearch(db: DatabaseSync, searches: string[]): LastSearch | null {
  if (!searches.length) return null;
  const marks = searches.map(() => "?").join(", ");
  const runs = db
    .prepare(
      `SELECT started, found, kept, problem FROM search_runs WHERE search IN (${marks}) ORDER BY started DESC LIMIT 200`,
    )
    .all(...searches) as { started: string; found: number; kept: number; problem: string }[];
  if (!runs.length) return null;
  const since = new Date(new Date(runs[0].started).getTime() - GO_MS).toISOString();
  const go = runs.filter((r) => r.started >= since);
  const left = db
    .prepare(
      `SELECT COUNT(*) AS n FROM listings WHERE search IN (${marks}) AND found >= ? AND COALESCE(json_extract(data, '$.leftOut'), '') NOT IN ('', 0)`,
    )
    .get(...searches, since) as { n: number };
  const best = db
    .prepare(
      `SELECT id, json_extract(data, '$.title') AS title, COALESCE(json_extract(data, '$.org'), json_extract(data, '$.company'), '') AS org
       FROM listings WHERE search IN (${marks}) AND found >= ? AND NOT ${LEFT} ORDER BY COALESCE(score, -1) DESC LIMIT 1`,
    )
    .get(...searches, since) as { id: string; title: string | null; org: string } | undefined;
  return {
    at: runs[0].started,
    found: go.reduce((n, r) => n + r.found, 0),
    kept: go.reduce((n, r) => n + r.kept, 0),
    leftOut: left.n,
    problem: go.find((r) => r.problem)?.problem ?? "",
    best: best ? { id: best.id, title: String(best.title ?? ""), org: String(best.org ?? "") } : null,
  };
}

// when the hunt searches next on its own: the soonest of its searches; null when none runs on its own
export function nextSearch(db: DatabaseSync, specs: Spec[], now: Date): string | null {
  const last = db.prepare("SELECT MAX(started) AS at FROM search_runs WHERE search = ?");
  const next = specs
    .map((s) => nextRun(s, (last.get(s.id) as { at: string | null }).at, now))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  return next ? next.toISOString() : null;
}
