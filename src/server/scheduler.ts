// The scheduler, sleep-proof: a minute tick runs whatever is overdue instead of pointing at a wall-clock moment, so
// a computer that slept all night catches up the moment it wakes. The database snapshots daily-ish (no copy younger
// than 20 hours), 7 kept.
import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { snapshot } from "../db/db.ts";
import { lastRun, runSearch } from "../domain/search/runs.ts";
import { loadSpecs } from "../domain/search/specs.ts";

export type SchedulerDirs = { specsDir: string; backupsDir: string };

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
