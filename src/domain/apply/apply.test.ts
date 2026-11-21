// The state table: every lawful move, every unlawful one refused with the reason; one open application per link.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../../db/migrate.ts";
import { claimNext, listApplications, queueApplication, reportApplication, retryApplication } from "./apply.ts";

function setup() {
  const base = mkdtempSync(join(tmpdir(), "kestrel-apply-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  return db;
}

test("queue, claim, report sent: the whole lawful road, and the listing follows", () => {
  const db = setup();
  db.prepare(
    `INSERT INTO listings (id, search, source, link, dedupe, status, starred, found, updated, score, match, data)
     VALUES ('l1', 's1', 'made-up-board', 'https://example.com/1', 'made co|engineer', 'new', NULL, '2026-11-21', '2026-11-21', 80, 'great', ?)`,
  ).run(JSON.stringify({ title: "Senior Engineer", company: "Made-up Co" }));
  const q = queueApplication(db, { listing: "l1" });
  assert.equal(q.state, "queued");
  assert.equal(q.title, "Senior Engineer");
  const claimed = claimNext(db, "made-up-agent");
  assert.equal(claimed?.id, q.id);
  assert.equal(claimed?.state, "applying");
  const sent = reportApplication(db, q.id, "sent");
  assert.equal(sent.state, "sent");
  const listing = db.prepare("SELECT status FROM listings WHERE id = 'l1'").get() as { status: string };
  assert.equal(listing.status, "applied");
});

test("no job gets two: an open application blocks a second queue for the same link", () => {
  const db = setup();
  queueApplication(db, { link: "https://example.com/2" });
  assert.throws(() => queueApplication(db, { link: "https://example.com/2" }), /no job gets two/);
  const a = listApplications(db);
  assert.equal(a.counts.queued, 1);
});

test("not-sent and needs-me always say why; unlawful moves are refused; Retry requeues", () => {
  const db = setup();
  const q = queueApplication(db, { link: "https://example.com/3" });
  claimNext(db, "made-up-agent");
  assert.throws(() => reportApplication(db, q.id, "not-sent"), /always says why/);
  assert.throws(() => reportApplication(db, q.id, "queued"), /cannot become/);
  const parked = reportApplication(db, q.id, "needs-me", "a human check the phone cannot do");
  assert.equal(parked.state, "needs-me");
  const failed = reportApplication(db, q.id, "not-sent", "the form closed");
  assert.equal(failed.state, "not-sent");
  const retried = retryApplication(db, q.id);
  assert.equal(retried.state, "queued");
  assert.throws(() => reportApplication(db, q.id, "sent"), /cannot become/); // queued never jumps straight to sent
});
