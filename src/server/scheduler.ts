// The scheduler, sleep-proof: a minute tick runs whatever is overdue instead of pointing at a wall-clock moment, so
// a computer that slept all night catches up the moment it wakes. The database snapshots daily-ish (no copy younger
// than 20 hours), 7 kept.

import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { snapshot } from "../db/db.ts";
import { importV1 } from "../domain/search/import-v1.ts";
import { lastRun, type Run, runSearch } from "../domain/search/runs.ts";
import { isDue, loadSpecs, type Spec } from "../domain/search/specs.ts";
import { begin } from "../platform/activity.ts";

export type SchedulerDirs = {
  specsDir: string;
  backupsDir: string;
  mirrorFile?: string;
  afterRun?: (spec: Spec, run: Run) => Promise<void>; // a hunt that is On pings my phone (server/alerts.ts)
};

// an error's words, with any path turned generic: the run rows and the service log never carry folders
const plainWords = (msg: string): string => msg.replaceAll(/\/[^\s"']+/g, "(a path)").slice(0, 120);

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
  // an application at work has the agent's browser and the model: the searches wait for the next tick (two hours at
  // most, should its end never be reported)
  const applying = db
    .prepare("SELECT 1 FROM applications WHERE state = 'applying' AND updated > ? LIMIT 1")
    .get(new Date(now.getTime() - 2 * 3600_000).toISOString());
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
  // the side-by-side week's mirror: while mirror-v1.json names the old database, its statuses flow in nightly
  const mirror = readMirror(dirs.mirrorFile);
  if (mirror) {
    const last = lastRun(db, "mirror:v1");
    if (!last || now.getTime() - new Date(last.started).getTime() >= mirror.everyMinutes * 60_000) {
      let found = 0;
      let kept = 0;
      let problem = "";
      const live = begin("mirror", "The nightly mirror from the old setup", "/searches");
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
      did.push("mirror:v1");
    }
  }
  if (backupDue(dirs.backupsDir, now)) {
    mkdirSync(dirs.backupsDir, { recursive: true });
    const copy = begin("backup", "The nightly copy of the database");
    snapshot(db, join(dirs.backupsDir, `kestrel-${now.toISOString().slice(0, 10)}.db`));
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

export function startScheduler(db: DatabaseSync, dirs: SchedulerDirs): void {
  const run = () =>
    tick(db, dirs, new Date()).catch((e) => console.error(`the scheduler's tick failed: ${(e as Error).message}`));
  run(); // catch up at start: a restart or a wake never skips the day
  setInterval(run, 60_000).unref();
}
