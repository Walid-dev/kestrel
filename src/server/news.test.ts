// The news' doors on made-up briefs: a day that isn't one answers 400 in plain words, a day with no brief 404; the
// days a page at a time with their total; the find; a day deleted, refused while it is written. No model is asked.
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
      days: [{ id: "b2", day: "2026-11-24", stories: 1, lead: "Teapot shares rise" }],
      total: 2,
      since: "2026-11-23",
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
