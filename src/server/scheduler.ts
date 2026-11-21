// The scheduler, sleep-proof: a minute tick runs whatever is overdue instead of pointing at a wall-clock moment, so
// a computer that slept all night catches up the moment it wakes. The database snapshots daily-ish (no copy younger
// than 20 hours), 7 kept.

import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { snapshot } from "../db/db.ts";
import { importV1 } from "../domain/search/import-v1.ts";
import { lastRun, runSearch } from "../domain/search/runs.ts";
import { loadSpecs } from "../domain/search/specs.ts";

export type SchedulerDirs = { specsDir: string; backupsDir: string; mirrorFile?: string };

export async function tick(db: DatabaseSync, dirs: SchedulerDirs, now: Date): Promise<string[]> {
  const did: string[] = [];
  for (const spec of loadSpecs(dirs.specsDir).specs) {
    if (!spec.enabled) continue;
    const last = lastRun(db, spec.id);
    const due = !last || now.getTime() - new Date(last.started).getTime() >= spec.everyMinutes * 60_000;
    if (!due) continue;
    await runSearch(db, spec, now); // one at a time: the collectors share one computer and one browser
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
      try {
        const counts = importV1(db, mirror.from, true);
        found = counts.landed.new + counts.landed.updated + counts.landed.unchanged;
        kept = counts.landed.new + counts.landed.updated;
      } catch (e) {
        problem = `the mirror failed: ${(e as Error).message.slice(0, 120)}`;
      }
      db.prepare(
        "INSERT INTO search_runs (id, search, started, ms, found, kept, problem) VALUES (?, ?, ?, 0, ?, ?, ?)",
      ).run(randomUUID(), "mirror:v1", now.toISOString(), found, kept, problem);
      did.push("mirror:v1");
    }
  }
  if (backupDue(dirs.backupsDir, now)) {
    mkdirSync(dirs.backupsDir, { recursive: true });
    snapshot(db, join(dirs.backupsDir, `kestrel-${now.toISOString().slice(0, 10)}.db`));
    const files = readdirSync(dirs.backupsDir)
      .filter((f) => f.startsWith("kestrel-"))
      .sort();
    for (const old of files.slice(0, Math.max(0, files.length - 7))) rmSync(join(dirs.backupsDir, old));
    did.push("backup");
  }
  return did;
}

function readMirror(file?: string): { from: string; everyMinutes: number } | null {
  if (!file) return null;
  try {
    const read = JSON.parse(readFileSync(file, "utf8")) as { from?: string; everyMinutes?: number };
    return read.from ? { from: read.from, everyMinutes: read.everyMinutes ?? 1440 } : null;
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
