// The categories: the six starters load; a drafted key that isn't one, or that reaches outside its folder, is refused
// and a safe key made from the kind's name; a draft never takes a starter's key; weights scale to 100; a broken file is
// left out alone.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadCategories, matchCategory, saveDraft, toHundred } from "./categories.ts";

const dir = () => mkdtempSync(join(tmpdir(), "kestrel-cats-"));
const criteria = [
  { key: "heat", label: "Heat", type: "number", unit: "°C", better: "higher", weight: 3 },
  { key: "auto-off", label: "Auto off", type: "bool", better: "higher", weight: 1 },
  { key: "plate", label: "Plate", type: "number", better: "higher", weight: 1 },
  { key: "build", label: "Build", type: "score", better: "higher", weight: 1 },
];

test("the six starters load, and my words find theirs", () => {
  const list = loadCategories(dir());
  assert.deepEqual(list.map((c) => c.key).sort(), [
    "headphones",
    "laptop",
    "robot-vacuum",
    "tv",
    "winter-boots",
    "winter-jacket",
  ]);
  for (const c of list)
    assert.equal(
      c.criteria.reduce((n, x) => n + x.weight, 0),
      100,
      c.key,
    );
  assert.equal(matchCategory("a robot vacuum that handles pet hair", list)?.key, "robot-vacuum");
  assert.equal(matchCategory("noise-cancelling headphones", list)?.key, "headphones");
  assert.equal(matchCategory("a kettle", list), null);
});

test("a bad key or one outside the folder is refused; a draft never takes a starter's key", () => {
  const d = dir();
  const list = loadCategories(d);
  const outside = saveDraft({ key: "../settings", name: "Bike phone mount", criteria }, list, d);
  assert.equal(outside.key, "bike-phone-mount");
  assert.ok(existsSync(join(d, "bike-phone-mount.json")));
  assert.deepEqual(readdirSync(d), ["bike-phone-mount.json"]); // nothing written outside the folder
  assert.throws(() => saveDraft({ key: "../..", name: "/", criteria }, list, d), /no usable key/);
  const tv = saveDraft({ key: "tv", name: "TV", criteria }, list, d);
  assert.equal(tv.key, "tv-2");
  assert.equal(tv.draft, true);
  assert.equal(tv.listSize, 6);
  assert.equal(loadCategories(d).find((c) => c.key === "tv")?.draft, false); // the starter still answers to tv
  assert.deepEqual(
    tv.criteria.map((c) => c.weight),
    [49, 17, 17, 17],
  );
  assert.throws(
    () => saveDraft({ key: "thin", name: "Thin", criteria: criteria.slice(0, 2) }, list, d),
    /doesn't read/,
  );
});

test("a hand-written file replaces a starter; a broken one is left out alone", () => {
  const d = dir();
  const mine = { ...loadCategories(d).find((c) => c.key === "tv"), name: "My TV", draft: false };
  writeFileSync(join(d, "tv.json"), JSON.stringify(mine));
  writeFileSync(join(d, "broken.json"), "{ not json");
  const list = loadCategories(d);
  assert.equal(list.find((c) => c.key === "tv")?.name, "My TV");
  assert.equal(list.length, 6);
  assert.deepEqual(
    toHundred([
      { key: "a", label: "A", type: "score", better: "higher", weight: 1 },
      { key: "b", label: "B", type: "score", better: "higher", weight: 2 },
    ]).map((c) => c.weight),
    [33, 67],
  );
});
