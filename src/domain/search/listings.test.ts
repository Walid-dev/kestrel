// Dedupe never double-lists (a fresh run after an import included), Priority follows its rule, filters combine.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../../db/migrate.ts";
import type { Item } from "./collect.ts";
import { isPriority, keepItems, listListings, normalizeDedupe, setListingStar, setListingStatus } from "./listings.ts";

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
