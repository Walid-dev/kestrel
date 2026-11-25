// The quiz's doors: a start narrowed to picked lessons, refused when a pick is outside the topic or the count out of
// range; archive, the archived list, restore and delete; an explanation asked while the model door is down. Made-up
// lessons only; no model is asked (the down door is a closed port on this computer).
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { Hono } from "hono";
import { migrate } from "../db/migrate.ts";
import { addLesson, addPack, setPackGroup } from "../domain/learn/lessons.ts";
import type { Settings } from "../platform/config.ts";
import { mountLearn } from "./learn.ts";

function setup(settings = {} as Settings) {
  const base = mkdtempSync(join(tmpdir(), "kestrel-quizapi-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  const pack = addPack(db, "Teapots", "lesson-pack", "pack:teapots");
  setPackGroup(db, pack, "Kitchen");
  for (const id of ["spout", "lid", "handle"])
    addLesson(db, pack, `About ${id}`, { say: [`${id}.`], check: [{ q: `What is a ${id}?`, a: "A part." }] }, 0, id);
  const app = new Hono();
  mountLearn(app, db, settings); // only the down door's test reaches for a model, at an address where none answers
  return app;
}
const send = (app: Hono, path: string, method = "POST", body?: unknown) =>
  app.request(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
type Listed = { quizzes: { id: string; archived: string | null }[] };

test("a quiz on picked lessons draws only from them; a pick outside the topic is refused", async () => {
  const app = setup();
  const res = await send(app, "/api/learn/quizzes", "POST", { group: "Kitchen", lessons: ["spout", "lid"], count: 10 });
  assert.equal(res.status, 200);
  const { quiz } = (await res.json()) as { quiz: { items: { lesson: string }[]; scope: string } };
  assert.deepEqual(quiz.items.map((i) => i.lesson).sort(), ["lid", "spout"]);
  assert.equal(quiz.scope, "About spout + About lid");
  const outside = await send(app, "/api/learn/quizzes", "POST", { group: "Garden", lessons: ["spout"] });
  assert.equal(outside.status, 400);
  assert.match(((await outside.json()) as { error: string }).error, /isn't in this topic/);
  assert.equal((await send(app, "/api/learn/quizzes", "POST", { lessons: "spout" })).status, 400);
  assert.equal((await send(app, "/api/learn/quizzes", "POST", { count: 31 })).status, 400);
  const pills = (await (await app.request("/api/learn/quiz/lessons?area=learn")).json()) as { lessons: unknown[] };
  assert.equal(pills.lessons.length, 3);
});

test("archive, the archived list, restore and delete", async () => {
  const app = setup();
  const { quiz } = (await (await send(app, "/api/learn/quizzes", "POST", { count: 2 })).json()) as {
    quiz: { id: string };
  };
  const list = async (archived = "") =>
    ((await (await app.request(`/api/learn/quizzes${archived}`)).json()) as Listed).quizzes.map((q) => q.id);
  assert.equal((await send(app, `/api/learn/quizzes/${quiz.id}/archive`)).status, 200);
  assert.deepEqual(await list(), []);
  assert.deepEqual(await list("?archived=1"), [quiz.id]);
  assert.equal((await app.request("/api/learn/quizzes?archived=yes")).status, 400);
  assert.equal((await send(app, `/api/learn/quizzes/${quiz.id}/restore`)).status, 200);
  assert.deepEqual(await list(), [quiz.id]);
  assert.equal((await send(app, `/api/learn/quizzes/${quiz.id}`, "DELETE")).status, 200);
  assert.deepEqual(await list(), []);
  assert.equal((await send(app, `/api/learn/quizzes/${quiz.id}/archive`)).status, 400);
});

test("an explanation asked while the model door is down answers 503, a bad request still 400", async () => {
  const models = { url: "http://127.0.0.1:1", careful: "made-up-model", fast: "made-up-model", contextChars: 100_000 };
  const app = setup({ models } as Settings);
  const body = { lesson: "spout", question: "What is a spout?", expected: "A part." };
  const down = await send(app, "/api/learn/quiz/explain", "POST", body);
  assert.equal(down.status, 503);
  // in plain words, never the client's own: "down" and its detail stay in the calls log
  assert.equal(((await down.json()) as { error: string }).error, "The computer's model isn't answering: is oMLX open?");
  assert.equal((await send(app, "/api/learn/quiz/explain", "POST", { ...body, lesson: "kettle" })).status, 400);
});
