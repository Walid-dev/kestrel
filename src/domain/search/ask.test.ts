// A change to many on Searches' Ask is one rule, resolved by kestrel when its card is proposed: what it covers (pay
// below a line, hourly pay counted as a year, no stated pay never; a stage; the set-aside ones, my applications and
// my stars left out and said), its words and its cap; my tap changes exactly those listings, skipping one changed
// since; Undo puts each back. A single delete joins the single cards. Made-up hunts only.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { startStandIn } from "../../ai/stand-in.ts";
import { migrate } from "../../db/migrate.ts";
import type { Settings } from "../../platform/config.ts";
import { queueApplication } from "../apply/apply.ts";
import { actOn, askPage, conversation, type Proposal, undoOn } from "../ask/ask.ts";
import { describeAction, findListings, searchPage } from "./ask.ts";
import { getListing, keepItems, listingCounts, restoreListings, setListingStatus } from "./listings.ts";

const settings = (url: string): Settings => ({
  tailscaleLogin: "made-up",
  notes: { folders: [] },
  models: { url, careful: "careful-model", fast: "fast-model", contextChars: 100_000 },
  voice: { url: "http://127.0.0.1:1", name: "made-up" },
  profile: {},
  omlxHome: "",
  apply: { folder: "", skill: "", pdf: "", check: "" },
  links: [],
});

// a made-up job hunt of ten, best first: each one a case for the rule "under $130k a year"
function setup() {
  const base = mkdtempSync(join(tmpdir(), "kestrel-search-ask-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  const put = db.prepare(
    `INSERT INTO listings (id, search, source, link, dedupe, status, starred, found, updated, score, match, data, kind)
     VALUES (?, 'beekeeping', 'made-up-board', ?, ?, ?, ?, '2026-11-20T00:00:00Z', '2026-11-20T00:00:00Z', ?, 'good', ?,
       'jobs')`,
  );
  const job = (
    id: string,
    score: number,
    data: Record<string, unknown>,
    status = "new",
    starred: number | null = null,
  ) => put.run(id, `https://example.com/${id}`, id, status, starred, score, JSON.stringify(data));
  job("j1", 99, { title: "Head Keeper", org: "Hive Co", location: "Hiveton", salaryMax: 90000 });
  job("j2", 98, { title: "Remote Keeper", org: "Comb Ltd", location: "Remote", salaryMin: 120000, salaryMax: 160000 });
  job("j3", 97, { title: "Wax Lead", org: "Comb Ltd", location: "Remote", salaryMax: 70000 });
  job("j4", 96, { title: "Hourly Smoker", org: "Drone Works", salaryMax: 50, salaryPeriod: "hour" }); // 104,000 a year
  job("j5", 95, { title: "Apiary Intern", org: "Hive Co" }); // no pay stated
  job("j6", 94, { title: "Frame Builder", org: "Far Co", salaryMax: 100000, leftOut: "not open in Hiveton" });
  job("j7", 93, { title: "Queen Breeder", org: "Royal Co", salaryMax: 95000 }, "applied");
  job("j8", 92, { title: "Pollen Analyst", org: "Meadow Labs", salaryMax: 80000 }, "new", 1);
  job("j9", 91, { title: "Hive Inspector", org: "Hive Co", salaryMax: 110000 }, "passed");
  job("j10", 90, { title: "Nectar Taster", org: "Bloom Co", salaryMax: 60000 });
  queueApplication(db, { listing: "j10" }); // in the queue: left out as mine
  return db;
}
const propose = (db: DatabaseSync, action: unknown, ref = "jobs:beekeeping") =>
  describeAction(db, ref, action) as Proposal;
const ids = (p: Proposal) => (p.items ?? []).map((i) => i.id);

test("a rule covers pay below its line, hourly pay as a year, never a job with no pay, and says what it leaves out", () => {
  const db = setup();
  const del = propose(db, { do: "delete", where: { payBelow: 130000 } });
  assert.equal(del.label, "Delete 4 jobs whose top pay is under $130k a year");
  assert.deepEqual(ids(del), ["j1", "j3", "j4", "j9"]); // the hourly one too; Remote Keeper's top is 160k
  assert.equal(
    del.detail,
    "1 states no pay · 1 set aside by the rules · 2 applied to or in the queue · 1 starred: not included.",
  );
  assert.equal(del.items?.[0].title, "Head Keeper at Hive Co");
  // a stage change: the ones already there are said, and a remote rule reads remote
  const pass = propose(db, { do: "stage", to: "passed", where: { payBelow: 130000 } });
  assert.equal(pass.label, "Mark 3 jobs whose top pay is under $130k a year as Not for me");
  assert.match(pass.detail ?? "", /^1 already Not for me · 1 states no pay/);
  const remote = propose(db, { do: "stage", to: "passed", where: { remote: true, payBelow: 100000 } });
  assert.equal(remote.label, "Mark 1 remote job whose top pay is under $100k a year as Not for me");
  assert.deepEqual(ids(remote), ["j3"]);
  // a stage names what it covers: the set-aside ones on purpose, a status, my applications when it names theirs
  assert.deepEqual(ids(propose(db, { do: "delete", where: { stage: "leftout" } })), ["j6"]);
  assert.deepEqual(ids(propose(db, { do: "delete", where: { stage: "passed" } })), ["j9"]);
  assert.deepEqual(ids(propose(db, { do: "delete", where: { stage: "applied" } })), ["j7"]);
  assert.deepEqual(ids(propose(db, { do: "delete", where: { stage: "priority" } })), ["j8"]); // starred, asked for
  // find reads the same fields (payBelow, remote false), and leaves nothing out but the set-aside ones
  assert.match(findListings(db, "jobs:beekeeping", { payBelow: 100000, remote: false }), /^4 matches:/);
});

test("a rule it can't read, or one that covers nothing, says so on its card; a deal rule reads prices", () => {
  const db = setup();
  assert.deepEqual(propose(db, { do: "delete", where: { payBelow: "130k" } }), {
    label: "Delete jobs by a rule",
    failed: "The rule's payBelow isn't a value Ask can use. Ask again.",
  });
  assert.equal(propose(db, { do: "delete", where: { limit: 3 } }).failed, "A rule can't use limit. Ask again.");
  // another action by a rule: never titled as a delete
  assert.deepEqual(propose(db, { do: "apply", where: { payBelow: 1 } }), {
    label: "Change jobs by a rule",
    failed: "Ask changes many at once only by a stage or a delete. Ask again.",
  });
  // a rule with no field covers the whole hunt, and its card says so
  assert.match(propose(db, { do: "delete", where: {} }).detail ?? "", /^Every job of this hunt\. /);
  const none = propose(db, { do: "delete", where: { words: "royal jelly" } });
  assert.equal(none.failed, "Nothing to change.");
  assert.equal(none.label, "Delete jobs mentioning “royal jelly”");
  // a deal hunt: a price at or over its line, never one with no price
  const put = db.prepare(
    `INSERT INTO listings (id, search, source, link, dedupe, status, found, updated, score, match, data, kind)
     VALUES (?, 'made-up-chairs', 'made-up-market', ?, ?, 'new', '2026-11-20', '2026-11-20', ?, 'good', ?, 'deals')`,
  );
  for (const [id, score, price] of [
    ["d1", 80, 650],
    ["d2", 70, 1250],
    ["d3", 60, 120],
    ["d4", 50, null],
  ] as const)
    put.run(id, `https://example.com/${id}`, `https://example.com/${id}`, score, JSON.stringify({ title: id, price }));
  const deals = propose(db, { do: "delete", where: { priceAtLeast: 601 } }, "deals:made-up-chairs");
  assert.equal(deals.label, "Delete 2 deals priced $601 or more");
  assert.deepEqual(ids(deals), ["d1", "d2"]);
  assert.equal(deals.detail, "1 shows no price: not included.");
});

test("my tap deletes exactly the listings proposed, skips one changed since, and Undo brings each back", async () => {
  const db = setup();
  const s = await startStandIn(() => ({
    content: 'Tap to delete them.\n```action\n{"do": "delete", "where": {"payBelow": 130000}}\n```',
  }));
  await askPage(db, settings(s.url), { app: "searches", ref: "jobs:beekeeping", text: "Delete all under 130k" }).done;
  await s.close();
  const answer = conversation(db, "searches", "jobs:beekeeping")[1];
  assert.deepEqual(
    answer.cards.map((c) => [c.label, c.state, c.items?.length, c.undoable]),
    [["Delete 4 jobs whose top pay is under $130k a year", "open", 4, false]],
  );
  // since: I mark one in its sheet, and a run lands a new one under the line, which the card never covered
  setListingStatus(db, "j3", "interested");
  keepItems(
    db,
    "beekeeping",
    [{ ...item, url: "https://example.com/new", title: "New Keeper", salaryMax: 50000 }],
    {},
    new Date("2026-11-21T00:00:00Z"),
  );
  const all = listingCounts(db, { kind: "jobs", hunt: "beekeeping" }).all;
  const after = actOn(db, settings(s.url), { id: answer.id, card: 0 })[1].cards[0];
  assert.equal(after.state, "done");
  assert.equal(after.result, "Deleted 3 jobs. 1 changed since: left as it is.");
  assert.equal(after.undoable, true);
  assert.deepEqual(
    ["j1", "j3", "j4", "j9"].map((id) => getListing(db, id)?.status ?? "gone"),
    ["gone", "interested", "gone", "gone"],
  );
  // gone from every count, find and Ask's page; the new one and the one changed since stay
  assert.equal(listingCounts(db, { kind: "jobs", hunt: "beekeeping" }).all, all - 3);
  assert.doesNotMatch(findListings(db, "jobs:beekeeping", { words: "keeper", stage: "all" }), /Head Keeper/);
  assert.doesNotMatch(searchPage(db, "jobs:beekeeping")?.context ?? "", /j1:|j4:|j9:/);
  // Undo: each one back as it was, once; one brought back from its sheet meanwhile counts as back
  restoreListings(db, ["j9"]);
  const undone = undoOn(db, { id: answer.id, card: 0 })[1].cards[0];
  assert.deepEqual([undone.state, undone.result, undone.undoable], ["undone", "Undone: 3 back.", false]);
  assert.deepEqual(
    ["j1", "j4", "j9"].map((id) => getListing(db, id)?.status),
    ["new", "new", "passed"],
  );
  assert.equal(listingCounts(db, { kind: "jobs", hunt: "beekeeping" }).all, all);
  assert.throws(() => undoOn(db, { id: answer.id, card: 0 }), /can't be undone/);
});

test("a stage for many is my mark on each; Undo puts back each stage and its mark, unless it moved since", async () => {
  const db = setup();
  setListingStatus(db, "j3", "maybe"); // marked before: its mark comes back with it
  const s = await startStandIn(() => ({
    content: 'Tap to pass on them.\n```action\n{"do": "stage", "to": "passed", "where": {"payBelow": 100000}}\n```',
  }));
  await askPage(db, settings(s.url), { app: "searches", ref: "jobs:beekeeping", text: "Pass on all under 100k" }).done;
  await s.close();
  const answer = conversation(db, "searches", "jobs:beekeeping")[1];
  const before = getListing(db, "j3")?.mine.status;
  assert.equal(
    actOn(db, settings(s.url), { id: answer.id, card: 0 })[1].cards[0].result,
    "Marked 2 jobs as Not for me.",
  );
  assert.deepEqual(
    ["j1", "j3"].map((id) => [getListing(db, id)?.status, Boolean(getListing(db, id)?.mine.status)]),
    [
      ["passed", true],
      ["passed", true],
    ],
  );
  setListingStatus(db, "j1", "interested"); // moved since my tap: Undo leaves it
  assert.equal(
    undoOn(db, { id: answer.id, card: 0 })[1].cards[0].result,
    "Undone: 1 back to its stage. 1 moved since: left as it is.",
  );
  assert.deepEqual([getListing(db, "j3")?.status, getListing(db, "j3")?.mine.status], ["maybe", before]);
  assert.equal(getListing(db, "j1")?.status, "interested");
});

test("a single delete is a card of its own, with Undo", async () => {
  const db = setup();
  const s = await startStandIn(() => ({
    content: 'Tap to delete it.\n```action\n{"do": "delete", "listing": "j2"}\n```',
  }));
  await askPage(db, settings(s.url), { app: "searches", ref: "jobs:beekeeping", text: "Delete Remote Keeper" }).done;
  await s.close();
  const answer = conversation(db, "searches", "jobs:beekeeping")[1];
  assert.equal(answer.cards[0].label, "Delete “Remote Keeper at Comb Ltd”");
  assert.equal(actOn(db, settings(s.url), { id: answer.id, card: 0 })[1].cards[0].result, "Deleted.");
  assert.equal(getListing(db, "j2"), null);
  assert.equal(undoOn(db, { id: answer.id, card: 0 })[1].cards[0].result, "Undone: it's back.");
  assert.equal(getListing(db, "j2")?.status, "new");
});

test("a card covers 500 listings at most, the best first, and says when the rule finds more", () => {
  const db = setup();
  const put = db.prepare(
    `INSERT INTO listings (id, search, source, link, dedupe, status, found, updated, score, match, data, kind)
     VALUES (?, 'big', 'made-up-board', ?, ?, 'new', '2026-11-20', '2026-11-20', ?, 'good', ?, 'jobs')`,
  );
  for (let i = 0; i < 510; i++)
    put.run(
      `b${i}`,
      `https://example.com/b${i}`,
      `b${i}`,
      1000 - i,
      JSON.stringify({ title: `Keeper ${i}`, salaryMax: 50000 }),
    );
  const p = propose(db, { do: "delete", where: { payBelow: 100000 } }, "jobs:big");
  assert.equal(p.label, "Delete 500 jobs whose top pay is under $100k a year");
  assert.equal(p.items?.length, 500);
  assert.equal(p.items?.at(-1)?.id, "b499");
  assert.equal(p.detail, "The rule finds 510: this card covers the best 500. Ask again for the rest.");
});

const item = {
  source: "made-up-board",
  url: "https://example.com/x",
  title: "Keeper",
  org: "Made-up Co",
  location: "Hiveton",
  posted: "2026-11-20",
  workMode: "",
  seniority: "",
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
  salaryPeriod: null,
  usOnly: false,
  excerpt: "",
  price: null,
};
