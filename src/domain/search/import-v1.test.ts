// A failed import closes the old database it opened: the mirror retries, and each try must not leave one more file
// open. A deal the mirror carries keeps its old hunt's key, so Search now can name it there. My marks made here stay
// through every mirror, while the engine's fields refresh and the old setup's own stages still arrive; a job deleted
// there goes here too unless I marked it, and one deleted here never lands again. Made-up old databases.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../../db/migrate.ts";
import { importV1, stageArrives } from "./import-v1.ts";
import {
  deleteListings,
  getDeletedListing,
  getListing,
  listHunts,
  setListingNote,
  setListingStar,
  setListingStatus,
} from "./listings.ts";

test("a failed import leaves no handle to the old database open (review)", () => {
  const base = mkdtempSync(join(tmpdir(), "kestrel-import-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  const old = join(base, "old.db");
  const made = new DatabaseSync(old);
  made.exec("CREATE TABLE something_else (id TEXT)"); // no job_listings: the import fails
  made.close();
  const open = () => readdirSync("/dev/fd").length;
  const before = open();
  for (let i = 0; i < 5; i++) assert.throws(() => importV1(db, old, true), /no such table/);
  assert.equal(open(), before);
});

test("a deal hunt the mirror brings knows its key in the old setup: its hunt: line, lowercased", () => {
  const base = mkdtempSync(join(tmpdir(), "kestrel-import-key-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  const old = join(base, "old.db");
  const made = new DatabaseSync(old);
  made.exec(
    `CREATE TABLE job_listings (id TEXT, hunt TEXT, link TEXT, dedupe_key TEXT, status TEXT, found TEXT, data TEXT);
     CREATE TABLE items (id INTEGER, run_id TEXT, source TEXT, url TEXT, title TEXT, org TEXT, price REAL,
       location TEXT, posted TEXT, first_seen TEXT, last_seen TEXT, score REAL, status TEXT, my_note TEXT, fit REAL,
       fit_reason TEXT, twin_of TEXT);
     CREATE TABLE runs (run_id TEXT, spec TEXT, started TEXT);
     INSERT INTO runs VALUES ('r1', 'made-up-chair-site', '2026-11-20'), ('r2', 'made-up-lamp-site', '2026-11-20');
     INSERT INTO items (id, run_id, source, url, title, price, first_seen) VALUES
       (1, 'r1', 'made-up-market', 'https://example.com/a/1', 'A made-up chair', 90, '2026-11-20'),
       (2, 'r2', 'made-up-market', 'https://example.com/a/2', 'A made-up lamp', 15, '2026-11-20');`,
  );
  made.close();
  // the old specs' heads: the chair search names its hunt, the lamp search only its model
  const specs = join(base, "specs");
  mkdirSync(specs);
  writeFileSync(join(specs, "made-up-chair-site.md"), "kind: deal\nhunt: Made-up Chair\ncategory: Model A\n");
  writeFileSync(join(specs, "made-up-lamp-site.md"), "kind: deal\ncategory: Lamp\n");
  importV1(db, old, true, { specsDir: specs });
  assert.deepEqual(
    listHunts(db).map((h) => [h.key, h.old]),
    [
      ["Made-up Chair", "hunt:made-up chair"],
      ["made-up-lamp-site", null],
    ],
  );
});

test("the old setup's own stages arrive over mine only when they moved there since, and never backwards", () => {
  assert.equal(stageArrives("applied", "passed", "new"), true); // the apply flow sent it after my pass
  assert.equal(stageArrives("applied", "passed", "applied"), false); // my pass came after: it stays
  assert.equal(stageArrives("interviewing", "offer", "applied"), false); // never back from a later one
  assert.equal(stageArrives("offer", "interviewing", "offer"), false); // no move there since: mine stands
  assert.equal(stageArrives("offer", "interviewing", "applied"), true);
  assert.equal(stageArrives("closed", "interested", "new"), true); // its engine closed one still open here
  assert.equal(stageArrives("closed", "passed", "new"), false);
  assert.equal(stageArrives("maybe", "interested", "new"), false); // a stage set by hand there stays theirs
  assert.equal(stageArrives("applied", "new", null), false); // no mirror kept the old one yet: my mark stands
});

test("my marks here stay through the mirror; the engine's fields refresh; deletes follow the rules both ways", () => {
  const base = mkdtempSync(join(tmpdir(), "kestrel-import-marks-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  const from = join(base, "old.db");
  const old = new DatabaseSync(from);
  old.exec(
    `CREATE TABLE job_listings (id TEXT, hunt TEXT, link TEXT, dedupe_key TEXT, status TEXT, found TEXT, data TEXT,
       owner TEXT);
     CREATE TABLE items (id INTEGER, run_id TEXT, source TEXT, url TEXT, title TEXT, org TEXT, price REAL,
       location TEXT, posted TEXT, first_seen TEXT, last_seen TEXT, score REAL, status TEXT, my_note TEXT, fit REAL,
       fit_reason TEXT, twin_of TEXT);
     CREATE TABLE runs (run_id TEXT, spec TEXT, started TEXT);
     INSERT INTO runs VALUES ('r1', 'made-up-chair-site', '2026-11-20');
     INSERT INTO items (id, run_id, source, url, title, price, first_seen, status, my_note) VALUES
       (1, 'r1', 'made-up-market', 'https://example.com/d/1', 'A made-up chair', 90, '2026-11-20', 'new', '');`,
  );
  const put = old.prepare("INSERT INTO job_listings VALUES (?, 'made-up-hunt', ?, ?, ?, '2026-11-20', ?, ?)");
  for (const [id, status] of [
    ["o1", "new"],
    ["o2", "new"],
    ["o3", "new"],
    ["o4", "new"],
    ["o5", "new"],
    ["o6", "new"],
    ["o7", "new"],
    ["o8", "applied"],
    ["o9", "new"],
  ])
    put.run(
      id,
      `https://example.com/${id}`,
      `made co|${id}`,
      status,
      JSON.stringify({ source: "made-up-board", title: `Keeper ${id}`, company: "Made Co", score: 60, match: "good" }),
      "{}",
    );
  importV1(db, from, true);
  // my marks here: a star and a note, stages, a delete
  setListingStar(db, "o2", 1);
  setListingNote(db, "o2", "my own note");
  setListingStatus(db, "o3", "passed");
  setListingStatus(db, "o4", "interested");
  deleteListings(db, ["o5"], "me");
  setListingStar(db, "o7", 1);
  setListingStatus(db, "o8", "rejected");
  setListingStatus(db, "o9", "interested");
  setListingStatus(db, "1", "maybe"); // the deal
  setListingNote(db, "1", "mine too");
  // then the old setup moves on: by hand, by its apply flow, by its engine; and it deletes two
  const set = old.prepare(
    "UPDATE job_listings SET status = ?, data = json_set(data, '$.score', ?), owner = ? WHERE id = ?",
  );
  set.run("maybe", 60, "{}", "o1"); // never marked here: follows
  set.run("new", 90, JSON.stringify({ star: false, myNote: "their note" }), "o2");
  set.run("applied", 60, "{}", "o3"); // the apply flow
  set.run("maybe", 60, "{}", "o4"); // by hand there
  set.run("new", 99, "{}", "o5");
  set.run("new", 60, JSON.stringify({ deleted: true }), "o6");
  set.run("new", 60, JSON.stringify({ deleted: true }), "o7");
  set.run("interviewing", 60, "{}", "o8"); // behind my Rejected
  set.run("closed", 60, "{}", "o9"); // its engine: the posting is gone
  old.prepare("UPDATE items SET status = 'not', my_note = 'their deal note' WHERE id = 1").run();
  old.close();
  const got = importV1(db, from, true);
  const row = (id: string) => getListing(db, id);
  assert.equal(row("o1")?.status, "maybe");
  assert.deepEqual([row("o2")?.starred, row("o2")?.data.note, row("o2")?.score], [1, "my own note", 90]);
  assert.equal(row("o3")?.status, "applied");
  assert.equal(row("o4")?.status, "interested");
  assert.equal(row("o5"), null); // deleted here: never landed again
  assert.equal(getDeletedListing(db, "o5")?.deleted.by, "me");
  assert.equal(row("o6"), null); // deleted there, never marked here: gone here too, and can come back
  assert.equal(getDeletedListing(db, "o6")?.deleted.by, "old");
  assert.equal(got.removed, 1);
  assert.equal(row("o7")?.starred, 1); // deleted there, but starred here: mine to keep
  assert.equal(row("o8")?.status, "rejected");
  assert.equal(row("o9")?.status, "closed");
  assert.deepEqual([row("1")?.status, row("1")?.data.note], ["maybe", "mine too"]); // a deal's marks too
  // and the next mirror, with nothing new there, changes nothing (the three deleted, here or there, aren't counted)
  const again = importV1(db, from, true);
  assert.deepEqual([again.landed, again.removed], [{ new: 0, updated: 0, unchanged: 6 }, 0]);
  assert.deepEqual(again.deals.landed, { new: 0, updated: 0, unchanged: 1 });
});
