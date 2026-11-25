// Search now on a hunt the old setup runs asks the old setup's own Search now: a stand-in door plays it, answers as
// the old server does (started, busy, waiting, paused, off, another failure), keeps what it was asked, and plays its
// Live (searching or not). A hunt with a search of its own here still runs that search, and with no old setup set a
// mirrored hunt answers as before. Made-up hunts only.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { type TestContext, test } from "node:test";
import { Hono } from "hono";
import { migrate } from "../db/migrate.ts";
import { lastRun, pendingSearches } from "../domain/search/runs.ts";
import type { Settings } from "../platform/config.ts";
import { mountSearch } from "./search.ts";

// a made-up data folder: a job hunt carried from the old setup (its listings' search is the old hunt's id) with a
// spec here that is off, a deal hunt carried with no key of the old setup's, a deal hunt the mirror brings (the import
// kept its old key) whose search here is Paused, and a job hunt with a search of its own whose collector prints one
// made-up job
async function setup(t: TestContext) {
  const base = mkdtempSync(join(tmpdir(), "kestrel-searchnow-"));
  const before = process.env.KESTREL_DATA_DIR;
  process.env.KESTREL_DATA_DIR = base;
  t.after(() => {
    if (before === undefined) delete process.env.KESTREL_DATA_DIR;
    else process.env.KESTREL_DATA_DIR = before;
  });
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  const put = db.prepare(
    `INSERT INTO listings (id, search, source, link, dedupe, status, found, updated, data, kind)
     VALUES (?, ?, 'made-up-board', ?, ?, 'new', '2026-11-20T00:00:00Z', '2026-11-20T00:00:00Z', ?, ?)`,
  );
  put.run("o1", "made-up-hunt", "https://example.com/o1", "o1", "{}", "jobs");
  put.run("d1", "made-up-chair-site", "https://example.com/d1", "d1", '{"hunt":"Made-up chair"}', "deals");
  put.run(
    "d2",
    "made-up-lamp-site",
    "https://example.com/d2",
    "d2",
    '{"hunt":"Made-up lamp","oldHunt":"hunt:made-up lamp"}',
    "deals",
  );
  put.run("k1", "own-hunt", "https://example.com/k1", "k1", "{}", "jobs");
  const collector = join(base, "collector.mjs");
  writeFileSync(
    collector,
    `#!/usr/bin/env node\nconsole.log(JSON.stringify([{ source: "made-up-board", url: "https://example.com/k2", title: "Hive keeper" }]));`,
  );
  chmodSync(collector, 0o755);
  mkdirSync(join(base, "searches"));
  writeFileSync(
    join(base, "searches", "own-hunt.json"),
    JSON.stringify({ name: "Own hunt", kind: "jobs", collector, scoring: { title: { want: ["keeper"] } } }),
  );

  writeFileSync(
    join(base, "searches", "made-up-hunt-off.json"),
    JSON.stringify({ name: "Off", kind: "jobs", hunt: "made-up-hunt", collector, enabled: false, scoring: {} }),
  );
  const lampSpec = { name: "Lamp · Made-up market", kind: "deals", hunt: "Made-up lamp", collector, scoring: {} };
  const lamp = (auto: boolean) =>
    writeFileSync(join(base, "searches", "made-up-lamp-site.json"), JSON.stringify({ ...lampSpec, auto }));
  lamp(false); // Paused here: the old setup searches it meanwhile

  // the stand-in for the old server: its Live says whether it searches; a write answers what `next` holds and is kept
  const asked: { url: string; body: string; origin?: string; type?: string }[] = [];
  let next: { status: number; body: unknown } = { status: 202, body: { started: true } };
  let searching = false;
  const door = createServer((req, res) => {
    let body = "";
    req.on("data", (b) => {
      body += b;
    });
    req.on("end", () => {
      if (req.method === "GET") {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ chats: [], queuePaused: false, searching, lines: [] }));
      }
      asked.push({ url: String(req.url), body, origin: req.headers.origin, type: req.headers["content-type"] });
      res.writeHead(next.status, { "content-type": "application/json" });
      res.end(JSON.stringify(next.body));
    });
  });
  await new Promise<void>((ok) => door.listen(0, "127.0.0.1", ok));
  t.after(() => door.close());
  const oldLive = `http://127.0.0.1:${(door.address() as AddressInfo).port}/api/live`;

  const mount = (settings: Partial<Settings>, clock?: () => number) => {
    const app = new Hono();
    mountSearch(app, db, settings as Settings, clock);
    return {
      hunts: async () =>
        (
          (await (await app.request("/api/search")).json()) as {
            hunts: {
              key: string;
              oldSearchNow: boolean;
              mirrored: boolean;
              mode: string | null;
              running: number;
              oldSearching: boolean;
            }[];
          }
        ).hunts,
      run: async (kind: string, key: string) => {
        const res = await app.request("/api/search/hunts/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind, key }),
        });
        return { status: res.status, body: await res.json() };
      },
    };
  };
  const answer = (status: number, body: unknown) => {
    next = { status, body };
  };
  const liveSays = (now: boolean) => {
    searching = now;
  };
  return { db, oldLive, asked, answer, liveSays, lamp, mount };
}

test("Search now on a job hunt the old setup runs asks the old setup's own, and passes on each answer", async (t) => {
  const { oldLive, asked, answer, mount } = await setup(t);
  let now = Date.now();
  const kestrel = mount({ oldLive }, () => now);
  // the carried job hunt offers it, and reads as mirrored though its spec here is off; so does the deal hunt the
  // mirror brings with its old key, its search here Paused. A deal hunt with no old key, and a hunt of its own, don't
  assert.deepEqual(
    (await kestrel.hunts()).map((h) => [h.key, h.oldSearchNow, h.mirrored]),
    [
      ["Made-up chair", false, true],
      ["Made-up lamp", true, true],
      ["made-up-hunt", true, true],
      ["own-hunt", false, false],
    ],
  );

  assert.deepEqual(await kestrel.run("jobs", "made-up-hunt"), { status: 202, body: { old: "started" } });
  // the old hunt's id, as JSON, and no Origin header: the old server refuses a write that names another page
  assert.deepEqual(asked, [
    { url: "/api/jobs/search-now", body: '{"hunt":"made-up-hunt"}', origin: undefined, type: "application/json" },
  ]);
  now += 31_000; // never seen searching there: over, so the next press asks again

  answer(409, { code: "busy", error: "A search is already running. Try again in a few minutes." });
  assert.deepEqual(await kestrel.run("jobs", "made-up-hunt"), {
    status: 409,
    body: { old: "busy", at: null, why: "" },
  });
  const at = "2026-11-24T15:42:00.000Z";
  answer(409, {
    code: "waiting",
    at,
    error:
      "This hunt was searched lately: Search now can search it again at 10:42 (an hour apart, as it reads your own Made-up Board).",
  });
  assert.deepEqual(await kestrel.run("jobs", "made-up-hunt"), {
    status: 409,
    body: { old: "waiting", at, why: "an hour apart, as it reads your own Made-up Board" },
  });
  answer(409, { code: "paused", error: "This hunt is paused. Turn it on, then search." });
  assert.deepEqual(await kestrel.run("jobs", "made-up-hunt"), {
    status: 409,
    body: { old: "paused", at: null, why: "" },
  });
  answer(404, { code: "not_found", error: "no hunt made-up-hunt" });
  assert.deepEqual(await kestrel.run("jobs", "made-up-hunt"), {
    status: 502,
    body: { error: "the old setup has no such hunt any more: its old finds stay here" },
  });
  assert.equal(asked.length, 5);

  // the old server down (port 9 answers nothing): said plainly, nothing started
  const down = await mount({ oldLive: "http://127.0.0.1:9/api/live" }).run("jobs", "made-up-hunt");
  assert.equal(down.status, 502);
  assert.match((down.body as { error: string }).error, /didn't answer/);
});

test("a hunt with a search of its own still runs it; with no old setup set, a carried hunt answers as before", async (t) => {
  const { db, oldLive, asked, mount } = await setup(t);
  assert.deepEqual(await mount({ oldLive }).run("jobs", "own-hunt"), { status: 202, body: { started: 1 } });
  while (pendingSearches().size > 0) await new Promise((ok) => setTimeout(ok, 20));
  assert.equal(lastRun(db, "own-hunt")?.found, 1);

  const before = mount({});
  assert.equal((await before.hunts()).find((h) => h.key === "made-up-hunt")?.oldSearchNow, false);
  assert.deepEqual(await before.run("jobs", "made-up-hunt"), {
    status: 400,
    body: { error: "this hunt has no kestrel search that is on" },
  });
  assert.deepEqual(asked, []); // the old setup was never asked
});

test("a deal hunt the old setup runs is searched there, and reads as searching until the old setup's Live says it ended", async (t) => {
  const { oldLive, asked, answer, liveSays, lamp, mount } = await setup(t);
  let now = Date.now();
  const kestrel = mount({ oldLive }, () => now);
  const hunt = async () => (await kestrel.hunts()).find((h) => h.key === "Made-up lamp");
  // its switch stays, Paused, so it can be turned On here again
  assert.equal((await hunt())?.mode, "paused");

  assert.deepEqual(await kestrel.run("deals", "Made-up lamp"), { status: 202, body: { old: "started" } });
  // the old deal door, under the old hunt's own key
  assert.deepEqual(asked, [
    { url: "/api/search-now", body: '{"hunt":"hunt:made-up lamp"}', origin: undefined, type: "application/json" },
  ]);
  // pressed, before the old setup's search takes its lock: searching already
  assert.deepEqual([(await hunt())?.running, (await hunt())?.oldSearching], [1, true]);
  now += 3000; // past the shared read's two seconds
  liveSays(true);
  assert.equal((await hunt())?.running, 1);
  now += 3000;
  liveSays(false);
  assert.deepEqual([(await hunt())?.running, (await hunt())?.oldSearching], [0, false]); // its Live says it ended

  // the old setup's own timer round, not started here: every hunt it runs reads as searching (its lock is one for all,
  // and its Search now would only answer busy); a hunt kestrel searches itself doesn't (review)
  now += 3000;
  liveSays(true);
  const during = await kestrel.hunts();
  assert.deepEqual(
    during.map((h) => [h.key, h.oldSearching]),
    during.map((h) => [h.key, h.oldSearchNow]),
  );
  assert.equal((await hunt())?.running, 1);
  now += 3000;
  liveSays(false);
  assert.equal((await hunt())?.running, 0);

  // started but never seen searching: over once half a minute has passed
  await kestrel.run("deals", "Made-up lamp");
  assert.equal((await hunt())?.running, 1);
  now += 31_000;
  assert.equal((await hunt())?.running, 0);

  // a quick double press reaches the old setup once; both read as started (review)
  const knocks = asked.length;
  assert.deepEqual(
    (await Promise.all([kestrel.run("deals", "Made-up lamp"), kestrel.run("deals", "Made-up lamp")])).map(
      (r) => r.body,
    ),
    [{ old: "started" }, { old: "started" }],
  );
  assert.equal(asked.length, knocks + 1);
  now += 31_000;
  assert.equal((await hunt())?.running, 0);

  // why not now, each in its plain line: busy; waiting until the soonest of its searches is free; every search off
  answer(409, { code: "busy", error: "A search is already running. New ads show up here when it ends." });
  assert.deepEqual(await kestrel.run("deals", "Made-up lamp"), {
    status: 409,
    body: { old: "busy", at: null, why: "" },
  });
  answer(409, {
    code: "waiting",
    error: "Every search of this hunt ran lately.",
    run: [],
    wait: [
      { name: "made-up-lamp-site", site: "Made-up market", at: "2026-11-25T16:00:00.000Z" },
      { name: "made-up-lamp-two", site: "Made-up market", at: "2026-11-25T15:15:00.000Z" },
    ],
    off: 0,
  });
  assert.deepEqual(await kestrel.run("deals", "Made-up lamp"), {
    status: 409,
    body: { old: "waiting", at: "2026-11-25T15:15:00.000Z", why: "" },
  });
  answer(409, { code: "waiting", error: "Every search of this hunt is off.", run: [], wait: [], off: 2 });
  assert.deepEqual(await kestrel.run("deals", "Made-up lamp"), {
    status: 409,
    body: { old: "off", at: null, why: "" },
  });
  assert.equal((await hunt())?.running, 0); // an answer that isn't started leaves it idle

  // turned On here, the hunt searches here again: its own search runs, the old setup isn't asked
  lamp(true);
  const before = asked.length;
  assert.deepEqual(await kestrel.run("deals", "Made-up lamp"), { status: 202, body: { started: 1 } });
  assert.equal(asked.length, before);
  // a second press while it is in the line adds nothing
  assert.deepEqual(await kestrel.run("deals", "Made-up lamp"), { status: 202, body: { started: 0 } });
  while (pendingSearches().size > 0) await new Promise((ok) => setTimeout(ok, 20));
});

test("the sheet's Delete takes a listing from the counts; its id still opens it, deleted, and Restore brings it back", async (t) => {
  const { db } = await setup(t);
  const app = new Hono();
  mountSearch(app, db, {} as Settings);
  const all = async () => ((await (await app.request("/api/search/counts?kind=jobs")).json()) as { all: number }).all;
  const before = await all();
  assert.equal((await app.request("/api/search/listings/o1", { method: "DELETE" })).status, 200);
  assert.equal(await all(), before - 1);
  const opened = (await (await app.request("/api/search/listings/o1")).json()) as {
    id: string;
    deleted: { by: string };
  };
  assert.deepEqual([opened.id, opened.deleted.by], ["o1", "me"]);
  assert.equal((await app.request("/api/search/listings/o1", { method: "DELETE" })).status, 404); // once
  assert.equal((await app.request("/api/search/listings/o1/restore", { method: "POST" })).status, 200);
  assert.equal(await all(), before);
  const back = (await (await app.request("/api/search/listings/o1")).json()) as {
    deleted: unknown;
    mine: { deleted?: string };
  };
  assert.equal(back.deleted, null);
  assert.ok(
    back.mine.deleted,
    "Restore on the sheet is my mark, so a delete in the old setup doesn't take it (review)",
  );
  assert.equal((await app.request("/api/search/listings/o1/restore", { method: "POST" })).status, 409);
});
