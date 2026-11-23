// Ask against the stand-in model: a question on a lesson is kept and its answer lands; the next question carries the
// conversation and the page; one answer at a time; a failure says why; a restart ends a stuck answer; start over
// clears. Made-up lessons only.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { startStandIn } from "../../ai/stand-in.ts";
import { migrate } from "../../db/migrate.ts";
import type { Settings } from "../../platform/config.ts";
import { addLesson, addPack } from "../learn/lessons.ts";
import { Refused } from "../notes/documents.ts";
import { findListings } from "../search/ask.ts";
import { actOn, askPage, clearConversation, conversation, sweepAsks } from "./ask.ts";

function setup() {
  const base = mkdtempSync(join(tmpdir(), "kestrel-ask-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  const pack = addPack(db, "Teapots", "lesson-pack", "pack:teapots");
  addLesson(db, pack, "About spouts", { say: ["A spout pours the tea."] }, 0, "spout");
  addLesson(db, pack, "About lids", { say: ["A lid keeps the heat in."] }, 1, "lid");
  return db;
}
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

test("a question on a lesson is kept, its answer lands, and the next question carries the conversation", async () => {
  const db = setup();
  const seen: { model: string; messages: { content: string }[] }[] = [];
  const s = await startStandIn((body) => {
    seen.push(body);
    return { content: seen.length === 1 ? "A **spout** pours." : "See [About lids](lesson:lid)." };
  });
  const first = askPage(db, settings(s.url), { app: "learn", ref: "spout", text: " What does a spout do? " });
  assert.deepEqual(
    first.messages.map((m) => [m.role, m.state, m.text]),
    [
      ["me", "done", "What does a spout do?"],
      ["model", "writing", ""],
    ],
  );
  await first.done;
  const { state, text, model } = conversation(db, "learn", "spout")[1];
  assert.deepEqual({ state, text, model }, { state: "done", text: "A **spout** pours.", model: "fast-model" });
  await askPage(db, settings(s.url), { app: "learn", ref: "spout", text: "And a lid?" }).done;
  await s.close();
  // the system names the page; the turns so far come back in order, the new question last
  assert.match(seen[1].messages[0].content, /THE OPEN LESSON \(spout\): About spouts/);
  assert.match(seen[1].messages[0].content, /- lid: About lids/);
  assert.deepEqual(
    seen[1].messages.slice(1).map((m) => m.content),
    ["What does a spout do?", "A **spout** pours.", "And a lid?"],
  );
  assert.equal(conversation(db, "learn", "spout").length, 4);
  assert.equal(conversation(db, "learn", "lid").length, 0); // each page its own conversation
});

test("one answer at a time; an unknown app or page is refused; start over clears", async () => {
  const db = setup();
  const s = await startStandIn(() => ({ content: "Pours.", delayMs: 150 }));
  const asked = askPage(db, settings(s.url), { app: "learn", ref: "spout", text: "What does it do?" });
  assert.throws(
    () => askPage(db, settings(s.url), { app: "learn", ref: "spout", text: "Again?" }),
    (e) => e instanceof Refused && /still answering/.test(e.message),
  );
  assert.throws(() => clearConversation(db, "learn", "spout"), /still answering/);
  await asked.done;
  await s.close();
  assert.throws(() => askPage(db, settings(s.url), { app: "garden", ref: "x", text: "Hi" }), /no Ask on garden/);
  assert.throws(() => askPage(db, settings(s.url), { app: "learn", ref: "gone", text: "Hi" }), /isn't there/);
  assert.throws(() => askPage(db, settings(s.url), { app: "learn", ref: "spout", text: "  " }), /ask something/);
  clearConversation(db, "learn", "spout");
  assert.deepEqual(conversation(db, "learn", "spout"), []);
});

test("a failed answer says why; a restart ends an answer left writing", async () => {
  const db = setup();
  const s = await startStandIn(() => ({ status: 503 }));
  await askPage(db, settings(s.url), { app: "learn", ref: "spout", text: "What does it do?" }).done;
  await s.close();
  const failed = conversation(db, "learn", "spout")[1];
  assert.equal(failed.state, "failed");
  assert.match(failed.error, /^down: the model door answered 503/);
  db.prepare(
    "INSERT INTO ask_messages (id, app, ref, role, text, state, at) VALUES ('m9', 'learn', 'lid', 'model', 'Half', 'writing', ?)",
  ).run(new Date().toISOString());
  sweepAsks(db);
  const swept = conversation(db, "learn", "lid")[0];
  assert.equal(swept.state, "failed");
  assert.match(swept.error, /restarted/);
  assert.equal(swept.text, "Half"); // what it had written stays
});

// a made-up job hunt: three listings, one remote and well paid
function hunt(db: DatabaseSync) {
  const add = db.prepare(
    `INSERT INTO listings (id, search, source, link, dedupe, status, found, updated, score, match, data, kind)
     VALUES (?, 'beekeeping', 'made-up-board', ?, ?, 'new', ?, ?, ?, 'great', ?, 'jobs')`,
  );
  const at = "2026-11-20T00:00:00Z";
  add.run(
    "L1",
    "https://example.com/1",
    "a",
    at,
    at,
    90,
    JSON.stringify({ title: "Head Keeper", org: "Hive Co", location: "Hiveton", salaryMax: 90000 }),
  );
  add.run(
    "L2",
    "https://example.com/2",
    "b",
    at,
    at,
    85,
    JSON.stringify({ title: "Remote Keeper", org: "Comb Ltd", location: "Remote", salaryMax: 160000 }),
  );
  add.run(
    "L3",
    "https://example.com/3",
    "c",
    at,
    at,
    80,
    JSON.stringify({ title: "Wax Lead", org: "Comb Ltd", location: "Remote", salaryMax: 70000 }),
  );
}

test("on Searches the model looks through the hunt, answers from what it found, and a change waits for my tap", async () => {
  const db = setup();
  hunt(db);
  assert.match(
    findListings(db, "jobs:beekeeping", { remote: true, payAtLeast: 150000 }),
    /^1 match:\n- L2: Remote Keeper at Comb Ltd/,
  );
  assert.equal(findListings(db, "jobs:beekeeping", { words: "nectar" }), "No listing matches.");
  const seen: { messages: { role: string; content: string }[] }[] = [];
  const s = await startStandIn((body) => {
    seen.push(body as never);
    return {
      content:
        seen.length === 1
          ? 'Let me look.\n```find\n{"remote": true, "payAtLeast": 150000}\n```'
          : 'The remote one is [Remote Keeper](listing:L2), not [Ghost Keeper](listing:L9).\n```action\n{"do": "stage", "listing": "L2", "to": "interested"}\n```\n```action\n{"do": "stage", "listing": "nope", "to": "passed"}\n```',
    };
  });
  await askPage(db, settings(s.url), { app: "searches", ref: "jobs:beekeeping", text: "Find the remote one that pays" })
    .done;
  await s.close();
  assert.equal(seen.length, 2); // one look, then the answer
  assert.match(seen[0].messages[0].content, /- L1: Head Keeper at Hive Co/); // the page shows its best listings
  assert.match(seen[1].messages.at(-1)?.content ?? "", /WHAT YOUR FIND RETURNED[\s\S]*- L2: Remote Keeper/);
  const answer = conversation(db, "searches", "jobs:beekeeping")[1];
  // the blocks are kestrel's, not mine; a link to a listing that isn't there becomes plain words
  assert.equal(answer.text, "The remote one is [Remote Keeper](listing:L2), not Ghost Keeper.");
  assert.deepEqual(
    answer.cards.map((c) => [c.label, c.state]),
    [["Mark “Remote Keeper at Comb Ltd” as Interested", "open"]], // the change on a listing that isn't there is dropped
  );
  assert.equal((db.prepare("SELECT status FROM listings WHERE id = 'L2'").get() as { status: string }).status, "new");
  const after = actOn(db, settings(s.url), { id: answer.id, card: 0 });
  assert.deepEqual(
    after[1].cards.map((c) => c.state),
    ["done"],
  );
  assert.equal(
    (db.prepare("SELECT status FROM listings WHERE id = 'L2'").get() as { status: string }).status,
    "interested",
  );
  assert.throws(() => actOn(db, settings(s.url), { id: answer.id, card: 0 }), /already made/);
});
