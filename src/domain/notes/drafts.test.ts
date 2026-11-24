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
import { finished } from "../../platform/activity.ts";
import type { Settings } from "../../platform/config.ts";
import { addUpload } from "./documents.ts";
import { discardDraft, draftFor, getDraft, startDraft, usualMs } from "./drafts.ts";
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
  voice: { url: "http://127.0.0.1:1", name: "made-up" },
  profile: {},
  omlxHome: "",
  apply: { folder: "", skill: "", pdf: "", check: "" },
  links: [],
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

test("a draft being made says how far it is; one left 'making' by a restart fails instead of waiting for ever", async () => {
  const db = setup();
  const doc = addUpload(db, "a.md", "Alpha beta gamma.");
  addNote(db, doc.id, { text: "shorter", quote: "" });
  addNote(db, doc.id, { text: "plainer", quote: "beta" });
  const answer = JSON.stringify({ overview: "a.md: nothing.", changes: [], unanswered: [] });
  const s = await startStandIn(() => ({ content: answer, delayMs: 200 }));
  const first = startDraft(db, settings(s.url), { documentIds: [doc.id], speed: "fast" });
  const making = getDraft(db, first.id);
  assert.deepEqual([making?.notes, making?.step, making?.written, making?.usualMs], [2, "reading", 0, null]);
  await first.done;
  assert.equal(getDraft(db, first.id)?.step, null); // ready: nothing in progress
  // Live heard both steps: the reading, then the writing once the answer's first words came
  assert.deepEqual(
    finished()[0]?.steps.map((st) => st.text),
    ["fast-model reads 2 notes", "fast-model writes the changes"],
  );
  // what the model usually takes is known from its second good answer on
  discardDraft(db, first.id);
  await startDraft(db, settings(s.url), { documentIds: [doc.id], speed: "fast" }).done;
  await s.close();
  assert.ok((usualMs(db, "fast-model") ?? 0) >= 200);
  assert.equal(usualMs(db, "careful-model"), null);
  // a draft row still 'making' that no running call holds: kestrel restarted while the model worked
  db.prepare(
    "INSERT INTO drafts (id, created_at, status, model, request) VALUES ('lost', '2026-01-01T00:00:00Z', 'making', 'fast-model', ?)",
  ).run(JSON.stringify({ documents: [{ id: doc.id, name: "a.md", sha256: "x" }], notes: [] }));
  const lost = getDraft(db, "lost");
  assert.equal(lost?.status, "failed");
  assert.match(lost?.error ?? "", /restarted/);
  assert.equal(getDraft(db, "lost")?.status, "failed"); // and it stays so
});

test("a draft left 'making' by a restart on one document never blocks an ask on another", async () => {
  const db = setup();
  const a = addUpload(db, "a.md", "Alpha beta gamma.");
  const b = addUpload(db, "b.md", "Delta epsilon.");
  addNote(db, b.id, { text: "shorter", quote: "" });
  // nothing reads a.md's draft before the ask on b.md: the ask itself sets it failed
  db.prepare(
    "INSERT INTO drafts (id, created_at, status, model, request) VALUES ('lost', '2026-01-01T00:00:00Z', 'making', 'fast-model', ?)",
  ).run(JSON.stringify({ documents: [{ id: a.id, name: "a.md", sha256: "x" }], notes: [] }));
  const answer = JSON.stringify({ overview: "b.md: nothing.", changes: [], unanswered: [] });
  const s = await startStandIn(() => ({ content: answer }));
  const made = startDraft(db, settings(s.url), { documentIds: [b.id], speed: "fast" });
  await made.done;
  await s.close();
  assert.equal(getDraft(db, made.id)?.status, "ready");
  assert.match(getDraft(db, "lost")?.error ?? "", /restarted/);
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

test("a set of two: one ask, each document saves on its own, the draft leaves after the last", async () => {
  const db = setup();
  const a = addUpload(db, "a.md", "Alpha line one.");
  const b = addUpload(db, "b.md", "Beta line one.");
  const na = addNote(db, a.id, { text: "two", quote: "one" });
  const nb = addNote(db, b.id, { text: "two", quote: "one" });
  const s = await startStandIn(() => ({
    content: JSON.stringify({
      overview: "a.md and b.md: one each.",
      changes: [
        { document: "a.md", find: "one", replace: "two", notes: [na.id] },
        { document: "b.md", find: "one", replace: "two", notes: [nb.id] },
      ],
      unanswered: [],
    }),
  }));
  const made = startDraft(db, settings(s.url), { documentIds: [a.id, b.id], speed: "careful" });
  await made.done;
  await s.close();
  const { saveDraft } = await import("./save.ts");
  saveDraft(db, made.id, a.id);
  const half = getDraft(db, made.id);
  assert.equal(half?.perDocument[a.id].savedAt !== undefined, true);
  assert.equal(half?.perDocument[b.id].savedAt, undefined);
  saveDraft(db, made.id, b.id);
  assert.equal(getDraft(db, made.id), null);
});

test("two files with the same name never receive each other's changes (R2-3)", async () => {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const base = mkdtempSync(join(tmpdir(), "kestrel-samename-"));
  const one = join(base, "one");
  const two = join(base, "two");
  mkdirSync(one);
  mkdirSync(two);
  writeFileSync(join(one, "plan.md"), "Alpha line.");
  writeFileSync(join(two, "plan.md"), "Beta line.");
  const db = setup();
  const { openFile } = await import("./documents.ts");
  const makeSettings = (url: string): Settings => ({ ...settings(url), notes: { folders: [one, two] } });
  const a = openFile(db, makeSettings("http://127.0.0.1:1/v1"), join(one, "plan.md"));
  const b = openFile(db, makeSettings("http://127.0.0.1:1/v1"), join(two, "plan.md"));
  const na = addNote(db, a.id, { text: "alpha to A", quote: "Alpha" });
  addNote(db, b.id, { text: "nothing here is asked", quote: "" });
  const s = await startStandIn((body) => {
    // the stand-in answers with the labels the prompt carries: the full paths
    const asked = body.messages.map((m) => m.content).join("\n");
    const labelA = asked.match(/DOCUMENT (\S*one\S*plan\.md):/)?.[1] ?? "plan.md";
    return {
      content: JSON.stringify({
        overview: "both plan.md files looked at; only the first changes.",
        changes: [{ document: labelA, find: "Alpha", replace: "A", notes: [na.id] }],
        unanswered: [],
      }),
    };
  });
  const made = startDraft(db, makeSettings(s.url), { documentIds: [a.id, b.id], speed: "careful" });
  await made.done;
  await s.close();
  const ready = getDraft(db, made.id);
  assert.equal(ready?.status, "ready");
  assert.equal(ready?.perDocument[a.id].placed.length, 1);
  assert.equal(ready?.perDocument[b.id].placed.length, 0); // the same words in the other plan.md stay untouched
  assert.equal(ready?.perDocument[b.id].newText, "Beta line.");
});

test("an invented note id places nothing, and a forgotten note is named, never dropped (R2-2)", async () => {
  const db = setup();
  const doc = addUpload(db, "a.md", "Alpha line. Beta line.");
  const real = addNote(db, doc.id, { text: "alpha to A", quote: "Alpha" });
  const forgotten = addNote(db, doc.id, { text: "beta deserves a say", quote: "Beta" });
  const s = await startStandIn(() => ({
    content: JSON.stringify({
      overview: "a.md: changes.",
      changes: [
        { document: "a.md", find: "Alpha", replace: "A", notes: [real.id] },
        { document: "a.md", find: "line.", replace: "row.", notes: ["made-up-note-id"] },
      ],
      unanswered: [],
    }),
  }));
  const made = startDraft(db, settings(s.url), { documentIds: [doc.id], speed: "careful" });
  await made.done;
  await s.close();
  const ready = getDraft(db, made.id);
  assert.equal(ready?.perDocument[doc.id].placed.length, 1); // only the asked-for change
  assert.ok(ready?.perDocument[doc.id].leftOut.some((l) => l.reason.includes("no open note")));
  assert.ok(ready?.unanswered.some((u) => u.note === forgotten.id && u.reason.includes("left unhandled")));
});
