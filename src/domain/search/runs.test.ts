// A run keeps and records; an empty page is a problem; the sleep-proof tick catches up and spaces out.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../../db/migrate.ts";
import { type Activity, activity } from "../../platform/activity.ts";
import { tick } from "../../server/scheduler.ts";
import { listHunts } from "./listings.ts";
import { countOf, lastRun, runSearch } from "./runs.ts";
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
    auto: true,
    times: [],
    limits: { perRun: 200, timeoutMs: 180_000, maxBytes: 20_000_000 },
    env: {},
    scoring: { title: { want: ["keeper"] } } as unknown,
    about: "",
    hunt: "",
    category: "",
    enabled: true,
    alerts: false,
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

test("Live says what a search is doing: its name, its place in the line, and the collector's count as it goes", async () => {
  const { base, db, spec } = setup(ITEM);
  // a second search whose collector reports its progress on stderr, as the old collectors do
  const talky = join(base, "talky.mjs");
  writeFileSync(
    talky,
    `#!/usr/bin/env node
     console.error("made-up-site: 1 scroll for more, 20 ads");
     console.error("made-up-site: 2 scrolls for more, 40 ads");
     console.error("made-up-site: read 4 of 6 job pages");
     console.log(JSON.stringify(${ITEM}));`,
  );
  chmodSync(talky, 0o755);
  const seen: Activity[] = [];
  const keep = (a: Activity) => seen.push(a);
  activity.on("ended", keep);
  const now = new Date("2026-11-21T12:00:00Z");
  await Promise.all([
    runSearch(db, spec, now),
    runSearch(db, { ...spec, id: "made-up-two", name: "Made-up · Board", collector: talky }, now),
  ]);
  activity.off("ended", keep);
  // the count took the sentence's place each time: one line while it searched, one when it ended
  assert.deepEqual(
    seen.map((a) => a.steps.map((s) => s.text)),
    [
      ["Made-up: 1 of 2", "1 found, 1 new"],
      ["Made-up · Board: 2 of 2, 40 jobs so far", "1 found, 1 new"],
    ],
  );
  // a search alone in the line has no place to say
  const alone: Activity[] = [];
  const hear = (a: Activity) => alone.push(a);
  activity.on("ended", hear);
  await runSearch(db, spec, new Date("2026-11-21T13:00:00Z"));
  activity.off("ended", hear);
  assert.equal(alone[0]?.steps[0]?.text, "Made-up: searching");
  // a total is not a count (review: "read 4 of 6 job pages" turned 25 jobs into 6)
  assert.equal(countOf("made-up-board: read 4 of 16 job pages"), null);
  assert.equal(countOf('made-up-board: "words" in a place: 1,025 jobs so far'), 1025);
});

test("a scheduled round's searches each say their place in it (review: every run was alone in the line)", async () => {
  const { base, db, spec } = setup(ITEM);
  const specsDir = join(base, "round-searches");
  mkdirSync(specsDir);
  for (const name of ["First", "Second"])
    writeFileSync(
      join(specsDir, `${name.toLowerCase()}.json`),
      JSON.stringify({ name, collector: spec.collector, everyMinutes: 360, scoring: {} }),
    );
  const seen: Activity[] = [];
  const keep = (a: Activity) => a.kind === "search" && seen.push(a);
  activity.on("ended", keep);
  await tick(db, { specsDir, backupsDir: join(base, "round-backups") }, new Date("2026-11-21T03:00:00Z"));
  activity.off("ended", keep);
  assert.deepEqual(
    seen.map((a) => a.steps[0]?.text),
    ["First: 1 of 2", "Second: 2 of 2"],
  );
});

test("a search without a hunt keeps its finds beside the carried-over ones: one tab, not two", async () => {
  const { db, spec } = setup(ITEM);
  db.prepare(
    `INSERT INTO listings (id, search, source, link, dedupe, status, found, updated, score, match, data, kind)
     VALUES ('carried', 'made-up', 'made-up-board', 'https://example.com/old', 'old', 'new', ?, ?, 50, 'weak', '{}', 'jobs')`,
  ).run("2026-11-01T00:00:00Z", "2026-11-01T00:00:00Z");
  await runSearch(db, spec, new Date("2026-11-21T12:00:00Z"));
  assert.deepEqual(
    listHunts(db).map((h) => [h.key, h.count]),
    [["made-up", 2]],
  );
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

test("the searches wait while an application is at work, and run on the next tick after it", async () => {
  const { base, db, spec } = setup(ITEM);
  const specsDir = join(base, "searches");
  mkdirSync(specsDir);
  const { id, ...file } = spec;
  writeFileSync(join(specsDir, "made-up.json"), JSON.stringify(file));
  const dirs = { specsDir, backupsDir: join(base, "backups") };
  const now = new Date("2026-11-21T03:00:00Z");
  db.prepare(
    "INSERT INTO applications (id, listing, link, title, org, state, reason, agent, started, updated) VALUES ('a1', NULL, 'https://example.com/job', 'Role', 'Made Co', 'applying', '', 'hunt', ?, ?)",
  ).run(now.toISOString(), now.toISOString());
  assert.ok(!(await tick(db, dirs, now)).includes("search:made-up"));
  db.prepare("UPDATE applications SET state = 'sent' WHERE id = 'a1'").run();
  assert.ok((await tick(db, dirs, new Date("2026-11-21T03:01:00Z"))).includes("search:made-up"));
});

test("with no run of the old setup to follow, the mirror runs by the clock while mirror-v1.json points at the old database", async () => {
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
