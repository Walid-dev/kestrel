// A bad request answers 400 in plain words on every route, whether a validator reads the body or the route reads it by
// hand; any other failure stays a 500 whose answer and log carry no path. The root is composed as main.ts composes it.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { Hono } from "hono";
import { migrate } from "../db/migrate.ts";
import { answerFailure } from "./errors.ts";
import { mountLive } from "./live.ts";
import { mountTasks } from "./tasks.ts";

test("malformed JSON answers 400, saying so; a crash answers 500 without its path", async (t) => {
  const logged: string[] = [];
  t.mock.method(console, "error", (line: string) => logged.push(line));
  const base = mkdtempSync(join(tmpdir(), "kestrel-errors-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  const app = new Hono();
  mountTasks(app, db); // its new task reads the body through zValidator
  mountLive(app, db, ""); // its Stop reads the body by hand
  app.get("/api/crash", () => {
    throw new Error("unable to open /tmp/made-up-folder/kestrel.db");
  });
  const root = new Hono();
  root.onError(answerFailure);
  root.route("/", app);

  const broken = { method: "POST", headers: { "content-type": "application/json" }, body: '{"text": "half' };
  for (const path of ["/api/tasks", "/api/live/stop"]) {
    const res = await root.request(path, broken);
    assert.equal(res.status, 400, path);
    const { error } = (await res.json()) as { error: string };
    assert.ok(error.length > 0, path);
  }
  const tasks = await root.request("/api/tasks", broken);
  assert.deepEqual(await tasks.json(), { error: "the request's body isn't JSON" });

  const crash = await root.request("/api/crash");
  assert.equal(crash.status, 500);
  assert.deepEqual(await crash.json(), { error: "something went wrong on the computer's side" });
  assert.ok(logged.length > 0);
  for (const line of logged) assert.doesNotMatch(line, /made-up-folder|\n/);
});
