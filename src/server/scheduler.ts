// The scheduler, sleep-proof: a minute tick runs whatever is overdue instead of pointing at a wall-clock moment, so
// a computer that slept all night catches up the moment it wakes. The database snapshots daily-ish (no copy younger
// than 20 hours), 7 kept.

import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { snapshot } from "../db/db.ts";
import { importV1, v1RunMark } from "../domain/search/import-v1.ts";
import { lastRun, type Run, runSearch } from "../domain/search/runs.ts";
import { isDue, loadSpecs, type Spec } from "../domain/search/specs.ts";
import { begin } from "../platform/activity.ts";
import { plainWords } from "../platform/plain.ts";

export type SchedulerDirs = {
  specsDir: string;
  backupsDir: string;
  mirrorFile?: string;
  afterRun?: (spec: Spec, run: Run) => Promise<void>; // a hunt that is On pings my phone (server/alerts.ts)
  // the morning news (domain/news/brief.ts): starts what is due in the background and says what it started; told
  // whether an application is at work, when the brief waits
  news?: (now: Date, applying: boolean) => string | null;
};

// a copy that failed (a full disk, a folder it can't write) tries again an hour later, not every minute: each try
// is one failed entry in Live and one log line. In memory, by folder: a restart tries at once.
const copyFailed = new Map<string, number>();
const RETRY_COPY_MS = 3_600_000;
// the old setup's run mark (domain/search/import-v1.ts), by old database: the one the last mirror saw, and the newest
// with the minute it first showed. A round of the old setup writes a row as each of its searches ends, a minute or two
// apart (about 20 deal searches, then the jobs): the mirror waits until the mark has stayed still SETTLE_MS, so a
// round brings one mirror, not one per search. In memory: a restart mirrors once, SETTLE_MS after its first tick,
// catching up a run that ended while kestrel was down.
const mirrorSaw = new Map<string, string>();
const mirrorMark = new Map<string, { mark: string; since: number }>();
const SETTLE_MS = 5 * 60_000;

let ticking = false; // one tick at a time: a slow collector must never stack duplicate runs behind itself

export async function tick(db: DatabaseSync, dirs: SchedulerDirs, now: Date): Promise<string[]> {
  if (ticking) return [];
  ticking = true;
  try {
    return await tickNow(db, dirs, now);
  } finally {
    ticking = false;
  }
}

async function tickNow(db: DatabaseSync, dirs: SchedulerDirs, now: Date): Promise<string[]> {
  const did: string[] = [];
  // an application at work has the agent's browser and the model: the searches and the news brief wait for a later
  // tick (two hours at most, should its end never be reported)
  const applying = Boolean(
    db
      .prepare("SELECT 1 FROM applications WHERE state = 'applying' AND updated > ? LIMIT 1")
      .get(new Date(now.getTime() - 2 * 3600_000).toISOString()),
  );
  // first, since it only starts its work: the brief (or a read of the feeds) never waits behind a long search
  try {
    const news = dirs.news?.(now, applying);
    if (news) did.push(`news:${news}`);
  } catch (e) {
    console.error(`the news couldn't start: ${plainWords((e as Error).message)}`);
  }
  const specs = loadSpecs(dirs.specsDir).specs;
  for (const spec of specs) {
    if (!spec.enabled || !spec.auto || applying) continue; // off, only when I ask, or an application at work
    if (!isDue(spec, lastRun(db, spec.id)?.started ?? null, now)) continue;
    try {
      const run = await runSearch(db, spec, now); // one at a time: the collectors share one computer and one browser
      await dirs.afterRun?.(spec, run).catch(() => {}); // a ping that fails never stops the tick
    } catch (e) {
      // a crash still lands a run row, so the spec isn't due again every minute and the screen says what happened
      db.prepare(
        "INSERT INTO search_runs (id, search, started, ms, found, kept, problem) VALUES (?, ?, ?, 0, 0, 0, ?)",
      ).run(randomUUID(), spec.id, now.toISOString(), `the run crashed: ${plainWords((e as Error).message)}`);
    }
    did.push(`search:${spec.id}`);
  }
  // the side-by-side weeks' mirror, while mirror-v1.json names the old database: its new finds flow in once its runs
  // have settled (its run mark moved, then stayed still SETTLE_MS: one read-only query a minute), and everything,
  // statuses I marked there included, every everyMinutes at the latest
  const mirror = readMirror(dirs.mirrorFile);
  if (mirror) {
    const last = lastRun(db, "mirror:v1");
    const mark = v1RunMark(mirror.from);
    let ran = false;
    if (mark !== null) {
      const seen = mirrorMark.get(mirror.from);
      const since = seen?.mark === mark ? seen.since : now.getTime();
      mirrorMark.set(mirror.from, { mark, since });
      ran = mark !== mirrorSaw.get(mirror.from) && now.getTime() - since >= SETTLE_MS;
    }
    if (!last || ran || now.getTime() - new Date(last.started).getTime() >= mirror.everyMinutes * 60_000) {
      let found = 0;
      let kept = 0;
      let problem = "";
      const live = begin("mirror", "The mirror from the old setup", "/searches");
      try {
        live.step("Reading the old database");
        const counts = importV1(db, mirror.from, true, {
          specsDir: mirror.specs,
          jobScoring: (search) => specs.find((s) => s.id === search)?.scoring,
        });
        const j = counts.landed;
        const d = counts.deals.landed;
        found = j.new + j.updated + j.unchanged + d.new + d.updated + d.unchanged;
        kept = j.new + j.updated + d.new + d.updated;
      } catch (e) {
        problem = `the mirror failed: ${plainWords((e as Error).message)}`;
      }
      live.step(`${found} seen, ${kept} refreshed`);
      live.end(problem ? "failed" : "done", problem);
      db.prepare(
        "INSERT INTO search_runs (id, search, started, ms, found, kept, problem) VALUES (?, ?, ?, 0, ?, ?, ?)",
      ).run(randomUUID(), "mirror:v1", now.toISOString(), found, kept, problem);
      // seen even when the import failed: a failing mirror tries again after the next round or by the clock, not every
      // minute (each try is one failed entry in Live), and its problem shows on the hunt's line meanwhile
      if (mark !== null) mirrorSaw.set(mirror.from, mark);
      did.push("mirror:v1");
    }
  }
  const failedAt = copyFailed.get(dirs.backupsDir) ?? Number.NEGATIVE_INFINITY;
  if (backupDue(dirs.backupsDir, now) && now.getTime() - failedAt >= RETRY_COPY_MS) {
    const copy = begin("backup", "The nightly copy of the database");
    try {
      mkdirSync(dirs.backupsDir, { recursive: true });
      // named to the minute: a copy is due 20 hours after the last, so two can fall on one date, and SQLite refuses
      // to copy over a file that is there
      snapshot(db, join(dirs.backupsDir, `kestrel-${now.toISOString().slice(0, 16).replace(":", "-")}.db`));
    } catch (e) {
      copyFailed.set(dirs.backupsDir, now.getTime());
      copy.end("failed", plainWords((e as Error).message));
      throw e;
    }
    copyFailed.delete(dirs.backupsDir);
    copy.end("done");
    const files = readdirSync(dirs.backupsDir)
      .filter((f) => f.startsWith("kestrel-"))
      .sort();
    for (const old of files.slice(0, Math.max(0, files.length - 7))) rmSync(join(dirs.backupsDir, old));
    did.push("backup");
  }
  return did;
}

function readMirror(file?: string): { from: string; everyMinutes: number; specs?: string } | null {
  if (!file) return null;
  try {
    const read = JSON.parse(readFileSync(file, "utf8")) as { from?: string; everyMinutes?: number; specs?: string };
    return read.from ? { from: read.from, everyMinutes: read.everyMinutes ?? 1440, specs: read.specs } : null;
  } catch {
    return null; // no mirror file: nothing to mirror
  }
}

function backupDue(backupsDir: string, now: Date): boolean {
  try {
    const files = readdirSync(backupsDir).filter((f) => f.startsWith("kestrel-"));
    const newest = Math.max(0, ...files.map((f) => statSync(join(backupsDir, f)).mtimeMs));
    return now.getTime() - newest >= 20 * 3_600_000;
  } catch {
    return true; // no backups folder yet: the first copy is due
  }
}

// one tick whose failure is one plain line in the service log: an fs error names its folder, so the path goes
export const runTick = (db: DatabaseSync, dirs: SchedulerDirs, now: Date): Promise<unknown> =>
  tick(db, dirs, now).catch((e) => console.error(`the scheduler's tick failed: ${plainWords((e as Error).message)}`));

export function startScheduler(db: DatabaseSync, dirs: SchedulerDirs): void {
  const run = () => runTick(db, dirs, new Date());
  run(); // catch up at start: a restart or a wake never skips the day
  setInterval(run, 60_000).unref();
}
