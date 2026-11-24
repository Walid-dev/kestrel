// The nightly copy: a second copy on the same date lands beside the first, a copy that fails ends its Live entry and
// waits an hour before it tries again, and a failed tick's log line carries no path. The mirror follows the old
// setup's runs. Made-up folders and a made-up old database only.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../db/migrate.ts";
import { finished, running } from "../platform/activity.ts";
import { runTick, tick } from "./scheduler.ts";

function setup() {
  const base = mkdtempSync(join(tmpdir(), "kestrel-sched-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  mkdirSync(join(base, "searches"));
  return { base, db };
}
const copies = () => running().filter((a) => a.kind === "backup");

test("a second copy on the same date lands beside the first (review: the copy failed for hours)", async () => {
  const { base, db } = setup();
  const backups = join(base, "backups");
  mkdirSync(backups);
  // a copy made at 00:30 UTC; 20.5 hours later the next is due, on the same date
  const first = join(backups, "kestrel-2026-11-23.db");
  const copy = new DatabaseSync(first); // a real copy: SQLite copies over an empty file, not over a database
  copy.exec("CREATE TABLE t (x)");
  copy.close();
  const at = new Date("2026-11-23T00:30:00Z");
  utimesSync(first, at, at);
  const did = await tick(
    db,
    { specsDir: join(base, "searches"), backupsDir: backups },
    new Date("2026-11-23T21:00:00Z"),
  );
  assert.deepEqual(did, ["backup"]);
  assert.equal(readdirSync(backups).length, 2);
  assert.deepEqual(copies(), []);
});

test("a copy that fails ends its Live entry; the tick's log line names no folder", async (t) => {
  const { base, db } = setup();
  const backups = join(base, "locked");
  mkdirSync(backups);
  chmodSync(backups, 0o500); // the copy can't be written here
  const logged: string[] = [];
  t.mock.method(console, "error", (line: string) => logged.push(line));
  try {
    await runTick(db, { specsDir: join(base, "searches"), backupsDir: backups }, new Date("2026-11-23T21:00:00Z"));
  } finally {
    chmodSync(backups, 0o700);
  }
  assert.deepEqual(copies(), []); // ended as failed, not left running
  // a folder that can't be made: the fs error names the path, the log line doesn't
  const blocked = join(base, "a-file");
  writeFileSync(blocked, "");
  await runTick(
    db,
    { specsDir: join(base, "searches"), backupsDir: join(blocked, "backups") },
    new Date("2026-11-24T21:00:00Z"),
  );
  assert.equal(logged.length, 2);
  for (const line of logged) {
    assert.match(line, /^the scheduler's tick failed: /);
    assert.ok(!line.includes(base), line);
  }
  assert.match(logged[1], /\(a path\)/);
});

test("a copy that keeps failing tries once an hour, not every minute (review: one failed Live entry a minute)", async (t) => {
  const { base, db } = setup();
  const blocked = join(base, "a-file");
  writeFileSync(blocked, ""); // the copies' folder can't be made under a file
  t.mock.method(console, "error", () => {});
  const dirs = { specsDir: join(base, "searches"), backupsDir: join(blocked, "backups") };
  const failed = () => finished().filter((a) => a.kind === "backup" && a.outcome === "failed").length;
  const before = failed();
  for (const at of ["21:00", "21:01", "21:59"]) await runTick(db, dirs, new Date(`2026-11-25T${at}:00Z`));
  assert.equal(failed() - before, 1);
  await runTick(db, dirs, new Date("2026-11-25T22:00:00Z"));
  assert.equal(failed() - before, 2);
});

test("the mirror brings the old setup's finds at the first tick after each of its runs, the clock at the latest", async () => {
  const { base, db } = setup();
  const from = join(base, "old.db");
  const old = new DatabaseSync(from);
  old.exec(`CREATE TABLE job_listings (id TEXT, hunt TEXT, link TEXT, dedupe_key TEXT, status TEXT, found TEXT, data TEXT);
    CREATE TABLE job_runs (id TEXT PRIMARY KEY, at TEXT NOT NULL, doc TEXT NOT NULL);
    CREATE TABLE runs (run_id TEXT PRIMARY KEY, spec TEXT, started TEXT)`);
  const put = old.prepare("INSERT INTO job_listings VALUES (?, 'made-up-hunt', ?, ?, 'new', '2026-11-21', ?)");
  const job = (id: string) =>
    put.run(id, `https://example.com/${id}`, `made co|${id}`, JSON.stringify({ title: `Keeper ${id}` }));
  // an old run writes its row as it ends, stamped with the time it started
  const ran = (id: string, started: string) => old.prepare("INSERT INTO job_runs VALUES (?, ?, '{}')").run(id, started);
  const mirrorFile = join(base, "mirror-v1.json");
  writeFileSync(mirrorFile, JSON.stringify({ from, everyMinutes: 1440 }));
  const dirs = { specsDir: join(base, "searches"), backupsDir: join(base, "backups"), mirrorFile };
  const mirrors = async (at: string) => (await tick(db, dirs, new Date(at))).includes("mirror:v1");
  const listed = () => (db.prepare("SELECT COUNT(*) AS n FROM listings").get() as { n: number }).n;
  job("o1");
  ran("r1", "2026-11-21T14:00:00.000Z");
  assert.ok(await mirrors("2026-11-21T14:10:00Z"));
  assert.equal(listed(), 1);
  assert.ok(!(await mirrors("2026-11-21T14:11:00Z"))); // no run since: no mirror
  job("o2");
  ran("r2", "2026-11-21T22:00:00.000Z");
  assert.ok(await mirrors("2026-11-21T22:06:00Z")); // the next run's find, a minute after it ends, not a day
  assert.equal(listed(), 2);
  // a run that started before that mirror and ended after it still brings its finds
  job("o3");
  ran("r3", "2026-11-21T22:04:00.000Z");
  assert.ok(await mirrors("2026-11-21T22:09:00Z"));
  assert.equal(listed(), 3);
  old.prepare("INSERT INTO runs VALUES ('d1', 'made-up-chairs', '2026-11-21 22:30:00')").run(); // a deal search's run
  assert.ok(await mirrors("2026-11-21T22:31:00Z"));
  assert.ok(!(await mirrors("2026-11-22T22:30:00Z"))); // no run for a day: not yet
  assert.ok(await mirrors("2026-11-22T22:31:00Z")); // everyMinutes after the last mirror: the clock
  old.close();
});
