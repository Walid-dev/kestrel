// The web search tries once more after a refusal, and two empty answers are empty; the page reader opens public
// addresses only, after resolving and through redirects. A made-up door on this computer, made-up names and addresses.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { fetchPage, publicUrl, type Reach, searchWeb } from "./web.ts";

async function door(answers: { status: number; body: unknown }[]) {
  let calls = 0;
  const asked: unknown[] = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
    });
    req.on("end", () => {
      asked.push(JSON.parse(raw || "{}"));
      const a = answers[Math.min(calls, answers.length - 1)];
      calls++;
      res.writeHead(a.status, { "content-type": "application/json" });
      res.end(JSON.stringify(a.body));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return {
    settings: { url: `http://127.0.0.1:${port}/v1`, careful: "m", fast: "m", contextChars: 1000 },
    calls: () => calls,
    asked: () => asked,
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

// a made-up internet: names resolve as listed, and a HEAD answers a redirect where one is listed
const reach = (names: Record<string, string[]>, moves: Record<string, string> = {}): Reach => ({
  resolve: async (host) => names[host] ?? [],
  head: async (url) => (moves[url] ? { status: 302, location: moves[url] } : { status: 200, location: null }),
});
const PUBLIC = { "example.com": ["93.184.215.14"], "www.example.com": ["2606:2800:21f:cb07:6820:80da:af6b:8b2c"] };

test("the page reader refuses this computer, the home network and the tailnet, by name, by address and by redirect", async () => {
  const internet = reach(
    { ...PUBLIC, "sneaky.example.com": ["93.184.215.14", "192.168.0.10"] },
    { "https://example.com/moved": "https://127.0.0.1:8790/api/live", "https://example.com/next": "/page" },
  );
  for (const url of [
    "https://localhost/",
    "https://printer.local/",
    "https://db.internal/x",
    "https://made-up.tail0000.ts.net/",
    "https://router/",
    "https://127.0.0.1:8790/",
    "https://10.0.0.5/",
    "https://172.20.1.1/",
    "https://192.168.1.2/",
    "https://169.254.169.254/latest",
    "https://100.100.1.1/",
    "https://[::1]/",
    "https://[fe80::1]/",
    "https://[fd00::1]/",
    "https://[::ffff:127.0.0.1]/",
    "http://[::127.0.0.1]/", // IPv4-compatible (review)
    "https://[::ffff:0:7f00:1]/", // IPv4-translated (review)
    "https://[2002:7f00:1::]/", // 6to4 (review)
    "https://[2001:0:4136:e378::1]/", // Teredo
    "https://sneaky.example.com/", // one of its addresses is at home
    "https://example.com/moved", // redirected home
    "https://nowhere.example.com/", // resolves to nothing
    "ftp://example.com/file",
    "not a link",
  ])
    await assert.rejects(publicUrl(url, internet), /isn't on the public web|doesn't resolve|can't be read/, url);
  assert.equal(await publicUrl("https://example.com/a", internet), "https://example.com/a");
  assert.equal(await publicUrl("https://example.com/next", internet), "https://example.com/page");
  assert.equal(await publicUrl("http://www.example.com/", internet), "http://www.example.com/");
});

test("a refused address never reaches the door; a public one goes as its redirects end", async () => {
  const d = await door([
    { status: 200, body: { ok: true, content: "A teapot is a vessel for steeping tea leaves.\n" } },
  ]);
  const internet = reach(PUBLIC, { "https://example.com/old": "https://www.example.com/new" });
  try {
    await assert.rejects(fetchPage(d.settings, "https://127.0.0.1:8790/", 8000, internet), /public web/);
    assert.equal(d.calls(), 0);
    assert.match(await fetchPage(d.settings, "https://example.com/old", 8000, internet), /steeping tea/);
    assert.equal(d.calls(), 1);
    assert.deepEqual(d.asked(), [{ url: "https://www.example.com/new" }]);
  } finally {
    d.close();
  }
});
