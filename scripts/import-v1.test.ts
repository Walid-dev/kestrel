// The import is idempotent: a second run lands nothing new, and a status changed in the old database flows in —
// the old setup is the authority until the cutover.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../src/db/migrate.ts";
import { importV1 } from "../src/domain/search/import-v1.ts";

function oldDb(base: string): string {
  const p = join(base, "old.db");
  const db = new DatabaseSync(p);
  db.exec(
    "CREATE TABLE job_listings (id TEXT, hunt TEXT, link TEXT, dedupe_key TEXT, status TEXT, found TEXT, data TEXT)",
  );
  const put = db.prepare("INSERT INTO job_listings VALUES (?, ?, ?, ?, ?, ?, ?)");
  put.run(
    "o1",
    "made-up-hunt",
    "https://example.com/1",
    "made co|engineer",
    "applied",
    "2026-11-01",
    JSON.stringify({
      source: "made-up-board",
      title: "Engineer",
      company: "Made Co",
      score: 61,
      match: "good",
      matchWhy: "fits",
      star: true,
    }),
  );
  put.run(
    "o2",
    "made-up-hunt",
    "https://example.com/2",
    "other co|clerk",
    "passed",
    "2026-11-02",
    JSON.stringify({
      source: "made-up-board",
      title: "Clerk",
      company: "Other Co",
      score: 20,
      match: "poor",
      matchWhy: "",
    }),
  );
  db.exec(
    `CREATE TABLE items (id TEXT, run_id TEXT, kind TEXT, source TEXT, url TEXT, title TEXT, org TEXT,
       price REAL, location TEXT, posted TEXT, first_seen TEXT, last_seen TEXT, score REAL, notes TEXT,
       state TEXT, status TEXT, my_note TEXT, fit TEXT, fit_reason TEXT, twin_of TEXT);
       CREATE TABLE runs (run_id TEXT, spec TEXT, started TEXT);`,
  );
  db.prepare("INSERT INTO runs (run_id, spec, started) VALUES ('r1', 'made-up-chair-site', '2026-11-01')").run();
  const deal = db.prepare(
    `INSERT INTO items (id, run_id, source, url, title, org, price, location, posted, first_seen, last_seen,
       score, status, my_note, fit_reason, twin_of) VALUES (?, 'r1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  deal.run(
    "d1",
    "made-up-market",
    "https://example.com/deal/1",
    "A fine chair",
    "someone",
    120,
    "Hiveton",
    "2026-11-01",
    "2026-11-01",
    "2026-11-02",
    8.5,
    "contacted",
    "asked about the arms",
    "under the cap and near",
    "",
  );
  deal.run(
    "d2",
    "made-up-market",
    "https://example.com/deal/2",
    "A worn chair",
    "",
    700,
    "Elsewhere",
    "2026-10-20",
    "2026-10-20",
    null,
    2,
    "not",
    "",
    "",
    "",
  );
  db.close();
  return p;
}

test("dry run counts without writing; write lands; a second run is all unchanged; a source change flows in", () => {
  const base = mkdtempSync(join(tmpdir(), "kestrel-import-"));
  const file = join(base, "t.db");
  const db = new DatabaseSync(file);
  migrate(db, file);
  const from = oldDb(base);
  const dry = importV1(db, from, false);
  assert.deepEqual(dry.landed, { new: 2, updated: 0, unchanged: 0 });
  assert.deepEqual(dry.kestrel, {}); // a dry run writes nothing
  const wet = importV1(db, from, true);
  assert.deepEqual(wet.landed, { new: 2, updated: 0, unchanged: 0 });
  assert.deepEqual(wet.kestrel, { applied: 2, passed: 2 }); // the fixture now carries two deals too
  const again = importV1(db, from, true);
  assert.deepEqual(again.landed, { new: 0, updated: 0, unchanged: 2 });
  const old = new DatabaseSync(from);
  old.prepare("UPDATE job_listings SET status = 'interviewing' WHERE id = 'o1'").run();
  old.close();
  const synced = importV1(db, from, true);
  assert.deepEqual(synced.landed, { new: 0, updated: 1, unchanged: 1 });
  assert.deepEqual(synced.kestrel, { applied: 1, interviewing: 1, passed: 2 });
  const starred = db.prepare("SELECT starred FROM listings WHERE id = 'o1'").get() as { starred: number };
  assert.equal(starred.starred, 1); // the old star travels
});

test("the old deals carry over: the vocabulary maps, the 0-10 score walks onto the card, reruns stay quiet", () => {
  const base = mkdtempSync(join(tmpdir(), "kestrel-import-deals-"));
  const file = join(base, "t.db");
  const db = new DatabaseSync(file);
  migrate(db, file);
  const from = oldDb(base);
  const wet = importV1(db, from, true);
  assert.deepEqual(wet.deals.landed, { new: 2, updated: 0, unchanged: 0 });
  assert.deepEqual(wet.deals.source, { applied: 1, passed: 1 }); // contacted and not, mapped
  const d1 = db.prepare("SELECT * FROM listings WHERE id = 'd1'").get() as Record<string, unknown>;
  assert.equal(d1.search, "made-up-chair-site");
  assert.equal(d1.status, "applied");
  assert.equal(d1.score, 85);
  assert.equal(d1.match, "great");
  assert.equal(d1.dedupe, "https://example.com/deal/1"); // a deal is its link
  const data = JSON.parse(String(d1.data)) as { price: number; note: string };
  assert.equal(data.price, 120);
  assert.equal(data.note, "asked about the arms");
  const again = importV1(db, from, true);
  assert.deepEqual(again.deals.landed, { new: 0, updated: 0, unchanged: 2 });
});

test("an old database without deal tables simply carries none", () => {
  const base = mkdtempSync(join(tmpdir(), "kestrel-import-nodeals-"));
  const file = join(base, "t.db");
  const db = new DatabaseSync(file);
  migrate(db, file);
  const bare = join(base, "bare.db");
  const o = new DatabaseSync(bare);
  o.exec(
    "CREATE TABLE job_listings (id TEXT, hunt TEXT, link TEXT, dedupe_key TEXT, status TEXT, found TEXT, data TEXT)",
  );
  o.close();
  const got = importV1(db, bare, true);
  assert.deepEqual(got.deals.landed, { new: 0, updated: 0, unchanged: 0 });
});

test("a link shared with another search's row is never clobbered: each hunt keeps its own (sweep)", () => {
  const base = mkdtempSync(join(tmpdir(), "kestrel-import-scope-"));
  const file = join(base, "t.db");
  const db = new DatabaseSync(file);
  migrate(db, file);
  db.prepare(
    `INSERT INTO listings (id, search, source, link, dedupe, status, starred, found, updated, score, match, data)
     VALUES ('mine', 'another-hunt', 'made-up', 'https://example.com/1', 'other co|other role', 'interviewing', 1,
       '2026-10-01', '2026-10-01', 90, 'great', '{}')`,
  ).run();
  const from = oldDb(base);
  const wet = importV1(db, from, true);
  assert.equal(wet.landed.new, 2); // o1 lands as its own row despite the shared link
  const other = db.prepare("SELECT status, starred FROM listings WHERE id = 'mine'").get() as {
    status: string;
    starred: number;
  };
  assert.equal(other.status, "interviewing"); // untouched
  assert.equal(other.starred, 1);
});

test("my own marks travel: the owner column's star, note and application attempts; a removed job stays removed", () => {
  const base = mkdtempSync(join(tmpdir(), "kestrel-import-owner-"));
  const file = join(base, "t.db");
  const db = new DatabaseSync(file);
  migrate(db, file);
  const from = join(base, "owner.db");
  const o = new DatabaseSync(from);
  o.exec(
    "CREATE TABLE job_listings (id TEXT, hunt TEXT, link TEXT, dedupe_key TEXT, status TEXT, found TEXT, data TEXT, owner TEXT)",
  );
  const put = o.prepare("INSERT INTO job_listings VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  const data = (title: string) =>
    JSON.stringify({ source: "made-up-board", title, company: "Made Co", score: 70, match: "good" });
  put.run(
    "a",
    "h",
    "https://example.com/a",
    "made co|keeper",
    "applied",
    "2026-11-01",
    data("Keeper"),
    JSON.stringify({
      star: true,
      myNote: "ask about the smoker",
      apply: { state: "sent", at: "2026-11-02T10:00:00Z", endedAt: "2026-11-02T10:20:00Z", report: {} },
    }),
  );
  put.run(
    "b",
    "h",
    "https://example.com/b",
    "made co|wrangler",
    "new",
    "2026-11-01",
    data("Wrangler"),
    JSON.stringify({
      apply: { state: "unfinished", at: "2026-11-03T10:00:00Z", report: { blocker: "a human check on the form" } },
    }),
  );
  put.run(
    "c",
    "h",
    "https://example.com/c",
    "made co|gone",
    "new",
    "2026-11-01",
    data("Gone"),
    JSON.stringify({ deleted: true }),
  );
  o.exec(
    "CREATE TABLE deep_checks (key TEXT, kind TEXT, state TEXT, started TEXT, finished TEXT, step TEXT, report TEXT, error TEXT)",
  );
  o.prepare("INSERT INTO deep_checks VALUES ('job:a', 'job', 'done', '2026-11-02', '2026-11-02', '', ?, '')").run(
    JSON.stringify({ verdict: "apply", headline: "A made-up fit." }),
  );
  o.close();
  const got = importV1(db, from, true);
  assert.equal(got.landed.new, 2); // the removed one never lands
  assert.equal(got.sourceStarred, 1);
  assert.deepEqual(got.applications, { sent: 1, notSent: 1 });
  assert.equal(got.deepChecks, 1);
  const a = db.prepare("SELECT starred, data FROM listings WHERE id = 'a'").get() as { starred: number; data: string };
  assert.equal(a.starred, 1);
  const ad = JSON.parse(a.data) as { org: string; note: string };
  assert.equal(ad.org, "Made Co"); // the old company is the card's org
  assert.equal(ad.note, "ask about the smoker");
  const apps = db.prepare("SELECT id, state, reason FROM applications ORDER BY id").all() as {
    id: string;
    state: string;
    reason: string;
  }[];
  assert.deepEqual(
    apps.map((x) => [x.id, x.state]),
    [
      ["v1:a", "sent"],
      ["v1:b", "not-sent"],
    ],
  );
  assert.equal(apps[1].reason, "a human check on the form");
  const deep = db.prepare("SELECT listing, state FROM deep_checks").get() as { listing: string; state: string };
  assert.equal(deep.listing, "a");
  assert.equal(deep.state, "done");
  const again = importV1(db, from, true);
  assert.deepEqual(again.landed, { new: 0, updated: 0, unchanged: 2 }); // nothing moves on a second run
});
