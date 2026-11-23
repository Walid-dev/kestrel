// "Due" is one number: Learn's front page, its pack pills, the quiz (the packs' sum), Practice and the brief all count
// the same lessons; and Practice finds an area's lessons however many of the other area come first. Made-up lessons.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { Hono } from "hono";
import { migrate } from "../db/migrate.ts";
import { morningBrief } from "../domain/brief.ts";
import { addLesson, addPack } from "../domain/learn/lessons.ts";
import type { Settings } from "../platform/config.ts";
import { mountLearn } from "./learn.ts";

const CHECK = { check: [{ q: "Where does a burst wait?", a: "In the queue." }] };

function setup() {
  const base = mkdtempSync(join(tmpdir(), "kestrel-due-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  const app = new Hono();
  mountLearn(app, db, {} as Settings);
  const get = async <T>(path: string) => (await (await app.request(path)).json()) as T;
  return { db, get };
}

test("Practice finds Learn's lessons when 20 of Interview prep come first (review)", async () => {
  const { db, get } = setup();
  const interview = addPack(db, "Made-up interview", "answer-pack");
  for (let i = 0; i < 20; i++) addLesson(db, interview, `Made-up question ${i}`, CHECK, i, `iv-${i}`);
  db.prepare("UPDATE lessons SET added_at = '2026-01-01T00:00:00.000Z'").run(); // they come first by date
  const learn = addPack(db, "Made-up queues");
  addLesson(db, learn, "What a queue is", CHECK, 0, "queue");
  const got = await get<{ lessons: { id: string }[] }>("/api/learn/due?area=learn");
  assert.deepEqual(
    got.lessons.map((l) => l.id),
    ["queue"],
  );
});

test("due is one number on the front page, the pack pills, the quiz, Practice and the brief", async () => {
  const { db, get } = setup();
  const now = Date.now();
  const at = (days: number) => new Date(now + days * 86_400_000).toISOString();
  const review = db.prepare("INSERT INTO reviews (lesson, due, interval_days, ease, level) VALUES (?, ?, 1, 2.5, ?)");
  const a = addPack(db, "Made-up queues");
  const b = addPack(db, "Made-up caches");
  addLesson(db, a, "Due a", CHECK, 0, "due-a");
  addLesson(db, a, "Later a", CHECK, 1, "later-a");
  addLesson(db, a, "New a", CHECK, 2, "new-a"); // never graded: new, not due
  addLesson(db, b, "Due b", CHECK, 0, "due-b");
  addLesson(db, b, "Due b too", CHECK, 1, "due-b2");
  review.run("due-a", at(-1), 1);
  review.run("later-a", at(3), 3);
  review.run("due-b", at(-2), 0);
  review.run("due-b2", at(-5), 4);
  const overview = await get<{ summary: { due: number; new: number }; packs: { due: number }[] }>(
    "/api/learn/overview?area=learn",
  );
  const packs = await get<{ packs: { due: number }[] }>("/api/learn/packs?area=learn");
  const practice = await get<{ lessons: { id: string }[]; due: number; new: number }>("/api/learn/due?area=learn");
  const sum = (ps: { due: number }[]) => ps.reduce((n, p) => n + p.due, 0);
  assert.equal(overview.summary.due, 3);
  assert.equal(sum(overview.packs), 3); // the pack pills
  assert.equal(sum(packs.packs), 3); // the quiz adds the packs up
  assert.equal(practice.due, 3);
  assert.equal(practice.new, 1);
  assert.deepEqual(
    practice.lessons.map((l) => l.id),
    ["due-b2", "due-b", "due-a", "new-a"], // the longest waiting first, then the new
  );
  assert.ok(morningBrief(db, new Date(now)).includes("3 lessons are up for review today."));
});
