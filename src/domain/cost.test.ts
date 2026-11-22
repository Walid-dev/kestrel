// The cost figures from a made-up oMLX table: totals add up, a priced model costs its tokens, an unpriced one is
// "no reference price" (never 0), peak hours pay full and off-peak their share, and the month has 30 days.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { costReport, summarize, usageHours } from "./cost.ts";

const PRICES = {
  cloud: [
    {
      id: "hosted",
      name: "The same models, hosted",
      prices: [
        {
          match: "careful",
          model: "made-up-hosted",
          input: 1,
          cachedInput: 0.1,
          output: 2,
          source: "https://example.com/p",
          seen: "2026-11-01",
        },
      ],
    },
  ],
  electricity: {
    watts: 50,
    wattsSource: "a made-up meter",
    pricePerKwh: 0.2,
    currency: "CAD",
    source: "https://example.com/e",
    seen: "2026-11-01",
  },
};

function setup() {
  const home = mkdtempSync(join(tmpdir(), "kestrel-omlx-"));
  const db = new DatabaseSync(join(home, "usage.sqlite3"));
  db.exec(`CREATE TABLE model_usage_hourly (timestamp_hour INTEGER, model_id TEXT, requests INTEGER, prompt_tokens INTEGER,
    cached_tokens INTEGER, completion_tokens INTEGER, prefill_seconds REAL, generation_seconds REAL)`);
  const now = Math.floor(Date.now() / 1000 / 3600) * 3600;
  const put = db.prepare("INSERT INTO model_usage_hourly VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  put.run(now - 3600, "careful-model", 10, 1_000_000, 400_000, 100_000, 1800, 1800);
  put.run(now - 7200, "fast-model", 5, 200_000, 0, 50_000, 900, 900);
  db.close();
  const prices = join(home, "prices.json");
  writeFileSync(prices, JSON.stringify(PRICES));
  return { home, prices };
}

test("totals add up; a priced model costs its tokens; an unpriced one is no reference price, never 0", () => {
  const { home, prices } = setup();
  const r = costReport(home, prices, "all");
  assert.equal(r.total.requests, 15);
  assert.equal(r.total.fresh, 800_000);
  assert.equal(r.total.reused, 400_000);
  assert.equal(r.total.out, 150_000);
  assert.equal(r.total.computeHours, 1.5);
  // careful: 600k fresh × $1 + 400k cached × $0.1 + 100k out × $2 = 0.6 + 0.04 + 0.2
  assert.equal(r.total.cloud[0].usd, 0.84);
  assert.deepEqual(r.total.cloud[0].unpriced, ["fast-model"]);
  assert.deepEqual(r.total.electricity, { kwh: 0.075, cost: 0.015, currency: "CAD" });
  assert.equal(r.daily.length, 30);
  assert.equal(
    r.daily.reduce((a, d) => a + d.tokens, 0),
    1_350_000,
  ); // both hours fall inside the 30 days
});

test("a model no price matches at all reads as no reference price", () => {
  const out = summarize(
    [{ hour: 0, model: "fast-model", requests: 1, prompt: 10, cached: 0, output: 5, seconds: 1 }],
    PRICES as never,
  );
  assert.equal(out.total.cloud[0].usd, null);
});

test("no home set, or no table: the reason in words", () => {
  assert.throws(() => usageHours(""), /isn't set/);
  assert.throws(() => usageHours(mkdtempSync(join(tmpdir(), "kestrel-none-"))), /isn't there/);
});
