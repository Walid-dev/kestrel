// A run keeps and records; an empty page is a problem; the sleep-proof tick catches up and spaces out.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../../db/migrate.ts";
import { tick } from "../../server/scheduler.ts";
import { lastRun, runSearch } from "./runs.ts";
import type { Spec } from "./specs.ts";

function setup(items: string) {
  const base = mkdtempSync(join(tmpdir(), "kestrel-runs-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  const script = join(base, "collector.mjs");
  writeFileSync(script, `#!/usr/bin/env node\nconsole.log(JSON.stringify(${items}));`);
  chmodSync(script, 0o755);
  const spec: Spec = {
    id: "made-up",
    name: "Made-up",
    kind: "jobs",
    collector: script,
    args: [],
    everyMinutes: 360,
    limits: { perRun: 200, timeoutMs: 180_000, maxBytes: 20_000_000 },
    env: {},
    scoring: { title: { want: ["engineer"] } } as unknown,
    enabled: true,
  };
  return { base, db, spec };
}

const ITEM = `[{ source: "made-up-board", url: "https://example.com/1", title: "Senior Engineer", org: "Made-up Co" }]`
  .replace("source:", '"source":')
  .replace("url:", '"url":')
  .replace("title:", '"title":')
  .replace("org:", '"org":');

test("a run keeps its items and records itself; an empty page is a problem", async () => {
  const { db, spec } = setup(ITEM);
  const run = await runSearch(db, spec, new Date("2026-11-21T12:00:00Z"));
  assert.deepEqual([run.found, run.kept, run.problem], [1, 1, ""]);
  const { db: db2, spec: spec2 } = setup("[]");
  const empty = await runSearch(db2, spec2, new Date("2026-11-21T12:00:00Z"));
  assert.equal(empty.problem, "the page answered empty");
});

test("the tick runs what is overdue, spaces out what isn't, and catches up after a long sleep", async () => {
  const { base, db, spec } = setup(ITEM);
  const specsDir = join(base, "searches");
  mkdirSync(specsDir);
  const { id, ...file } = spec;
  writeFileSync(join(specsDir, "made-up.json"), JSON.stringify(file));
  const dirs = { specsDir, backupsDir: join(base, "backups") };
  const first = await tick(db, dirs, new Date("2026-11-21T03:00:00Z"));
  assert.deepEqual(first, ["search:made-up", "backup"]);
  const soon = await tick(db, dirs, new Date("2026-11-21T03:30:00Z"));
  assert.deepEqual(soon, []); // nothing due half an hour later
  const afterSleep = await tick(db, dirs, new Date("2026-11-23T09:00:00Z"));
  assert.ok(afterSleep.includes("search:made-up")); // the slept-through run happens on wake
  assert.equal(lastRun(db, "made-up")?.started, "2026-11-23T09:00:00.000Z");
});

test("the mirror runs nightly while mirror-v1.json points at the old database (side by side)", async () => {
  const { base, db } = setup(ITEM);
  const old = join(base, "old.db");
  const oldDb = new DatabaseSync(old);
  oldDb.exec(
    "CREATE TABLE job_listings (id TEXT, hunt TEXT, link TEXT, dedupe_key TEXT, status TEXT, found TEXT, data TEXT)",
  );
  oldDb
    .prepare(
      "INSERT INTO job_listings VALUES ('o1', 'made-up-hunt', 'https://example.com/9', 'made co|role', 'new', '2026-11-01', ?)",
    )
    .run(JSON.stringify({ source: "made-up-board", title: "Role", company: "Made Co", score: 50, match: "weak" }));
  oldDb.close();
  const { writeFileSync: write, mkdirSync: mk } = await import("node:fs");
  const mirrorFile = join(base, "mirror-v1.json");
  write(mirrorFile, JSON.stringify({ from: old, everyMinutes: 1440 }));
  mk(join(base, "empty-searches"));
  const dirs = { specsDir: join(base, "empty-searches"), backupsDir: join(base, "backups"), mirrorFile };
  const first = await tick(db, dirs, new Date("2026-11-21T03:00:00Z"));
  assert.ok(first.includes("mirror:v1"));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM listings").get()?.n, 1);
  const soon = await tick(db, dirs, new Date("2026-11-21T09:00:00Z"));
  assert.ok(!soon.includes("mirror:v1")); // not due again the same day
  const nextNight = await tick(db, dirs, new Date("2026-11-22T03:05:00Z"));
  assert.ok(nextNight.includes("mirror:v1"));
});

test("a crashing spec still lands a run row, the tick carries on, and two ticks never overlap (sweep F3)", async () => {
  const { base, db } = setup(ITEM);
  const specsDir = join(base, "crash-searches");
  mkdirSync(specsDir);
  // a spec whose scoring is unreadable enough to crash keepItems? the collector itself crashing is covered by the
  // door; here the run throws inside by pointing the collector at a directory
  writeFileSync(
    join(specsDir, "crashy.json"),
    JSON.stringify({ name: "Crashy", collector: base, everyMinutes: 360, scoring: {} }),
  );
  const dirs = { specsDir, backupsDir: join(base, "crash-backups") };
  const did = await tick(db, dirs, new Date("2026-11-21T03:00:00Z"));
  assert.ok(did.includes("search:crashy"));
  assert.ok(did.includes("backup")); // the crash never stops the backup
  const last = lastRun(db, "crashy");
  assert.ok(last, "the crash landed a run row");
  const again = await tick(db, dirs, new Date("2026-11-21T03:05:00Z"));
  assert.ok(!again.includes("search:crashy"), "a crashed spec is not due again every minute");
  // overlap: two ticks at once — the second yields at the door
  const [a, b] = await Promise.all([
    tick(db, dirs, new Date("2026-11-22T03:00:00Z")),
    tick(db, dirs, new Date("2026-11-22T03:00:01Z")),
  ]);
  assert.ok(a.length === 0 || b.length === 0, "one of the overlapping ticks stood down");
});
