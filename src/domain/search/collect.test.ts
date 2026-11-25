// Stand-in collector scripts exercise every ending: items, garbage, a login wanted, a hang, a missing script.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runCollector } from "./collect.ts";

const dir = mkdtempSync(join(tmpdir(), "kestrel-collect-"));
function script(name: string, body: string): string {
  const p = join(dir, name);
  writeFileSync(p, `#!/usr/bin/env node\n${body}`);
  chmodSync(p, 0o755);
  return p;
}

test("a good collector's items come back parsed and defaulted", async () => {
  const p = script(
    "good.mjs",
    `console.log(JSON.stringify([{ source: "made-up-board", url: "https://example.com/1", title: "Made-up Engineer" }]));`,
  );
  const got = await runCollector(p, []);
  assert.equal(got.problem, "");
  assert.equal(got.items[0].title, "Made-up Engineer");
  assert.equal(got.items[0].salaryMin, null);
});

test("exit 3 reads as the site wanting a login, with the script's own hint", async () => {
  const p = script("login.mjs", `console.error("session gone"); process.exit(3);`);
  const got = await runCollector(p, []);
  assert.match(got.problem, /login again: session gone/);
});

test("garbage, a missing script and a hang each name their problem", async () => {
  const garbage = await runCollector(script("bad.mjs", `console.log("<html>")`), []);
  assert.match(garbage.problem, /isn't JSON/);
  const missing = await runCollector(join(dir, "nowhere.mjs"), []);
  assert.match(missing.problem, /not there/);
  const hang = await runCollector(script("slow.mjs", `setTimeout(() => {}, 60000);`), [], { timeoutMs: 500 });
  assert.match(hang.problem, /stopped/);
});

test("a site that throttles is named, not mistaken for an empty page (429)", async () => {
  const none = script(
    "throttled.mjs",
    `console.error("ERROR:made-up.board:response status code 429"); console.log("[]");`,
  );
  const got = await runCollector(none, []);
  assert.deepEqual(got.items, []);
  assert.match(got.problem, /throttling searches from this computer \(429\)/);
  const some = script(
    "partly.mjs",
    `console.error("response status code 429 (blocked)"); console.log(JSON.stringify([{ source: "made-up-board", url: "https://example.com/2", title: "Made-up Keeper" }]));`,
  );
  const part = await runCollector(some, []);
  assert.equal(part.items.length, 1);
  assert.match(part.problem, /throttled part of the search/);
});

test("a browser collector that can't reach the agent's browser says which way: not running, no window, or no connection", async () => {
  const fails = (name: string, words: string) =>
    runCollector(script(name, `console.error(${JSON.stringify(words)}); process.exit(1);`), []);
  const refused = await fails("refused.mjs", "browserType.connectOverCDP: connect ECONNREFUSED 127.0.0.1:9222");
  assert.equal(refused.problem, "the agent's browser isn't running: the run will catch up once it is");
  const windowless = await fails(
    "windowless.mjs",
    "browserType.connectOverCDP: Protocol error (Browser.setDownloadBehavior): Browser context management is not supported.",
  );
  assert.equal(windowless.problem, "the agent's browser has no window open: the next run tries again");
  const other = await fails("timeout.mjs", "browserType.connectOverCDP: Timeout 30000ms exceeded.");
  assert.equal(
    other.problem,
    "couldn't connect to the agent's browser (Timeout 30000ms exceeded): the next run tries again",
  );
});

test("the collector's progress lines reach onLine as they come, one line each, blanks left out", async () => {
  const p = script(
    "progress.mjs",
    `process.stderr.write("made-up-site: 1 scroll for more, 20 ads\\n\\nmade-up-site: 2 scr");
     setTimeout(() => { process.stderr.write("olls for more, 40 ads\\n"); console.log("[]"); }, 50);`,
  );
  const heard: string[] = [];
  await runCollector(p, [], { onLine: (l) => heard.push(l) });
  assert.deepEqual(heard, ["made-up-site: 1 scroll for more, 20 ads", "made-up-site: 2 scrolls for more, 40 ads"]);
});
