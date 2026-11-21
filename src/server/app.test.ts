import assert from "node:assert/strict";
import { test } from "node:test";
import { app } from "./app.ts";

test("the health route answers ok", async () => {
  const res = await app.request("/api/health");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});
