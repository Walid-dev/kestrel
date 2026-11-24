// Stop and Pause on Live go through to the old setup's server, which runs the applications: a stand-in server plays
// it and keeps what it was asked. Stop all pauses the queue before it stops the chat, so nothing new starts between;
// a chat id that isn't one is refused before anything is sent.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { Hono } from "hono";
import { migrate } from "../db/migrate.ts";
import { mountLive } from "./live.ts";

const CHAT = "session-0123abcd-0000-4000-8000-000000000001";

test("Stop, Stop all and Pause reach the old setup in order; a bad chat id is refused first", async () => {
  const asked: string[] = [];
  let paused = false;
  const old = createServer((req, res) => {
    let body = "";
    req.on("data", (b) => {
      body += b;
    });
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      if (req.method === "GET") return res.end(JSON.stringify({ chats: [], queuePaused: paused }));
      asked.push(`${req.url} ${body}`);
      if (req.url === "/api/queue/pause") paused = (JSON.parse(body) as { paused: boolean }).paused;
      res.end(JSON.stringify(req.url === "/api/chat/stop" ? { stopped: true } : { paused }));
    });
  });
  await new Promise<void>((ok) => old.listen(0, "127.0.0.1", ok));
  const oldLive = `http://127.0.0.1:${(old.address() as AddressInfo).port}/api/live`;
  try {
    const base = mkdtempSync(join(tmpdir(), "kestrel-liveapi-"));
    const db = new DatabaseSync(join(base, "t.db"));
    migrate(db, join(base, "t.db"));
    const app = new Hono();
    mountLive(app, db, oldLive);
    const post = (path: string, body: unknown) =>
      app.request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    assert.equal((await post("/api/live/stop", { chat: "rm -rf" })).status, 400);
    assert.deepEqual(asked, []);

    assert.deepEqual(await (await post("/api/live/stop", { chat: CHAT })).json(), { stopped: true });
    assert.deepEqual(asked, [`/api/chat/stop {"chat":"${CHAT}"}`]);

    asked.length = 0;
    await post("/api/live/stop", { chat: CHAT, all: true });
    assert.deepEqual(asked, ['/api/queue/pause {"paused":true}', `/api/chat/stop {"chat":"${CHAT}"}`]);
    const live = (await (await app.request("/api/live")).json()) as { paused: boolean; at: string };
    assert.equal(live.paused, true);
    assert.match(live.at, /^\d{4}-/); // the page's own time, not the cache's

    assert.deepEqual(await (await post("/api/live/pause", { paused: false })).json(), { paused: false });
  } finally {
    old.close();
  }
});

test("Stop and Pause take only their own shapes; the old setup's chats are read leniently, one by one (review)", async () => {
  const asked: string[] = [];
  const at = new Date().toISOString();
  const old = createServer((req, res) => {
    let body = "";
    req.on("data", (b) => {
      body += b;
    });
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      if (req.method !== "GET") {
        asked.push(`${req.url} ${body}`);
        return res.end("{}");
      }
      res.end(
        JSON.stringify({
          chats: [
            { id: "c1", title: "Made-up chat without steps", working: true, started: at, updated: at },
            {
              id: "c2",
              title: "Made-up chat",
              working: true,
              started: at,
              updated: at,
              steps: [{ at, kind: "say", text: "Hi" }],
            },
            "not a chat",
          ],
        }),
      );
    });
  });
  await new Promise<void>((ok) => old.listen(0, "127.0.0.1", ok));
  try {
    const base = mkdtempSync(join(tmpdir(), "kestrel-livezod-"));
    const db = new DatabaseSync(join(base, "t.db"));
    migrate(db, join(base, "t.db"));
    const app = new Hono();
    mountLive(app, db, `http://127.0.0.1:${(old.address() as AddressInfo).port}/api/live`);
    const post = (path: string, body: unknown) =>
      app.request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    assert.equal((await post("/api/live/pause", { paused: "yes" })).status, 400);
    assert.equal((await post("/api/live/stop", { chat: CHAT, all: "yes" })).status, 400);
    assert.deepEqual(asked, []); // nothing reached the old setup
    const live = (await (await app.request("/api/live")).json()) as { chats: { id: string; steps: unknown[] }[] };
    assert.deepEqual(
      live.chats.map((c) => [c.id, c.steps.length]),
      [
        ["c1", 0],
        ["c2", 1],
      ],
    );
    // another address that doesn't answer shows nothing, not the first address's chats (review)
    const other = new Hono();
    mountLive(other, db, "http://127.0.0.1:9/api/live");
    const none = (await (await other.request("/api/live")).json()) as { chats: unknown[]; queuePaused?: unknown };
    assert.deepEqual(none.chats, []);
  } finally {
    old.close();
  }
});
