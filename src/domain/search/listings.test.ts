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
import type { Scoring } from "./score.ts";

const NOW = new Date("2026-11-21T12:00:00Z");
const scoring: Scoring = {
  title: { want: ["engineer"] },
  skills: ["TypeScript", "React", "AWS", "Node"],
  level: { want: ["senior"] },
  places: { words: ["Toronto"] },
  freshDays: 7,
};
const item = (o: Partial<Item> = {}): Item => ({
  source: "made-up-board",
  url: "https://example.com/job/1",
  title: "Senior Engineer",
  org: "Made-up Co",
  location: "Toronto",
  posted: "2026-11-20",
  workMode: "",
  seniority: "Senior",
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
  usOnly: false,
  excerpt: "TypeScript React AWS Node.",
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
    [item({ url: "https://example.com/job/other", title: "Senior  Engineer!" })],
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
     VALUES ('old-1', 's1', 'made-up-board', 'https://example.com/job/1', 'old|key|senior|gta', 'applied', NULL,
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
  assert.equal(normalizeDedupe("Made-up Co", "Senior  Engineer!"), "madeup co|senior engineer");
});
