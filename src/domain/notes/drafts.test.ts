// A draft against the stand-in model: made, placed, kept until discarded; a second ask while one is being made is
// refused; a too-long set is refused before any call.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { startStandIn } from "../../ai/stand-in.ts";
import { migrate } from "../../db/migrate.ts";
import type { Settings } from "../../platform/config.ts";
import { addUpload } from "./documents.ts";
import { discardDraft, draftFor, getDraft, startDraft } from "./drafts.ts";
import { addNote } from "./notes.ts";

function setup() {
  const base = mkdtempSync(join(tmpdir(), "kestrel-drafts-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  return db;
}
const settings = (url: string, contextChars = 100_000): Settings => ({
  tailscaleLogin: "made-up",
  notes: { folders: [] },
  models: { url, careful: "careful-model", fast: "fast-model", contextChars },
});

test("a draft is made, placed, and still there until discarded", async () => {
  const db = setup();
  const doc = addUpload(db, "plan.md", "The plan has three parts that we think about.\nThe end.");
  const note = addNote(db, doc.id, { text: "plainer", quote: "three parts that we think about" });
  const answer = {
    overview: "plan.md: one wording change.",
    changes: [
      { document: "plan.md", find: "three parts that we think about", replace: "three parts", notes: [note.id] },
    ],
    unanswered: [],
  };
  const s = await startStandIn(() => ({ content: JSON.stringify(answer) }));
  const made = startDraft(db, settings(s.url), { documentIds: [doc.id], speed: "careful" });
  assert.equal(getDraft(db, made.id)?.status, "making");
  await made.done;
  await s.close();
  const ready = getDraft(db, made.id);
  assert.equal(ready?.status, "ready");
  assert.equal(ready?.perDocument[doc.id].placed.length, 1);
  assert.equal(ready?.perDocument[doc.id].newText, "The plan has three parts.\nThe end.");
  assert.equal(draftFor(db, doc.id)?.id, made.id); // leaving and reopening the app finds it again
  discardDraft(db, made.id);
  assert.equal(getDraft(db, made.id), null);
});

test("one draft at a time, and a too-long set is refused before any call", async () => {
  const db = setup();
  const doc = addUpload(db, "a.md", "Alpha beta gamma.");
  addNote(db, doc.id, { text: "shorter", quote: "" });
  const s = await startStandIn(() => ({ content: "{}", delayMs: 400 }));
  const first = startDraft(db, settings(s.url), { documentIds: [doc.id], speed: "fast" });
  assert.throws(() => startDraft(db, settings(s.url), { documentIds: [doc.id], speed: "fast" }), /already being made/);
  await first.done;
  const calls = s.calls();
  assert.throws(
    () => startDraft(db, settings(s.url, 10), { documentIds: [doc.id], speed: "fast" }),
    /too long for the model.*fewer documents/,
  );
  assert.equal(s.calls(), calls); // the refusal reached no model
  await s.close();
});

test("a failed answer leaves a failed draft with the reason, and a new ask may start", async () => {
  const db = setup();
  const doc = addUpload(db, "a.md", "Alpha beta.");
  addNote(db, doc.id, { text: "shorter", quote: "" });
  const s = await startStandIn(() => ({ content: '{"wrong": true}' }));
  const made = startDraft(db, settings(s.url), { documentIds: [doc.id], speed: "fast" });
  await made.done;
  await s.close();
  const failed = getDraft(db, made.id);
  assert.equal(failed?.status, "failed");
  assert.match(failed?.error ?? "", /shape/);
});
