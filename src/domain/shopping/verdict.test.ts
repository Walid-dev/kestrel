// The deal judge on made-up histories: each word and each boundary of its order; day 29 states the facts; a month-long
// sale read 30 to 149 days is never called inflated; 150 of 180 days with the "was" price on under half is; another
// store under the "was" price for 30 days is; a price from the page's words never counts; the policies line.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Method } from "../../shared/shopping.ts";
import type { Store } from "./region.ts";
import type { Reading } from "./store.ts";
import { policyLine, type VerdictInput, verdict } from "./verdict.ts";

const NOW = new Date("2026-11-25T12:00:00Z");
const DAY = 86_400_000;
// one reading a day for `days` days up to today, its price by how many days ago
const daily = (
  offer: string,
  store: string,
  days: number,
  price: (ago: number) => number,
  method: Method = "jsonld",
  regular: number | null = 59_900,
): Reading[] =>
  Array.from({ length: days }, (_, i) => {
    const ago = days - 1 - i;
    return {
      offer,
      store,
      condition: "new",
      at: new Date(NOW.getTime() - ago * DAY).toISOString(),
      price: price(ago),
      regular,
      stock: "in",
      method,
    };
  });
const judge = (
  readings: Reading[],
  price: number,
  regular: number | null = 59_900,
  extra: Partial<VerdictInput> = {},
) =>
  verdict({
    readings,
    best: { offer: "o1", store: "store-a.example", price, regular },
    target: null,
    stores: [],
    links: [],
    storeName: (d) => d,
    currency: "CAD",
    now: NOW,
    ...extra,
  });

test("under 30 days of readings states the facts and never judges; day 30 judges", () => {
  const nine = judge(
    daily("o1", "store-a.example", 9, (ago) => (ago === 0 ? 44_900 : 49_900)),
    44_900,
  );
  assert.equal(nine.word, "history");
  assert.equal(
    nine.line,
    `Lowest in the 8 days read, 25% under its regular price. The "was" price hasn't been seen in the 8 days read.`,
  );
  const day29 = judge(
    daily("o1", "store-a.example", 30, () => 44_900),
    44_900,
  );
  assert.equal(day29.word, "history"); // the first reading 29 days ago
  const day30 = judge(
    daily("o1", "store-a.example", 31, () => 44_900),
    44_900,
  );
  assert.notEqual(day30.word, "history");
});

test("a month-long sale read 30 to 149 days is never inflated: the line states the fact", () => {
  const sale = judge(
    daily("o1", "store-a.example", 120, () => 44_900),
    44_900,
  );
  assert.equal(sale.word, "typical"); // flat: not a new low, not good
  assert.match(sale.line, /The "was" price hasn't been seen in the 119 days kestrel has read\./);
});

test("inflated: 150 of the last 180 days read with the was price on under half; or another store under it for 30 days", () => {
  // 160 days: the was price on the first 60 of them, then the "sale"
  const long = judge(
    daily("o1", "store-a.example", 160, (ago) => (ago >= 100 ? 59_900 : 44_900)),
    44_900,
  );
  assert.equal(long.word, "inflated");
  assert.match(long.line, /showed on 60 of the 160 days kestrel read it; still the lowest kestrel has read\./);
  // 149 days read: not firm ground yet
  const short = judge(
    daily("o1", "store-a.example", 149, (ago) => (ago >= 100 ? 59_900 : 44_900)),
    44_900,
  );
  assert.notEqual(short.word, "inflated");
  const other = judge(
    [...daily("o1", "store-a.example", 40, () => 54_900), ...daily("o2", "store-b.example", 31, () => 52_900)],
    54_900,
  );
  assert.equal(other.word, "inflated");
  assert.match(other.line, /store-b\.example sold it under the "was" price of \$599 on every reading for 30 days/);
});

test("new low by 1% at least; good, high and typical against the 90-day median", () => {
  const history = (cur: number) => [
    ...daily("o1", "store-a.example", 60, (ago) => (ago === 0 ? cur : 50_000)),
    ...daily("o2", "store-b.example", 50, () => 52_000),
  ];
  assert.equal(judge(history(49_500), 49_500, null).word, "new-low"); // exactly 1% under
  assert.equal(judge(history(49_600), 49_600, null).word, "typical"); // 0.8% under: the low isn't under the median
  // a price that moves: at the 90-day low is good, 10% under the median is good, 10% over is high
  // three readings in four at $560, one at $480: the median $560, the low $480
  const moving = (cur: number) =>
    daily("o1", "store-a.example", 60, (ago) => (ago === 0 ? cur : ago % 4 === 1 ? 48_000 : 56_000));
  assert.equal(judge(moving(48_000), 48_000, null).word, "good");
  assert.equal(judge(moving(50_400), 50_400, null).word, "good"); // 10% under the median
  assert.equal(judge(moving(57_000), 57_000, null).word, "typical");
  assert.equal(judge(moving(61_600), 61_600, null).word, "high"); // 10% over
  assert.match(judge(moving(61_600), 61_600, null).line, /^10% over the 90-day median of \$560\./);
});

test("a price from the page's words never counts; my target and the policies are said", () => {
  const readings = [
    ...daily("o1", "store-a.example", 60, (ago) => (ago === 0 ? 49_000 : 50_000)),
    ...daily("o9", "store-t.example", 10, () => 30_000, "text"),
  ];
  const v = judge(readings, 49_000, null, { target: 49_500 });
  assert.equal(v.word, "new-low"); // the $300 read from a page's words is ignored
  assert.match(v.line, /At my target of \$495\.$/);
  const stores: Store[] = [
    {
      domain: "a.example",
      name: "Store A",
      groups: [],
      read: "page",
      searchUrl: "https://a.example/?q={q}",
      matches: { who: "local stores", beats: 5, checked: "2026-11-25" },
    },
    {
      domain: "b.example",
      name: "Store B",
      groups: [],
      read: "page",
      searchUrl: "https://b.example/?q={q}",
      protects: { days: 30, checked: "2026-11-25" },
    },
  ];
  assert.equal(policyLine(stores), "Price match: Store A (beats by 5%) · Refunds a later drop: Store B 30 days");
  assert.equal(policyLine([]), "");
});
