// The news' doors on made-up briefs: a day that isn't one answers 400 in plain words, a day with no brief 404; the
// days a page at a time with their total; the find; a day deleted, refused while it is written; a story starred and
// unstarred, its star kept through its day's delete. No model is asked.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { Hono } from "hono";
import { migrate } from "../db/migrate.ts";
import { NewsSettings, type Settings } from "../platform/config.ts";
import { mountNews } from "./news.ts";

function setup() {
  const db = new DatabaseSync(":memory:");
  migrate(db, ":memory:");
  const add = db.prepare("INSERT INTO news_briefs (id, day, state, started, brief) VALUES (?, ?, 'done', ?, ?)");
  for (const [id, day, headline] of [
    ["b1", "2026-11-23", "Kettle maker raises a made-up fortune"],
    ["b2", "2026-11-24", "Teapot shares rise"],
  ])
    add.run(
      id,
      day,
      `${day}T06:31:00Z`,
      JSON.stringify({
        opening: [],
        stories: [{ section: "money", headline, text: "", figure: "", trend: "none", links: [], unsure: false }],
        quiet: "",
      }),
    );
  const app = new Hono();
  // the news off, so deleting today is never held for the morning's brief (days.test.ts tests that)
  mountNews(app, db, { news: NewsSettings.parse({ enabled: false }) } as Settings);
  return { app, db };
}
const read = async (res: Response) => ({ status: res.status, body: (await res.json()) as Record<string, unknown> });

test("a day that isn't one is 400 in plain words, a day with no brief 404; the days a page at a time; the find", async () => {
  const { app } = setup();
  assert.deepEqual(await read(await app.request("/api/news?day=yesterday")), {
    status: 400,
    body: { error: "a day like 2026-11-24" },
  });
  assert.equal((await app.request("/api/news?day=2026-01-01")).status, 404);
  // a day that can't be is a bad day, not a day with no brief
  for (const day of ["2026-13-45", "2020-02-30"])
    assert.deepEqual(await read(await app.request(`/api/news?day=${day}`)), {
      status: 400,
      body: { error: "a day like 2026-11-24" },
    });
  assert.deepEqual(await read(await app.request("/api/news/days?limit=1")), {
    status: 200,
    body: {
      days: [{ id: "b2", day: "2026-11-24", stories: 1, lead: "Teapot shares rise", starred: 0 }],
      total: 2,
      since: "2026-11-23",
      starred: 0,
    },
  });
  const older = await read(await app.request("/api/news/days?limit=1&before=2026-11-24"));
  assert.deepEqual(
    (older.body.days as { day: string }[]).map((d) => d.day),
    ["2026-11-23"],
  );
  for (const limit of ["0", "101", "abc", "1.5"])
    assert.deepEqual(await read(await app.request(`/api/news/days?limit=${limit}`)), {
      status: 400,
      body: { error: "a number from 1 to 100" },
    });
  assert.equal((await app.request("/api/news/days?before=soon")).status, 400);
  assert.deepEqual(await read(await app.request("/api/news/find?q=KETTLE")), {
    status: 200,
    body: {
      found: [{ day: "2026-11-23", n: 1, section: "money", headline: "Kettle maker raises a made-up fortune" }],
      more: false,
    },
  });
  assert.equal((await app.request("/api/news/find?q=%20")).status, 400);
});

test("a day deleted: 400 for a day that isn't one, 404 for one with no brief, 400 while it is written, then gone", async () => {
  const { app, db } = setup();
  const del = (day: string) => app.request(`/api/news/days/${day}`, { method: "DELETE" });
  assert.equal((await del("2026-11-5")).status, 400);
  assert.equal((await del("2026-02-30")).status, 400);
  assert.equal((await del("2026-01-01")).status, 404);
  db.prepare("INSERT INTO news_briefs (id, day, state, started) VALUES ('r', '2026-11-24', 'running', ?)").run(
    "2026-11-24T09:00:00Z",
  );
  assert.deepEqual(await read(await del("2026-11-24")), {
    status: 400,
    body: { error: "that day's brief is being written: delete it once it is done" },
  });
  assert.equal((await del("2026-11-23")).status, 200);
  assert.equal((await app.request("/api/news?day=2026-11-23")).status, 404);
  const days = await read(await app.request("/api/news/days"));
  assert.equal(days.body.total, 1);
});

test("a star: 400 for a number that isn't one, 404 past the brief's last story; it outlives its day", async () => {
  const { app } = setup();
  const star = (brief: string, n: string, method = "PUT") => app.request(`/api/news/stars/${brief}/${n}`, { method });
  for (const n of ["0", "1000", "1.5", "two", "0x1", "1e0", "%201", "01"])
    assert.deepEqual(await read(await star("b1", n)), { status: 400, body: { error: "a story number from 1 to 999" } });
  assert.deepEqual(await read(await star("b%20b", "1")), { status: 400, body: { error: "a brief's id" } });
  // b1 holds one story: its second is out of range, as is any story of a brief that isn't there
  assert.deepEqual(await read(await star("b1", "2")), { status: 404, body: { error: "that brief has no such story" } });
  assert.equal((await star("nowhere", "1")).status, 404);
  assert.equal((await star("b1", "1")).status, 200);
  assert.equal((await star("b2", "1")).status, 200);
  assert.equal((await star("b2", "1")).status, 200); // starred again: the same star
  const stars = async () => (await read(await app.request("/api/news/stars"))).body.stars as Record<string, unknown>[];
  assert.deepEqual(
    (await stars()).map((s) => [s.brief, s.n, s.day, s.shown]),
    [
      ["b2", 1, "2026-11-24", true],
      ["b1", 1, "2026-11-23", true],
    ],
  );
  assert.deepEqual((await read(await app.request("/api/news?day=2026-11-23"))).body.starred, [true]);
  // the 23rd deleted: its star stays, the story's copy with it, opening as itself now
  assert.equal((await app.request("/api/news/days/2026-11-23", { method: "DELETE" })).status, 200);
  const kept = (await stars()).find((s) => s.brief === "b1");
  assert.equal(kept?.shown, false);
  assert.equal((kept?.story as { headline: string } | undefined)?.headline, "Kettle maker raises a made-up fortune");
  assert.equal((await read(await app.request("/api/news/days"))).body.starred, 2);
  // unstarred: gone from the list; a second unstar has nothing to take off
  assert.equal((await star("b1", "1", "DELETE")).status, 200);
  assert.deepEqual(await read(await star("b1", "1", "DELETE")), {
    status: 404,
    body: { error: "that story isn't starred" },
  });
  assert.deepEqual(
    (await stars()).map((s) => s.brief),
    ["b2"],
  );
});
