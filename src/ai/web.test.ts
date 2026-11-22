// The web search tries once more after a refusal, and two empty answers are empty. A made-up door on this computer.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { searchWeb } from "./web.ts";

async function door(answers: { status: number; body: unknown }[]) {
  let calls = 0;
  const server = createServer((_req, res) => {
    const a = answers[Math.min(calls, answers.length - 1)];
    calls++;
    res.writeHead(a.status, { "content-type": "application/json" });
    res.end(JSON.stringify(a.body));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return {
    settings: { url: `http://127.0.0.1:${port}/v1`, careful: "m", fast: "m", contextChars: 1000 },
    calls: () => calls,
    close: () => server.close(),
  };
}

test("a refused search is tried once more, and the second answer counts", async () => {
  const d = await door([
    { status: 500, body: { ok: false, error: { message: "busy" } } },
    { status: 200, body: { ok: true, results: [{ title: "Teapots", url: "https://example.com/t", snippet: "Tea." }] } },
  ]);
  const hits = await searchWeb(d.settings, "teapots", 5);
  assert.deepEqual(hits, [{ title: "Teapots", url: "https://example.com/t", snippet: "Tea." }]);
  assert.equal(d.calls(), 2);
  d.close();
});

test("two empty answers are empty, after two tries only", async () => {
  const d = await door([{ status: 200, body: { ok: true, results: [] } }]);
  assert.deepEqual(await searchWeb(d.settings, "nothing", 5), []);
  assert.equal(d.calls(), 2);
  d.close();
});
