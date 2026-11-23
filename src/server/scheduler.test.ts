// The nightly copy: a second copy on the same date lands beside the first, a copy that fails ends its Live entry, and a
// failed tick's log line carries no path. Made-up folders only.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../db/migrate.ts";
import { running } from "../platform/activity.ts";
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
  writeFileSync(first, "");
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
