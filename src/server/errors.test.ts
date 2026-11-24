// A bad request answers 400 in plain words on every route, whether a validator reads the body or the route reads it by
// hand; any other failure stays a 500 whose answer and log carry no path. The root is composed as main.ts composes it.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { Hono } from "hono";
import { migrate } from "../db/migrate.ts";
import type { Settings } from "../platform/config.ts";
import { answerFailure } from "./errors.ts";
import { mountLive } from "./live.ts";
import { mountSearch } from "./search.ts";
import { mountTasks } from "./tasks.ts";

test("malformed JSON answers 400, saying so; a crash answers 500 without its path", async (t) => {
  const logged: string[] = [];
  t.mock.method(console, "error", (line: string) => logged.push(line));
  const base = mkdtempSync(join(tmpdir(), "kestrel-errors-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  // a made-up data folder whose "searches" is a file, so writing a search fails on the computer's side
  const before = process.env.KESTREL_DATA_DIR;
  t.after(() => {
    if (before === undefined) delete process.env.KESTREL_DATA_DIR;
    else process.env.KESTREL_DATA_DIR = before;
  });
  process.env.KESTREL_DATA_DIR = base;
  writeFileSync(join(base, "searches"), "not a folder");
  const app = new Hono();
  mountTasks(app, db); // its new task reads the body through zValidator
  mountSearch(app, db, {} as Settings); // a search's settings are read by hand
  mountLive(app, db, ""); // its Stop reads the body by hand too
  app.get("/api/crash", () => {
    throw new Error("unable to open /tmp/made-up-folder/kestrel.db");
  });
  const root = new Hono();
  root.onError(answerFailure);
  root.route("/", app);

  // before the fix, the tasks route answered 500 and the search route the parser's own words; Live's Stop already
  // answered 400 and stays here as a guard
  const broken = { headers: { "content-type": "application/json" }, body: '{"text": "half' };
  for (const [method, path] of [
    ["POST", "/api/tasks"],
    ["PUT", "/api/search/specs/hive-keeper"],
    ["POST", "/api/live/stop"],
  ]) {
    const res = await root.request(path, { ...broken, method });
    assert.equal(res.status, 400, path);
    const { error } = (await res.json()) as { error: string };
    if (path !== "/api/live/stop") assert.equal(error, "the request's body isn't JSON", path);
    else assert.ok(error.length > 0);
  }

  // a search the check refuses is a bad request, named; a disk failure while writing one is the computer's, a 500
  const put = (body: unknown) =>
    root.request("/api/search/specs/hive-keeper", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const refused = await put({ name: "Hive keeper" });
  assert.equal(refused.status, 400);
  assert.match(((await refused.json()) as { error: string }).error, /collector/);
  const disk = await put({ name: "Hive keeper", kind: "jobs", collector: "collectors/made-up.mjs", scoring: {} });
  assert.equal(disk.status, 500);
  assert.deepEqual(await disk.json(), { error: "something went wrong on the computer's side" });

  const crash = await root.request("/api/crash");
  assert.equal(crash.status, 500);
  assert.deepEqual(await crash.json(), { error: "something went wrong on the computer's side" });
  assert.ok(logged.length > 0);
  for (const line of logged) {
    assert.doesNotMatch(line, /made-up-folder|\n/);
    assert.ok(!line.includes(base), "the log must not name the data folder");
  }
});
