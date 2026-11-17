import assert from "node:assert/strict";
import { test } from "node:test";
import { Hono } from "hono";
import { identity } from "./identity.ts";

const root = new Hono();
root.use("*", identity("made-up-login", true));
root.get("/api/health", (c) => c.json({ ok: true }));
root.post("/api/echo", (c) => c.json({ ok: true }));

test("my login passes; another login or none gets 403", async () => {
  const mine = await root.request("/api/health", { headers: { "tailscale-user-login": "made-up-login" } });
  assert.equal(mine.status, 200);
  const other = await root.request("/api/health", { headers: { "tailscale-user-login": "someone-else" } });
  assert.equal(other.status, 403);
  const none = await root.request("/api/health");
  assert.equal(none.status, 403);
});

test("a write from another page's address gets 403; from kestrel's own, 200", async () => {
  const mine = { "tailscale-user-login": "made-up-login", host: "kestrel.made-up.ts.net:8790" };
  const evil = await root.request("/api/echo", {
    method: "POST",
    headers: { ...mine, origin: "https://evil.example" },
  });
  assert.equal(evil.status, 403);
  const own = await root.request("/api/echo", {
    method: "POST",
    headers: { ...mine, origin: "https://kestrel.made-up.ts.net:8790" },
  });
  assert.equal(own.status, 200);
});

test("off (development, made-up data), requests pass without the header", async () => {
  const dev = new Hono();
  dev.use("*", identity("made-up-login", false));
  dev.get("/x", (c) => c.json({ ok: true }));
  assert.equal((await dev.request("/x")).status, 200);
});
