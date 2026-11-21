// The agent's whole road through the doors, and the bus ringing on every change — the phone's live strip feeds here.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { Hono } from "hono";
import { migrate } from "../db/migrate.ts";
import { mountApply } from "./apply.ts";
import { bus, mountEvents } from "./events.ts";

function setup() {
  const base = mkdtempSync(join(tmpdir(), "kestrel-applyapi-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  const app = new Hono();
  mountApply(app, db);
  mountEvents(app);
  return app;
}
const post = (app: Hono, path: string, body: unknown) =>
  app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("queue, claim, needs-me, retry road through the doors; the bus rings each time", async () => {
  const app = setup();
  let rings = 0;
  const count = () => rings++;
  bus.on("change", count);
  const q = (await (await post(app, "/api/apply/queue", { link: "https://example.com/1" })).json()) as {
    id: string;
    state: string;
  };
  assert.equal(q.state, "queued");
  const { claimed } = (await (await post(app, "/api/apply/claim", { agent: "made-up-agent" })).json()) as {
    claimed: { state: string };
  };
  assert.equal(claimed.state, "applying");
  const parked = await post(app, "/api/apply/report", { id: q.id, state: "needs-me", reason: "a check only I can do" });
  assert.equal(((await parked.json()) as { state: string }).state, "needs-me");
  const refused = await post(app, "/api/apply/report", { id: q.id, state: "queued" });
  assert.equal(refused.status, 400);
  const failed = await post(app, "/api/apply/report", { id: q.id, state: "not-sent", reason: "the form closed" });
  assert.equal(((await failed.json()) as { state: string }).state, "not-sent");
  const retried = (await (await post(app, "/api/apply/retry", { id: q.id })).json()) as { state: string };
  assert.equal(retried.state, "queued");
  bus.off("change", count);
  assert.equal(rings, 5); // queue, claim, needs-me, not-sent, retry — the refusal rings nothing
});

test("the events stream greets and then carries a change", async () => {
  const app = setup();
  const res = await app.request("/api/events");
  assert.equal(res.headers.get("content-type"), "text/event-stream");
  const reader = res.body?.getReader();
  const first = new TextDecoder().decode((await reader?.read())?.value);
  assert.match(first, /"kind":"hello"/);
  await post(app, "/api/apply/queue", { link: "https://example.com/2" });
  const second = new TextDecoder().decode((await reader?.read())?.value);
  assert.match(second, /"kind":"apply"/);
  assert.match(second, /"queued":1/);
  await reader?.cancel();
});
