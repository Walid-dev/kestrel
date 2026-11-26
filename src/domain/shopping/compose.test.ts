// The merge and the number check: records with a shared code (another region's suffix read as this region's) or the
// same brand and name are one product; a measured value comes from the one source that covers most products, the
// others kept as notes and a gap over 10% as a conflict; a forum alone never brings a product. A sentence naming
// "Fen 300" keeps its number check to what it claims, the names taken out first.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Need } from "../../shared/shopping.ts";
import type { Found } from "./compare.ts";
import { mergeFound, numbersHold, type Source, withoutNames } from "./compose.ts";
import { MADE_UP_NEED } from "./made-up.ts";

const SOURCES: Source[] = [
  {
    ref: "s1",
    host: "labs.example",
    url: "https://labs.example/a",
    title: "",
    tier: "A",
    date: "2026-10",
    read: "page",
    family: "labs",
  },
  {
    ref: "s2",
    host: "bench.example",
    url: "https://bench.example/b",
    title: "",
    tier: "A",
    date: "2026-09",
    read: "page",
    family: "bench",
  },
  {
    ref: "s3",
    host: "forum.example",
    url: "https://forum.example/c",
    title: "",
    tier: "C",
    date: "2026-11",
    read: "page",
    family: "forum",
  },
];
const found = (source: string, name: string, models: string[], noise?: number): Found => ({
  source,
  name,
  brand: name.split(" ")[0],
  models,
  label: "",
  facts: noise === undefined ? {} : { noise: { v: noise, unit: "dB", quote: `${noise} dB` } },
  pros: [],
  cons: [],
  skip: [],
  price: null,
});
const NEED: Need = { ...MADE_UP_NEED, sources: ["labs.example", "bench.example"] };

test("one product per shared code or name; a measured value from the source that covers most; a forum alone never in", () => {
  const merged = mergeFound(
    [
      found("s1", "Vistra A9", ["XR55A9ZC"], 64),
      found("s2", "Vistra A9 OLED", ["XR55A9ZA"], 72),
      found("s1", "Brisk R7", ["R7-C"], 62),
      found("s1", "Fen 300", ["F300"], 60),
      found("s2", "Fen 300", [], 61),
      found("s3", "ZapVac Z1", ["Z1"], 40),
    ],
    SOURCES,
    NEED,
    { modelRules: [{ brand: "Vistra", here: "ZC", elsewhere: ["ZA"] }] },
    new Date("2026-11-25T12:00:00Z"),
  );
  assert.deepEqual(
    merged.map((m) => m.name),
    ["Vistra A9", "Brisk R7", "Fen 300"],
  );
  const tv = merged[0];
  assert.deepEqual(tv.models, ["XR55A9ZC", "XR55A9ZA"]);
  assert.equal(tv.evidence.sources, 2);
  assert.equal(tv.evidence.thin, false);
  // labs.example covers three products on noise, bench.example two: the lab's value, the bench's as a note
  assert.equal(tv.facts.noise?.v, 64);
  assert.equal(tv.facts.noise?.ref, "s1");
  assert.deepEqual(
    tv.facts.noise?.others?.map((o) => o.v),
    [72],
  );
  assert.equal(tv.conflicts.length, 1);
  assert.match(tv.conflicts[0].text, /64 dB in one source and 72 dB/);
  assert.equal(merged[2].conflicts.length, 0); // 60 against 61: within 10%
  assert.equal(merged[1].evidence.thin, true);
});

test("the names come out before the number check, so a correct sentence naming Fen 300 stays and a wrong number goes", () => {
  const products = [
    { name: "Fen 300", brand: "Fen", models: ["F300"] },
    { name: "Brisk R5", brand: "Brisk", models: ["R5-C"] },
  ];
  assert.equal(
    withoutNames("The Fen 300 beat the Brisk R5-C.", products).replace(/\s+/g, " ").trim(),
    "The beat the .",
  );
  assert.equal(
    numbersHold("The Fen 300 measured 60 dB, quieter than the Brisk R5.", ["60 dB at full power"], products),
    true,
  );
  assert.equal(numbersHold("The Fen 300 measured 58 dB.", ["60 dB at full power"], products), false);
  // without the strip, the model's name would need a 300 in its quote
  assert.equal(numbersHold("The F300 runs 130 minutes.", ["130 minutes per charge"], products), true);
});
