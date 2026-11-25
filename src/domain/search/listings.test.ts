// Dedupe never double-lists (a fresh run after an import included), Priority follows its rule, filters combine. A
// listing deleted leaves every view and count, a run never brings it back, and it comes back whole.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../../db/migrate.ts";
import { morningBrief } from "../brief.ts";
import type { Item } from "./collect.ts";
import {
  deleteListings,
  getDeletedListing,
  getListing,
  isPriority,
  keepItems,
  listHunts,
  listingCounts,
  listListings,
  normalizeDedupe,
  rescoreSearch,
  restoreListings,
  setListingStar,
  setListingStatus,
} from "./listings.ts";

const NOW = new Date("2026-11-21T12:00:00Z");
const scoring = {
  title: { want: ["keeper"] },
  skills: ["Apiary", "Smoker", "Hive", "Wax"],
  level: { want: ["head"] },
  places: { words: ["Hiveton"] },
  freshDays: 7,
};
const item = (o: Partial<Item> = {}): Item => ({
  source: "made-up-board",
  url: "https://example.com/job/1",
  title: "Head Keeper",
  org: "Made-up Co",
  location: "Hiveton",
  posted: "2026-11-20",
  workMode: "",
  seniority: "Head",
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
  salaryPeriod: null,
  price: null,
  usOnly: false,
  excerpt: "Apiary Smoker Hive Wax.",
  ...o,
});

function setup() {
  const base = mkdtempSync(join(tmpdir(), "kestrel-listings-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  return db;
}

test("a job seen twice updates lastSeen and never double-lists; a punctuation twin dedupes too", () => {
  const db = setup();
  const first = keepItems(db, "s1", [item()], scoring, NOW);
  assert.deepEqual(first, { found: 1, kept: 1 });
  const again = keepItems(
    db,
    "s1",
    [item({ url: "https://example.com/job/other", title: "Head  Keeper!" })],
    scoring,
    NOW,
  );
  assert.deepEqual(again, { found: 1, kept: 0 });
  assert.equal(listListings(db).length, 1);
});

test("an imported row with the old dedupe key still blocks the double-list by link", () => {
  const db = setup();
  db.prepare(
    `INSERT INTO listings (id, search, source, link, dedupe, status, starred, found, updated, score, match, data)
     VALUES ('old-1', 's1', 'made-up-board', 'https://example.com/job/1', 'old|key|head|meadow', 'applied', NULL,
       '2026-11-01', '2026-11-01', 61, 'good', '{}')`,
  ).run();
  const run = keepItems(db, "s1", [item()], scoring, NOW);
  assert.deepEqual(run, { found: 1, kept: 0 });
  const rows = listListings(db);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "applied"); // the status a run never touches
});

test("Priority: starred by hand, or an automatic great match until it is set aside", () => {
  assert.equal(isPriority({ starred: 1, match: "poor", status: "rejected" }), true);
  assert.equal(isPriority({ starred: null, match: "great", status: "applied" }), true);
  assert.equal(isPriority({ starred: null, match: "great", status: "passed" }), false);
  assert.equal(isPriority({ starred: 0, match: "great", status: "new" }), false);
  assert.equal(isPriority({ starred: null, match: "good", status: "new" }), false);
});

test("status and star stick, and the filters combine", () => {
  const db = setup();
  keepItems(
    db,
    "s1",
    [item(), item({ url: "https://example.com/2", title: "Junior Clerk", org: "Other Co" })],
    scoring,
    NOW,
  );
  const [a, b] = listListings(db);
  setListingStatus(db, b.id, "passed");
  setListingStar(db, a.id, 1);
  assert.equal(listListings(db, { status: "passed" }).length, 1);
  assert.equal(listListings(db, { priority: true }).length, 1);
  assert.equal(listListings(db, { q: "clerk" }).length, 1);
  assert.equal(listListings(db, { search: "s1" }).length, 2);
  assert.equal(listListings(db, { search: "s1", status: "passed" }).length, 1);
  assert.equal(listListings(db, { search: "nowhere" }).length, 0);
  assert.equal(normalizeDedupe("Made-up Co", "Head  Keeper!"), "madeup co|head keeper");
});

test("Priority and the word search see past the window: an old starred row never vanishes (sweep F1)", () => {
  const db = setup();
  // an old starred listing, found long ago
  db.prepare(
    `INSERT INTO listings (id, search, source, link, dedupe, status, starred, found, updated, score, match, data)
     VALUES ('old-star', 's1', 'made-up-board', 'https://example.com/old', 'ancient co|keeper', 'applied', 1,
       '2026-01-01', '2026-01-01', 61, 'good', '{"title":"Keeper of the Hive"}')`,
  ).run();
  // six hundred newer rows push it far outside any window
  const put = db.prepare(
    `INSERT INTO listings (id, search, source, link, dedupe, status, starred, found, updated, score, match, data)
     VALUES (?, 's1', 'made-up-board', ?, ?, 'new', NULL, '2026-11-21', '2026-11-21', 10, 'poor', '{}')`,
  );
  for (let i = 0; i < 600; i++) put.run(`n${i}`, `https://example.com/n${i}`, `co${i}|role${i}`);
  const priority = listListings(db, { priority: true });
  assert.deepEqual(
    priority.map((r) => r.id),
    ["old-star"],
  );
  const found = listListings(db, { q: "keeper of the hive" });
  assert.deepEqual(
    found.map((r) => r.id),
    ["old-star"],
  );
});

test("two searches sharing one link each keep their own row and their own score (sweep F2)", () => {
  const db = setup();
  keepItems(
    db,
    "search-a",
    [item()],
    { title: { want: ["keeper"] }, skills: ["Apiary", "Smoker", "Hive", "Wax"] },
    NOW,
  );
  const b = keepItems(db, "search-b", [item()], { title: { want: ["nothing-here"] } }, NOW);
  assert.equal(b.kept, 1); // its own row, not a swallow
  const rows = listListings(db).filter((r) => r.link === "https://example.com/job/1");
  assert.equal(rows.length, 2);
  const scores = new Set(rows.map((r) => r.score));
  assert.equal(scores.size, 2); // each scored by its own spec
});

test("status and star on a listing that isn't there are refused in words (sweep)", () => {
  const db = setup();
  assert.throws(() => setListingStatus(db, "nope", "passed"), /no such listing/);
  assert.throws(() => setListingStar(db, "nope", 1), /no such listing/);
});

test("the stages: review takes good matches, possible the weaker ones, left out stays apart until marked, All has every one", () => {
  const db = setup();
  const put = db.prepare(
    `INSERT INTO listings (id, search, source, link, dedupe, status, starred, found, updated, score, match, data, kind)
     VALUES (?, 's1', 'made-up', ?, ?, ?, NULL, '2026-11-20', '2026-11-20', ?, ?, ?, 'jobs')`,
  );
  const row = (id: string, status: string, score: number, match: string, data: Record<string, unknown>) =>
    put.run(id, `https://example.com/${id}`, `co|${id}`, status, score, match, JSON.stringify(data));
  row("great", "new", 85, "great", {});
  row("good", "new", 65, "good", {});
  row("fair", "new", 50, "weak", {});
  row("out", "new", 30, "poor", { leftOut: "weak match" });
  row("noted", "new", 30, "poor", { leftOut: "weak match", note: "worth a look" }); // a note brings it back
  row("seen", "interested", 30, "poor", { leftOut: "weak match" }); // a stage brings it back too
  const ids = (stage: string) =>
    listListings(db, { stage })
      .map((r) => r.id)
      .sort();
  assert.deepEqual(ids("review"), ["good", "great"]);
  assert.deepEqual(ids("possible"), ["fair", "noted"]);
  assert.deepEqual(ids("leftout"), ["out"]);
  assert.deepEqual(ids("all"), ["fair", "good", "great", "noted", "out", "seen"]); // the left out one too
  assert.deepEqual(ids("interested"), ["seen"]);
  // only the card still set aside says why: a note or a stage takes it back into my list
  assert.deepEqual(
    listListings(db, { stage: "all" })
      .filter((r) => r.leftOut)
      .map((r) => [r.id, r.leftOut]),
    [["out", "weak match"]],
  );
  const c = listingCounts(db, {});
  assert.equal(c.stages.review, 2);
  assert.equal(c.stages.possible, 2);
  assert.equal(c.stages.leftout, 1);
  assert.equal(c.stages.all, 6);
});

test("new scoring rules rescore what the search already found; the old setup's own scores stay", () => {
  const db = setup();
  keepItems(db, "s1", [item()], { title: { want: ["nothing"] } }, NOW);
  db.prepare(
    `INSERT INTO listings (id, search, source, link, dedupe, status, starred, found, updated, score, match, data, kind)
     VALUES ('old', 's1', 'made-up', 'https://example.com/old', 'old|row', 'new', NULL, '2026-11-01', '2026-11-01', 61, 'good', '{"title":"Keeper"}', 'jobs')`,
  ).run();
  const before = listListings(db).find((r) => r.id !== "old")?.score ?? 0;
  const moved = rescoreSearch(db, "s1", scoring, "jobs", NOW);
  assert.equal(moved, 1); // only the listing kestrel scored
  const after = listListings(db).find((r) => r.id !== "old")?.score ?? 0;
  assert.ok(after > before, `${after} > ${before}`);
  assert.equal(listListings(db).find((r) => r.id === "old")?.score, 61);
});

test("left to do: a review view hides a job with an application of any state; All and a status view show their own", () => {
  const base = mkdtempSync(join(tmpdir(), "kestrel-todo-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  keepItems(
    db,
    "made-up",
    [item(), item({ url: "https://example.com/job/2", title: "Head Keeper Two" })],
    scoring,
    NOW,
    200,
    "jobs",
    { hunt: "", category: "" },
  );
  const [tried] = listListings(db, { stage: "review" }).filter((l) => l.link.endsWith("/2"));
  db.prepare(
    "INSERT INTO applications (id, listing, link, title, org, state, reason, agent, started, updated) VALUES ('a1', ?, ?, 'x', 'y', 'not-sent', 'stopped', 'hunt', ?, ?)",
  ).run(tried.id, tried.link, NOW.toISOString(), NOW.toISOString());
  assert.equal(listListings(db, { stage: "review" }).length, 2);
  assert.deepEqual(
    listListings(db, { stage: "review", todo: true }).map((l) => l.link),
    ["https://example.com/job/1"],
  );
  assert.equal(listingCounts(db, { stage: "review", todo: true }).stages.review, 1);
  // Not applied yet never narrows All, its list or its count
  assert.equal(listListings(db, { stage: "all", todo: true }).length, 2);
  assert.equal(listingCounts(db, { stage: "all", todo: true }).stages.all, 2);
  setListingStatus(db, tried.id, "interested");
  assert.equal(listListings(db, { stage: "interested", todo: true }).length, 1); // its own status view keeps it
});

test("a deleted listing leaves every view and count, no run brings it back, and it comes back whole", () => {
  const db = setup();
  keepItems(
    db,
    "s1",
    [item(), item({ url: "https://example.com/2", title: "Wax Lead", org: "Other Co" })],
    scoring,
    NOW,
  );
  const [a, b] = listListings(db, {}, 10);
  setListingStar(db, a.id, 1);
  const was = getListing(db, a.id);
  assert.deepEqual(deleteListings(db, [a.id, "nope"], "me", NOW), [a.id]);
  assert.deepEqual(
    listListings(db).map((r) => r.id),
    [b.id],
  );
  assert.equal(listingCounts(db, {}).all, 1);
  assert.equal(listingCounts(db, {}).priority, 0);
  assert.equal(listHunts(db)[0].count, 1);
  assert.doesNotMatch(morningBrief(db, NOW).join(" "), /Priority list holds/); // Home's brief counts it no more
  // a run that finds it again, under its link or reposted under a new one, never lands it
  assert.equal(keepItems(db, "s1", [item()], scoring, NOW).kept, 0);
  assert.equal(keepItems(db, "s1", [item({ url: "https://example.com/repost" })], scoring, NOW).kept, 0);
  assert.equal(listingCounts(db, {}).all, 1);
  // its tombstone holds it as it was; back, it is the same listing, star and all
  assert.equal(getDeletedListing(db, a.id)?.deleted.by, "me");
  assert.deepEqual(restoreListings(db, [a.id]), { back: [a.id], stayed: [] });
  assert.deepEqual(getListing(db, a.id), was);
  assert.equal(getDeletedListing(db, a.id), null);
  // one the old setup deleted comes back as mine, so its delete doesn't reach it again
  deleteListings(db, [b.id], "old", NOW);
  restoreListings(db, [b.id], NOW);
  assert.equal(getListing(db, b.id)?.mine.deleted, NOW.toISOString());
});

test("my stage, star and note are my marks, each with when I made it", () => {
  const db = setup();
  keepItems(db, "s1", [item()], scoring, NOW);
  const [a] = listListings(db);
  assert.deepEqual(a.mine, {});
  setListingStatus(db, a.id, "passed");
  setListingStar(db, a.id, 0);
  assert.deepEqual(Object.keys(getListing(db, a.id)?.mine ?? {}).sort(), ["starred", "status"]);
});
