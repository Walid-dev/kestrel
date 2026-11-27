// The first live run's failures (2026-11-26), each a test built from what it recorded: ads read as review pages, a
// weight kept as a comfort score, missing values ranked as perfect, names without their brand, the wrong product as an
// offer, stores of the wrong kind, an implied need twice. Real public pages, in short excerpts (fixtures/live-run.ts).
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { Pacer, readStorePage, type Wanted } from "../../ai/shopping/product-data.ts";
import { understandPrompt } from "../../ai/shopping/prompt.ts";
import { type ReadAnswer, WriteAnswer } from "../../ai/shopping/shape.ts";
import { startStandIn } from "../../ai/stand-in.ts";
import { migrate } from "../../db/migrate.ts";
import type { Evidence, Fact, Need } from "../../shared/shopping.ts";
import { loadCategories } from "./categories.ts";
import { checkPage, gatherReviews, reviewText, tierOf } from "./compare.ts";
import { composeList, type Merged, mergeFound, refsOf, type Source } from "./compose.ts";
import {
  COSTCO_KEYBOARD,
  COSTCO_UNSAID,
  CR_PETS,
  GEARLAB,
  GUIDESPOT,
  MAVERICKS,
  RTINGS_PAGE,
  VACUUM_HITS,
  VACUUMWARS,
  VISIONS_OUT,
} from "./fixtures/live-run.ts";
import { accessoryOf, findOffers, searchName, snippetPrice, storesOf, wantedOf } from "./offers.ts";
import { rank } from "./rank.ts";
import { loadHosts, loadRegion, placeOf } from "./region.ts";
import { scrubContext } from "./scrub.ts";
import { addWant, NO_WORDS, offersOf, productsOf, saveOffer, saveProduct, updateWant } from "./store.ts";
import { onceEach } from "./understand.ts";
import { groupsOf, storesFor } from "./verdict.ts";
import { rerank, wantView } from "./view.ts";

const cats = loadCategories(mkdtempSync(join(tmpdir(), "kestrel-live-")));
export function needFor(key: string, over: Partial<Need> = {}): Need {
  const c = cats.find((x) => x.key === key);
  if (!c) throw new Error(`no starter ${key}`);
  return {
    mode: "compare",
    category: c.key,
    name: c.name,
    draft: false,
    words: c.words,
    product: "",
    use: "",
    hard: [],
    implied: [],
    questions: c.questions,
    criteria: c.criteria,
    uses: c.uses,
    searchWords: c.words[0] ?? c.name,
    listSize: c.listSize,
    tags: c.tags,
    traps: c.traps,
    sources: c.sources,
    brands: c.brands,
    storeGroups: c.storeGroups,
    refreshMonths: c.refreshMonths,
    ...over,
  };
}
const answer = (products: ReadAnswer["products"]): ReadAnswer => ({
  method: { buysOwn: true, numbers: true, date: "2026-10" },
  products,
});
const product = (name: string, brand: string, facts: Record<string, { v: unknown; unit?: string; quote: string }>) =>
  ({
    name,
    brand,
    models: [],
    label: "",
    facts,
    pros: [],
    cons: [],
    skip: [],
    price: null,
  }) as ReadAnswer["products"][0];

test("1. an ad is never a review page or a source, whatever its title says", async () => {
  const hosts = loadHosts(loadRegion());
  const read: string[] = [];
  const got = await gatherReviews(["best robot vacuum pet hair"], hosts, {
    search: async () => VACUUM_HITS,
    read: async (url) => {
      read.push(url);
      return VACUUMWARS;
    },
  });
  assert.deepEqual(read, ["https://vacuumwars.com/best-robot-vacuum-for-pet-hair/"]);
  assert.deepEqual(
    got.pages.map((p) => p.url),
    ["https://vacuumwars.com/best-robot-vacuum-for-pet-hair/"],
  );
  assert.ok(got.snippets.every((s) => !s.host.includes("bing")));
  // an ad's page, had it been read, ranks as never: its "Consumer Reports" title buys it nothing
  assert.equal(tierOf(hosts, VACUUM_HITS[2].url, { buysOwn: true, numbers: true, date: null }), "never");
});

test("4. a value under the wrong criterion is refused; units convert; a value outside its range is refused", () => {
  const phones = needFor("headphones");
  const refused: string[] = [];
  const [xm6, xm4] = checkPage(
    answer([
      product("Sony WH-1000XM6", "Sony", {
        comfort: { v: 254, unit: "g", quote: "At 254g it’s comfortable for long sessions" },
        weight: { v: 254, unit: "g", quote: "At 254g it’s comfortable for long sessions" },
        battery: { v: 30, unit: "h", quote: "The 30-hour battery (40 with ANC off)" },
        anc: { v: 87, unit: "%", quote: "SoundGuys’ lab testing measured roughly 87% noise reduction" },
      }),
      product("Sony WH-1000XM4C", "Sony", {
        comfort: { v: 253, unit: "g", quote: "At 253g it’s light enough for long wear" },
        battery: { v: 27, unit: "h", quote: "27 hours of ANC playback still covers a full travel day" },
      }),
    ]),
    MAVERICKS,
    phones,
    "CAD",
    "s1",
    refused,
  );
  assert.equal(xm6.facts.comfort, undefined, "a weight in grams is no comfort score");
  assert.equal(xm4.facts.comfort, undefined);
  assert.deepEqual([xm6.facts.weight?.v, xm6.facts.weight?.unit], [254, "g"]);
  assert.deepEqual([xm6.facts.battery?.v, xm6.facts.battery?.unit], [30, "h"]);
  assert.equal(xm6.facts.anc?.v, 87);
  assert.equal(refused.length, 2);
  assert.match(refused[0], /254 g isn't a comfort score/);

  const jacket = needFor("winter-jacket");
  const [nuuk, heritage] = checkPage(
    answer([
      product("Nuuk Parka", "Fjallraven", {
        warmth: { v: 8.5, quote: "Warmth 8.5" },
        weight: { v: 4.6, unit: "pounds", quote: "At 4.6 pounds (size 2XL), the Nuuk delivers" },
        durability: { v: 9.5, quote: "Construction Quality 9.5" },
      }),
      product("Expedition Parka Heritage", "Canada Goose", {
        hood: { v: 10, quote: "Weather Resistance 10.0" },
        waterproof: { v: true, quote: "Weatherproof" },
        weight: { v: 250, unit: "grams", quote: "Fill Weight | 250 grams/ sq meter" },
      }),
    ]),
    GEARLAB,
    jacket,
    "CAD",
    "s2",
  );
  // 4.6 lb is 2,087 g, kept in the criterion's unit with the page's own words
  assert.deepEqual([nuuk.facts.weight?.v, nuuk.facts.weight?.unit], [2086.52, "g"]);
  assert.equal(nuuk.facts.weight?.quote, "At 4.6 pounds (size 2XL), the Nuuk delivers");
  assert.equal(nuuk.facts.durability?.v, 9.5);
  assert.equal(heritage.facts.hood, undefined, "weather resistance doesn't measure the hood");
  assert.equal(heritage.facts.waterproof, undefined, "weatherproof names the weather, not a waterproof shell");
  assert.equal(heritage.facts.weight, undefined, "grams per square metre is no jacket weight");

  const [carhartt] = checkPage(
    answer([product("Carhartt Men's 103826 Bartlett Jacket", "Carhartt", { weight: { v: 4.65, quote: "4.65 lbs" } })]),
    GUIDESPOT,
    jacket,
    "CAD",
    "s3",
  );
  assert.deepEqual([carhartt.facts.weight?.v, carhartt.facts.weight?.unit], [2109.2, "g"]);
  // a weight with no unit at all, outside the range, never lands as 4.65 g
  const [bare] = checkPage(
    answer([product("Carhartt Men's 103826 Bartlett Jacket", "Carhartt", { weight: { v: 4.65, quote: "4.65" } })]),
    GUIDESPOT,
    jacket,
    "CAD",
    "s3",
  );
  assert.equal(bare.facts.weight, undefined);
});

test("4. a yes needs its quote to say yes: water resistant is no waterproof shell; a no names the weather enough", () => {
  const jacket = needFor("winter-jacket");
  const refused: string[] = [];
  const [nuuk, heritage, rei] = checkPage(
    answer([
      product("Nuuk Parka", "Fjallraven", { waterproof: { v: true, quote: "dense, heavy, waterproof, and warm" } }),
      product("Expedition Parka Heritage", "Canada Goose", { waterproof: { v: true, quote: "Weatherproof" } }),
      product("Stormhenge 850 Down Hybrid Parka", "REI Co-op", { waterproof: { v: true, quote: "Water resistant" } }),
    ]),
    GEARLAB,
    jacket,
    "CAD",
    "s2",
    refused,
  );
  assert.equal(nuuk.facts.waterproof?.v, true);
  assert.equal(heritage.facts.waterproof, undefined);
  assert.equal(rei.facts.waterproof, undefined);
  assert.equal(refused.length, 2);
  assert.match(refused[1], /doesn't say yes to waterproof/);
  // a no with its reason in the page's words is kept; a yes the quote denies is refused
  const page = [
    "## Made-up Summit Parka",
    "Shell: No, DWR finish only",
    "## Made-up Valley Parka",
    "Shell: not waterproof",
  ];
  const [summit, valley] = checkPage(
    answer([
      product("Made-up Summit Parka", "Made-up", { waterproof: { v: false, quote: "No, DWR finish only" } }),
      product("Made-up Valley Parka", "Made-up", { waterproof: { v: true, quote: "not waterproof" } }),
    ]),
    page.join("\n"),
    jacket,
    "CAD",
    "s3",
  );
  assert.equal(summit.facts.waterproof?.v, false);
  assert.equal(valley.facts.waterproof, undefined);
});

test("9. hair wrap reads the right way round: 0% wrapped is the best, a 0 never reads as the worst score", () => {
  const vacuum = needFor("robot-vacuum");
  const tangle = vacuum.criteria.find((c) => c.key === "tangle");
  assert.deepEqual([tangle?.unit, tangle?.better], ["%", "lower"]);
  const [pe] = checkPage(
    answer([
      product("Dreame L60 Ultra PE", "Dreame", {
        tangle: { v: 0, unit: "%", quote: "0% brush wrap" },
        "pickup-hard": { v: 100, unit: "%", quote: "100% flattened pet-hair pickup" },
      }),
    ]),
    VACUUMWARS,
    vacuum,
    "CAD",
    "s1",
  );
  assert.deepEqual([pe.facts.tangle?.v, pe.facts.tangle?.unit], [0, "%"]);
  assert.equal(pe.facts["pickup-hard"]?.v, 100);
  // a lab's hair-wrap score on a 10-point scale is another measure: refused, never ranked the wrong way round
  const [scored] = checkPage(
    answer([product("Dreame L60 Ultra PE", "Dreame", { tangle: { v: 9, quote: "hair wrap 9/10" } })]),
    `${VACUUMWARS}\n## Dreame L60 Ultra PE\nhair wrap 9/10`,
    vacuum,
    "CAD",
    "s1",
  );
  assert.equal(scored.facts.tangle, undefined);
});

test("3. a missing value never counts as perfect: the best measured product leads, the thinly measured stay out", () => {
  // the headphones' facts as the run kept them (the weight under comfort refused, as test 4 does)
  const phones = needFor("headphones", { use: "travel" });
  const ranked = rank(phones, {}, [
    {
      id: "Sony WH-CH730N",
      facts: { weight: f(207, "s6", "g"), multipoint: f(true, "s5") },
      price: null,
      evidence: ev(1, 0, ["s5", "s6"]),
    },
    { id: "Sony LinkBuds Fit", facts: { multipoint: f(true, "s6") }, price: null, evidence: ev(1, 0, ["s6"]) },
    {
      id: "Sennheiser Momentum 4 Wireless",
      facts: { sound: f(8.8, "s7"), battery: f(60, "s7", "h"), multipoint: f(true, "s7") },
      price: null,
      evidence: ev(2, 0, ["s4", "s7"]),
    },
    {
      id: "Sony WH-1000XM6",
      facts: {
        anc: f(87, "s7", "%"),
        sound: f(9.5, "s7"),
        battery: f(30, "s7", "h"),
        weight: f(254, "s7", "g"),
        multipoint: f(true, "s7"),
      },
      price: null,
      evidence: ev(2, 0, ["s5", "s7"]),
    },
    {
      id: "Bose QuietComfort 2nd Gen",
      facts: { weight: f(237.3, "s8", "g") },
      price: null,
      evidence: ev(1, 0, ["s8"]),
    },
    {
      id: "Sony WH-1000XM4C",
      facts: { sound: f(9, "s7"), battery: f(27, "s7", "h"), weight: f(253, "s7", "g"), multipoint: f(true, "s7") },
      price: null,
      evidence: ev(2, 0, ["s5", "s7"]),
    },
    {
      id: "Bowers & Wilkins Px8 S2",
      facts: { sound: f(8.7, "s7"), battery: f(30, "s7", "h"), multipoint: f(true, "s7") },
      price: null,
      evidence: ev(1, 0, ["s7"]),
    },
  ]);
  const by = Object.fromEntries(ranked.map((r) => [r.id, r]));
  assert.equal(by["Sony WH-1000XM6"].place, 1);
  assert.equal(by["Sony WH-1000XM6"].labels[0]?.key, "overall");
  for (const thin of ["Sony WH-CH730N", "Sony LinkBuds Fit", "Bose QuietComfort 2nd Gen"]) {
    assert.equal(by[thin].place, null, thin);
    assert.match(by[thin].out, /^too little measured to rank: \d of \d criteria$/);
  }
  // the order agrees with the labels: the best overall is first, and no finalist outscores it
  const list = ranked.filter((r) => r.place !== null).sort((a, b) => (a.place ?? 0) - (b.place ?? 0));
  assert.ok(
    list.every((r) => (r.score ?? 0) <= (list[0].score ?? 0)),
    JSON.stringify(list.map((r) => [r.id, r.score])),
  );

  // the vacuums: the L40 Ultra and the Jet Bot had only "mop: yes" and sat at 100
  const vacuum = needFor("robot-vacuum", { use: "pets" });
  const v = rank(vacuum, {}, [
    {
      id: "Narwal Freo 20",
      facts: { "pickup-carpet": f(93), navigation: f(23), mop: f(true) },
      price: null,
      evidence: ev(1, 1, ["s1"]),
    },
    { id: "Dreame L40 Ultra", facts: { mop: f(true, "s6") }, price: null, evidence: ev(1, 0, ["s6"]) },
    { id: "Samsung Jet Bot", facts: { mop: f(true, "s6") }, price: null, evidence: ev(1, 0, ["s6"]) },
    {
      id: "Dreame L60 Ultra PE",
      facts: { "pickup-hard": f(100), tangle: f(0, "s1", "%"), navigation: f(21), mop: f(true) },
      price: null,
      evidence: ev(1, 1, ["s1"]),
    },
    {
      id: "Dreame L60 Pro Ultra",
      facts: { "pickup-carpet": f(90), tangle: f(0, "s1", "%"), navigation: f(22), mop: f(true) },
      price: null,
      evidence: ev(1, 1, ["s1"]),
    },
    {
      id: "MOVA V70 Ultra Complete",
      facts: { "pickup-carpet": f(92), "pickup-hard": f(94), navigation: f(23), mop: f(true) },
      price: null,
      evidence: ev(1, 1, ["s1"]),
    },
  ]);
  const vb = Object.fromEntries(v.map((r) => [r.id, r]));
  assert.equal(vb["Dreame L40 Ultra"].place, null);
  assert.equal(vb["Samsung Jet Bot"].place, null);
  const top = v.find((r) => r.place === 1);
  assert.equal(top?.labels[0]?.key, "overall");
  // 0% hair wrapped is the best on that criterion: the two with no tangles lead the others, which have no result there
  assert.ok((vb["Dreame L60 Pro Ultra"].score ?? 0) > (vb["Narwal Freo 20"].score ?? 0));
});

test("2. every finalist says why from its sources, whatever shape the writer answers in; a lost why is logged", async (t) => {
  const vacuum = needFor("robot-vacuum", { use: "pets" });
  const sources: Source[] = [
    {
      ref: "s1",
      host: "vacuumwars.com",
      url: "https://vacuumwars.com/best/",
      title: "",
      tier: "A",
      date: "2026-11",
      read: "page",
      family: "vacuumwars.com",
    },
    {
      ref: "s2",
      host: "rtings.com",
      url: "https://rtings.com/best/",
      title: "",
      tier: "A",
      date: "2026-10",
      read: "page",
      family: "rtings.com",
    },
  ];
  const rec = (name: string, brand: string, source: string, facts: Record<string, number | boolean>) => ({
    source,
    name,
    brand,
    models: [],
    label: "",
    facts: Object.fromEntries(Object.entries(facts).map(([k, v]) => [k, { v, quote: `${name} ${k} ${v}` }])),
    pros: [{ text: `${name} cleaned well`, quote: `${name} cleaned well` }],
    cons: [{ text: `${name} is loud`, quote: `${name} is loud` }],
    skip: [],
    price: null,
  });
  const merged: Merged[] = mergeFound(
    [
      rec("Narwal Freo 20", "Narwal", "s1", { "pickup-carpet": 93, navigation: 23, mop: true }),
      rec("Narwal Freo 20", "Narwal", "s2", { "pickup-carpet": 91 }),
      rec("L60 Pro Ultra", "Dreame", "s1", { "pickup-carpet": 90, tangle: 0, navigation: 22, mop: true }),
      rec("L60 Pro Ultra", "Dreame", "s2", { "pickup-carpet": 89 }),
      rec("MOVA V70 Ultra Complete", "MOVA", "s1", {
        "pickup-carpet": 92,
        "pickup-hard": 94,
        navigation: 23,
        mop: true,
      }),
      rec("MOVA V70 Ultra Complete", "MOVA", "s2", { "pickup-carpet": 92 }),
      rec("X60 Max Ultra Complete", "Dreame", "s1", {
        "pickup-carpet": 89,
        "pickup-hard": 100,
        navigation: 22,
        mop: true,
      }),
      rec("X60 Max Ultra Complete", "Dreame", "s2", { "pickup-carpet": 88 }),
    ],
    sources,
    vacuum,
    { modelRules: [] },
    new Date("2026-11-26T12:00:00Z"),
  );
  // brands kept on the names (problem 7)
  assert.ok(
    merged.some((m) => m.name === "Dreame L60 Pro Ultra"),
    merged.map((m) => m.name).join(", "),
  );
  let batch = 0;
  const door = await startStandIn((body) => {
    const prompt = body.messages.at(-1)?.content ?? "";
    if (prompt.startsWith("Write short reasons")) {
      batch++;
      const ids = [...prompt.matchAll(/^(p\d+) · /gm)].map((m) => m[1]);
      const q = (id: string) => /\[(q\d+)\]/.exec(prompt.slice(prompt.indexOf(`${id} · `)))?.[1] ?? "q1";
      if (batch === 1)
        // the shapes a local model writes: a reason as a plain string with its ref inside, refs as numbers, a source's
        // ref in place of a quote's, the products as an object by id
        return {
          content: JSON.stringify({
            products: Object.fromEntries(
              ids.map((id, i) => [
                id,
                i === 0
                  ? { why: [`It cleaned carpet best in the lab [${q(id)}].`], notFor: "Not for stairs." }
                  : i === 1
                    ? { why: [{ text: "Its carpet result is near the top.", refs: [Number(q(id).slice(1))] }] }
                    : {
                        reasons: [{ sentence: "Strong on carpet.", sources: ["s1"] }],
                        tradeoff: { text: "Louder.", ref: "s1" },
                      },
              ]),
            ),
          }),
        };
      // the second batch's answer cut off, as the first live run's was: 202 characters, no closing brace
      return { content: `{"products": [{"id": "${ids[0]}", "why": [{"text": "It recov` };
    }
    if (prompt.startsWith("Each sentence below"))
      return {
        content: JSON.stringify({
          verdicts: [...prompt.matchAll(/^(\d+)\. /gm)].map((m) => ({ n: Number(m[1]), supported: true })),
        }),
      };
    return { content: "{}" };
  });
  t.after(() => door.close());
  const got = await composeList(
    { seed: "made-up-seed", need: vacuum, answers: {}, budget: null, merged, price: () => null },
    {
      models: { url: door.url, careful: "m", fast: "m", contextChars: 400_000 },
      model: "m",
      checkModel: "m",
      record: () => {},
    },
  );
  const finalists = got.ranked.filter((r) => r.place !== null);
  assert.ok(finalists.length >= 4, JSON.stringify(got.ranked));
  for (const r of finalists) {
    const w = got.words.get(r.id);
    assert.ok(w?.why.length, `${r.id} has no why`);
    assert.ok(
      w?.why.every((s) => s.refs.length && s.refs.every((x) => /^s\d$/.test(x))),
      JSON.stringify(w?.why),
    );
  }
  // the written ones kept, their inline refs out of the text
  const written = [...got.words.values()].flatMap((w) => w.why).map((s) => s.text);
  assert.ok(written.includes("It cleaned carpet best in the lab."), written.join(" | "));
  assert.ok(written.includes("Its carpet result is near the top."));
  assert.ok(written.includes("Strong on carpet."));
  // a number in parentheses is a number, a q in them a ref
  assert.deepEqual(refsOf([], "The battery lasts 30 hours (40 with ANC off) and (40).", new Map()), {
    refs: [],
    text: "The battery lasts 30 hours (40 with ANC off) and (40).",
  });
  assert.deepEqual(refsOf([], "Quiet on carpet (q3, q4).", new Map()), {
    refs: ["q3", "q4"],
    text: "Quiet on carpet.",
  });
  // the cut answer is said, never silent: in the notes and in one line for the run's log
  assert.ok(
    got.notes.some((n) => /couldn't be read: their reasons are their sources' own words/.test(n)),
    got.notes.join(" | "),
  );
  assert.match(got.lost, /^Reasons: \d+ written, \d+ kept .*unread.*(its|their) sources' own words instead$/);
});

test("2. the writer's answer is read in more shapes: ids by name, labelled refs, pairs; a stray product is counted", async (t) => {
  // product ids as names or product_id, trade_offs, quote_refs, a why as a [text, refs] pair, products at the top by id
  const shapes = WriteAnswer.parse({
    p1: { name: "Sony WH-1000XM6", why: ["Best noise cancelling measured", ["q1"]], trade_offs: "Pricey (q2)" },
    p2: { product_id: "p2", why: [{ text: "Long battery", quote_refs: ["q3"] }] },
  });
  assert.deepEqual(
    shapes.products.map((p) => [p.id, p.why.map((w) => [w.text, w.refs]), p.tradeoff?.text ?? null]),
    [
      ["p1", [["Best noise cancelling measured", ["q1"]]], "Pricey (q2)"],
      ["p2", [["Long battery", ["q3"]]], null],
    ],
  );
  const list = WriteAnswer.parse({
    products: [
      { name: "Sony WH-1000XM6", why: "Quiet." },
      { productId: "p3", why: "Light." },
    ],
  });
  assert.deepEqual(
    list.products.map((p) => p.id),
    ["Sony WH-1000XM6", "p3"],
  );
  // refs labelled or alone at the end; a TV's "Q80" stays a name
  const none = new Map<string, string[]>();
  assert.deepEqual(refsOf([], "Quietest on a plane (source: q4).", none), {
    refs: ["q4"],
    text: "Quietest on a plane.",
  });
  assert.deepEqual(refsOf([], "Long battery (refs: q1, q2).", none), { refs: ["q1", "q2"], text: "Long battery." });
  assert.deepEqual(refsOf([], "Best on carpet [quotes: q7]", none), { refs: ["q7"], text: "Best on carpet" });
  assert.deepEqual(refsOf([], "Best on carpet. q5", none), { refs: ["q5"], text: "Best on carpet." });
  assert.deepEqual(refsOf([], "Brighter than the Samsung Q80.", none), {
    refs: [],
    text: "Brighter than the Samsung Q80.",
  });

  // a product the writer names by an id it wasn't given: its sentences counted as lost, never "0 written"
  const vacuum = needFor("robot-vacuum", { use: "pets" });
  const src: Source = {
    ref: "s1",
    host: "vacuumwars.com",
    url: "https://vacuumwars.com/best/",
    title: "",
    tier: "A",
    date: "2026-11",
    read: "page",
    family: "vacuumwars.com",
  };
  const rec = (name: string, f: Record<string, number | boolean>) => ({
    source: "s1",
    name,
    brand: "Made-up",
    models: [],
    label: "",
    facts: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, { v, quote: `${name} ${k} ${v}` }])),
    pros: [],
    cons: [],
    skip: [],
    price: null,
  });
  const merged = mergeFound(
    [
      rec("Made-up R1", { "pickup-carpet": 93, navigation: 23, mop: true, tangle: 0 }),
      rec("Made-up R2", { "pickup-carpet": 90, navigation: 22, mop: true, tangle: 2 }),
    ],
    [src],
    vacuum,
    { modelRules: [] },
    new Date("2026-11-26T12:00:00Z"),
  );
  const door = await startStandIn((body) => {
    const prompt = body.messages.at(-1)?.content ?? "";
    if (prompt.startsWith("Write short reasons")) {
      const ids = [...prompt.matchAll(/^(p\d+) · /gm)].map((m) => m[1]);
      const q = /\[(q\d+)\]/.exec(prompt.slice(prompt.indexOf(`${ids[0]} · `)))?.[1] ?? "q1";
      return {
        content: JSON.stringify({
          products: [
            { id: ids[0], why: [`Top on carpet (source: ${q}).`] },
            { id: "p9", why: ["Strong.", "Quiet."] },
          ],
        }),
      };
    }
    if (prompt.startsWith("Each sentence below"))
      return {
        content: JSON.stringify({
          verdicts: [...prompt.matchAll(/^(\d+)\. /gm)].map((m) => ({ n: Number(m[1]), supported: true })),
        }),
      };
    return { content: "{}" };
  });
  t.after(() => door.close());
  const got = await composeList(
    { seed: "made-up-seed", need: vacuum, answers: {}, budget: null, merged, price: () => null },
    {
      models: { url: door.url, careful: "m", fast: "m", contextChars: 400_000 },
      model: "m",
      checkModel: "m",
      record: () => {},
    },
  );
  assert.ok(
    [...got.words.values()].some((w) => w.why.some((s) => s.text === "Top on carpet.")),
    JSON.stringify([...got.words.values()].map((w) => w.why)),
  );
  assert.match(got.lost, /^Reasons: 3 written, 1 kept \(2 for a product id it wasn't given\)/);
});

test("2. a product the re-rank brings onto the list says why in its sources' words, and the log says so", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db, ":memory:");
  const vacuum = needFor("robot-vacuum", { use: "pets" });
  const want = addWant(db, { words: "a robot vacuum for pet hair" });
  updateWant(db, want, { state: "done", need: vacuum, job: null });
  const facts = (carpet: number, nav: number): Record<string, Fact> => ({
    "pickup-carpet": { v: carpet, unit: "%", ref: "s1", quote: `recovered ${carpet}% of embedded sand` },
    navigation: { v: nav, ref: "s1", quote: `avoided ${nav} of 24 obstacles` },
    mop: { v: true, ref: "s1", quote: "mops as it goes" },
    tangle: { v: 0, unit: "%", ref: "s1", quote: "0% hair wrap" },
  });
  for (const [name, f, why] of [
    ["Made-up R1", facts(93, 23), [{ text: "Best on carpet.", refs: ["s1"] }]],
    ["Made-up R2", facts(90, 22), []],
  ] as const)
    saveProduct(db, want, {
      key: name.toLowerCase(),
      name,
      brand: "Made-up",
      models: [],
      facts: f,
      words: {
        ...NO_WORDS,
        why: why.map((x) => ({ text: x.text, refs: [...x.refs] })),
        pros: [{ text: "cleaned well", refs: ["s1"] }],
      },
      usual: null,
      evidence: ev(2, 1, ["s1"]),
    });
  rerank(db, want, placeOf(loadRegion()), new Date("2026-11-26T12:00:00Z"));
  const view = wantView(db, want, { place: placeOf(loadRegion()) });
  const r2 = view?.products.find((p) => p.name === "Made-up R2");
  assert.ok(r2, "R2 is on the list");
  assert.equal(r2.words.why[0]?.text, "Carpet pickup: “recovered 90% of embedded sand”");
  assert.deepEqual(r2.words.why[0]?.refs, ["s1"]);
  assert.equal(view?.products.find((p) => p.name === "Made-up R1")?.words.why[0]?.text, "Best on carpet.");
  assert.ok(
    view?.log.some((l) => /^Reasons: 1 product came onto the list after the prices .*\(Made-up R2\)$/.test(l.text)),
  );
});

const REACH = { resolve: async () => ["93.184.215.14"], head: async () => ({ status: 200, location: null }) };
const page = (url: string, body: string) => ({
  reach: REACH,
  fetch: (async (input: string | URL | Request) =>
    String(input) === url ? new Response(body, { status: 200 }) : new Response("", { status: 404 })) as typeof fetch,
});
const read = (url: string, body: string, wanted: Wanted) =>
  readStorePage(url, wanted, {
    currency: "CAD",
    storeName: "Store",
    net: page(url, body),
    pacer: new Pacer({ sleep: async () => {} }),
  });

test("5. stock is read against the page's words; an out-of-stock price is still the price level, never where to buy", async () => {
  const visions = await read("https://www.visions.ca/sony-wh-ch730n-headphones-white-whch730n-w", VISIONS_OUT, {
    name: "Sony WH-CH730N",
    brand: "Sony",
    codes: ["WH-CH730N"],
    gtin: null,
  });
  assert.deepEqual([visions.read, visions.price, visions.stock], ["ok", 13_800, "out"]);
  // the data says OutOfStock before the page asks its stock service, and the words say nothing: unknown, not out
  const costco = await read(
    "https://www.costco.ca/p/-/sony-wh-1000xm6-wireless-noise-cancelling-headphones/4000377234",
    COSTCO_UNSAID,
    { name: "Sony WH-1000XM6", brand: "Sony", codes: ["WH-1000XM6"], gtin: null },
  );
  assert.deepEqual([costco.read, costco.price, costco.stock], ["ok", 47_800, "unknown"]);

  // the price level: two finalists, both priced only by pages that don't show them in stock; best value can be named,
  // and no best offer (where to buy now) is claimed
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db, ":memory:");
  const phones = needFor("headphones", { use: "travel" });
  const want = addWant(db, { words: "noise-cancelling headphones for flights" });
  updateWant(db, want, { state: "done", need: phones, job: null });
  const add = (key: string, name: string, facts: Record<string, Fact>, price: number, stock: "out" | "unknown") => {
    const id = saveProduct(db, want, {
      key,
      name,
      brand: "Sony",
      models: [],
      facts,
      words: NO_WORDS,
      usual: null,
      evidence: ev(2, 1, ["s1", "s2"]),
    }) as string;
    saveOffer(db, id, {
      store: "costco.ca",
      url: `https://www.costco.ca/p/${key}`,
      seller: "",
      condition: "new",
      price,
      regular: null,
      shipping: null,
      currency: "CAD",
      stock,
      pickup: null,
      validUntil: null,
      method: "jsonld",
      read: "ok",
      words: "",
      why: "",
    });
    return id;
  };
  const full = { anc: f(87), sound: f(9.5), battery: f(30, "s1", "h"), weight: f(254, "s1", "g"), multipoint: f(true) };
  add("sony wh-1000xm6", "Sony WH-1000XM6", full, 47_800, "unknown");
  add(
    "sony wh-1000xm4c",
    "Sony WH-1000XM4C",
    { ...full, anc: f(85), sound: f(9), battery: f(27, "s1", "h") },
    27_800,
    "out",
  );
  rerank(db, want, placeOf(loadRegion()));
  const view = wantView(db, want, { place: placeOf(loadRegion()) });
  const xm4 = view?.products.find((p) => p.name === "Sony WH-1000XM4C");
  assert.deepEqual([xm4?.price, xm4?.priceFrom, xm4?.best], [27_800, "stock", null]);
  assert.equal(xm4?.priceNote, "$278 at Costco, out of stock");
  assert.ok(
    xm4?.labels.some((l) => l.key === "value"),
    JSON.stringify(view?.products.map((p) => [p.name, p.labels])),
  );
  assert.equal(view?.pricing, "");
});

test("5. a list price a testing review states is kept with its source and its own currency", () => {
  const vacuum = needFor("robot-vacuum");
  const [pe] = checkPage(
    answer([
      {
        ...product("Dreame L60 Ultra PE", "Dreame", { tangle: { v: 0, unit: "%", quote: "0% brush wrap" } }),
        price: { amount: 999.99, currency: "" },
      },
    ]),
    VACUUMWARS,
    vacuum,
    "CAD",
    "s1",
  );
  // a bare "$" on a US site is US dollars: kept, but never as a Canadian price
  assert.deepEqual([pe.price?.cents, pe.price?.currency], [99_999, "USD"]);
  const [heritage] = checkPage(
    answer([{ ...product("Expedition Parka Heritage", "Canada Goose", {}), price: { amount: 1895, currency: "USD" } }]),
    GEARLAB,
    needFor("winter-jacket"),
    "CAD",
    "s2",
  );
  assert.deepEqual([heritage.price?.cents, heritage.price?.currency], [189_500, "USD"]);
  // a price the page doesn't write by the product is never kept
  const [made] = checkPage(
    answer([{ ...product("Nuuk Parka", "Fjallraven", {}), price: { amount: 1895, currency: "USD" } }]),
    GEARLAB.replace("List Price: $1,895", ""),
    needFor("winter-jacket"),
    "CAD",
    "s2",
  );
  assert.equal(made.price, null);
  const [merged] = mergeFound(
    [{ ...pe, source: "s1" }],
    [
      {
        ref: "s1",
        host: "vacuumwars.com",
        url: "https://vacuumwars.com/",
        title: "",
        tier: "A",
        date: "2026-11",
        read: "page",
        family: "vacuumwars.com",
      },
    ],
    vacuum,
    { modelRules: [], currency: "CAD" },
    new Date("2026-11-26T12:00:00Z"),
  );
  assert.equal(merged.usual, null, "never a usual price in the region's currency");
  assert.deepEqual(merged.evidence.list, {
    price: 99_999,
    currency: "USD",
    ref: "s1",
    quote: merged.evidence.list?.quote,
  });
});

test("5. a search result's price for a listed store's page is kept as the search result's, never the best", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db, ":memory:");
  const phones = needFor("headphones");
  const want = addWant(db, { words: "noise-cancelling headphones" });
  updateWant(db, want, { state: "done", need: phones, job: null });
  saveProduct(db, want, {
    key: "sony wh-1000xm6",
    name: "Sony WH-1000XM6",
    brand: "Sony",
    models: ["WH-1000XM6"],
    facts: {},
    words: NO_WORDS,
    usual: null,
    evidence: ev(2, 1, ["s1"]),
  });
  const [p] = productsOf(db, want);
  const region = loadRegion();
  const asked: string[] = [];
  await findOffers(db, [p], phones, {
    region,
    read: true,
    search: async (q) => {
      asked.push(q);
      return q.includes("site:")
        ? []
        : [
            {
              title: "Sony WH-1000XM6 Wireless Noise Cancelling Headphones | Best Buy Canada",
              url: "https://www.bestbuy.ca/en-ca/product/sony-wh-1000xm6/18931234",
              snippet: "Sony WH-1000XM6 Over-Ear Noise Cancelling Headphones - Black. $499.99. Free shipping.",
            },
          ];
    },
    readPage: async () => {
      throw new Error("no page is read in this test");
    },
    scrub: scrubContext({ words: "noise-cancelling headphones", budget: null, note: "" }, phones),
    now: () => new Date("2026-11-26T12:00:00Z"),
  });
  assert.equal(asked[0], '"Sony WH-1000XM6" canada');
  const bestbuy = offersOf(db, p.id).find((o) => o.store === "bestbuy.ca");
  assert.deepEqual(
    [bestbuy?.read, bestbuy?.price, bestbuy?.url],
    ["link", 49_999, "https://www.bestbuy.ca/en-ca/product/sony-wh-1000xm6/18931234"],
  );
  assert.match(bestbuy?.why ?? "", /a search result shows this price/);
  const view = wantView(db, want, { place: placeOf(region) });
  const xm6 = [...(view?.products ?? []), ...(view?.also ?? [])][0];
  assert.deepEqual([xm6.price, xm6.priceFrom, xm6.best], [49_999, "snippet", null]);
  assert.equal(xm6.priceNote, "$499.99 in a search result for Best Buy, not read on its page");
  assert.equal(snippetPrice("From US$499.99 at the maker", "CAD"), null);
  assert.equal(snippetPrice("Only $41.67/mo for 12 months", "CAD"), null);
});

test("5. a search result's words give a price only when it is surely the product's, and it never meets the budget", async () => {
  const codes = ["WH-1000XM6"];
  const cents = (s: string) => snippetPrice(s, "CAD", codes)?.cents ?? null;
  // a saving, a former price, a threshold: never the price
  assert.equal(cents("Save $100.00 on the Sony WH-1000XM6. Now $449.99 at Best Buy."), 44_999);
  assert.equal(cents("Get $50 off Sony WH-1000XM6 Wireless Noise Cancelling Headphones"), null);
  assert.equal(cents("Sony WH-1000XM6 Was $549.99 now $449.99"), 44_999);
  assert.equal(cents("Sony WH-1000XM6 $449.99 Reg. $549.99. Free shipping on orders over $35."), 44_999);
  assert.equal(cents("Sony WH-1000XM6 (-$100) $449.99"), 44_999);
  // two prices: the one the code sits right before, else none
  assert.equal(cents("Sony WH-1000XM6 $449.99 · Sony WH-1000XM5 $349.99"), 44_999);
  assert.equal(cents("Headphones from $199.99 to $649.99 at Best Buy"), null);
  // an accessory's result: its code in the title, its price another thing's
  const xm6 = { name: "Sony WH-1000XM6", brand: "Sony" };
  assert.equal(accessoryOf("Sony WH-1000XM6 Replacement Ear Pads | Best Buy Canada", xm6), true);
  assert.equal(accessoryOf("Hard Case for Sony WH-1000XM6 Headphones", xm6), true);
  assert.equal(accessoryOf("Sony WH-1000XM6 Wireless Noise Cancelling Headphones | Best Buy Canada", xm6), false);

  // a search result's price is shown, never ranked: over the budget, it drops nothing; the budget stays unknown
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db, ":memory:");
  const phones = needFor("headphones", { listSize: 3 });
  const want = addWant(db, { words: "noise-cancelling headphones", budget: 300 });
  updateWant(db, want, { state: "done", need: phones, job: null });
  const facts = (anc: number, battery: number, calls: number): Record<string, Fact> => ({
    anc: { v: anc, ref: "s1", quote: `anc ${anc}` },
    battery: { v: battery, unit: "h", ref: "s1", quote: `${battery} hours` },
    calls: { v: calls, ref: "s1", quote: `calls ${calls}` },
    sound: { v: 8, ref: "s1", quote: "sound 8" },
  });
  for (const [name, f] of [
    ["Sony WH-1000XM6", facts(9.5, 30, 8.5)],
    ["Bose QuietComfort Ultra", facts(9, 24, 8)],
  ] as const)
    saveProduct(db, want, {
      key: name.toLowerCase(),
      name,
      brand: name.split(" ")[0],
      models: name === "Sony WH-1000XM6" ? ["WH-1000XM6"] : [],
      facts: f,
      words: NO_WORDS,
      usual: null,
      evidence: ev(2, 1, ["s1"]),
    });
  const xm6Row = productsOf(db, want).find((p) => p.name === "Sony WH-1000XM6");
  assert.ok(xm6Row);
  saveOffer(db, xm6Row.id, {
    store: "bestbuy.ca",
    url: "https://www.bestbuy.ca/en-ca/product/sony-wh-1000xm6-replacement-ear-pads/1",
    seller: "",
    condition: "new",
    price: 2_999,
    regular: null,
    shipping: null,
    currency: "CAD",
    stock: "unknown",
    pickup: null,
    validUntil: null,
    method: "link",
    read: "link",
    words: "Save $100.00",
    why: "a search result shows this price: kestrel didn't read it on the store's page",
  });
  saveOffer(db, xm6Row.id, {
    store: "thesource.ca",
    url: "https://www.thesource.ca/sony-wh-1000xm6",
    seller: "",
    condition: "new",
    price: 99_999,
    regular: null,
    shipping: null,
    currency: "CAD",
    stock: "unknown",
    pickup: null,
    validUntil: null,
    method: "link",
    read: "link",
    words: "$999.99",
    why: "a search result shows this price: kestrel didn't read it on the store's page",
  });
  rerank(db, want, placeOf(loadRegion()));
  const view = wantView(db, want, { place: placeOf(loadRegion()) });
  const shown = [...(view?.products ?? []), ...(view?.also ?? [])].find((p) => p.name === "Sony WH-1000XM6");
  assert.ok(shown);
  assert.equal(shown.priceFrom, "snippet");
  assert.notEqual(shown.place, null, shown.out);
  assert.ok(!/over the budget/.test(shown.out), shown.out);
  assert.equal(shown.budget, "unknown");
  assert.ok(!(view?.products ?? []).some((p) => p.labels.some((l) => l.key === "budget" || l.key === "value")));
});

test("6. the wrong product is never an offer: a store search uses the brand and the model, and the page must show both", async () => {
  const parka = { name: "REI Co-op Stormhenge 850 Down Hybrid Parka", brand: "REI Co-op", models: ["850"] };
  assert.equal(searchName(parka), "REI Co-op Stormhenge 850 Down Hybrid Parka");
  assert.deepEqual(wantedOf(parka).codes, ["Stormhenge 850 Down Hybrid Parka"]);
  assert.equal(searchName({ name: "Sony WH-1000XM6", brand: "Sony", models: ["WH-1000XM6"] }), "Sony WH-1000XM6");
  assert.equal(
    searchName({ name: "Canada Goose Expedition Parka Heritage", brand: "Canada Goose", models: ["Heritage"] }),
    "Canada Goose Expedition Parka Heritage",
  );
  const got = await read(
    "https://www.costco.ca/p/-/incase-desktop-850-wireless-optical-keyboard-mouse-bundle/4201028003",
    COSTCO_KEYBOARD,
    {
      name: "Stormhenge 850 Down Hybrid Parka",
      brand: "REI Co-op",
      codes: ["850", "Stormhenge 850 Down Hybrid Parka"],
      gtin: null,
    },
  );
  assert.deepEqual([got.read, got.price], ["mismatch", null]);
  assert.match(got.why, /doesn't name REI Co-op/);
});

test("7. every product keeps its brand, from its sources: shown and searched with it", () => {
  const vacuum = needFor("robot-vacuum");
  const [l40] = checkPage(
    answer([product("L40 Ultra", "", { mop: { v: true, quote: "very good at mopping up dried stains" } })]),
    CR_PETS,
    vacuum,
    "CAD",
    "s6",
  );
  assert.equal(l40.brand, "Dreame", "the brand the page writes right before the name");
  const sources: Source[] = [
    {
      ref: "s6",
      host: "consumerreports.org",
      url: "https://consumerreports.org/",
      title: "",
      tier: "A",
      date: "2026-03",
      read: "page",
      family: "cr",
    },
  ];
  const [m] = mergeFound([l40], sources, vacuum, { modelRules: [] }, new Date("2026-11-26T12:00:00Z"));
  assert.equal(m.name, "Dreame L40 Ultra");
  assert.equal(searchName(m), "Dreame L40 Ultra");
  const [nuuk] = mergeFound(
    [{ ...l40, name: "Nuuk Parka", brand: "Fjällräven" }],
    sources,
    needFor("winter-jacket"),
    { modelRules: [] },
    new Date("2026-11-26T12:00:00Z"),
  );
  assert.equal(nuuk.name, "Fjällräven Nuuk Parka");
});

test("8. stores by kind: a winter jacket is looked for where outdoor clothing sells in Canada, and at its maker's", () => {
  const region = loadRegion();
  const jacket = needFor("winter-jacket");
  const names = storesOf(region, jacket, "Canada Goose").map((s) => s.name);
  for (const s of ["Canada Goose (its own store)", "MEC", "Sport Chek", "Sail", "Altitude Sports", "Simons"])
    assert.ok(names.includes(s), `${s} missing: ${names.join(", ")}`);
  for (const s of ["Home Depot", "RONA", "Costco"])
    assert.ok(!names.includes(s), `${s} sells no parkas: ${names.join(", ")}`);
  // every category's groups name stores, and each store's group is one a category uses
  for (const c of cats) assert.ok(storesOf(region, needFor(c.key), "").length >= 6, c.key);
  const vac = storesOf(region, needFor("robot-vacuum"), "Narwal").map((s) => s.name);
  assert.ok(
    vac.includes("Narwal (its own store)") && vac.includes("Best Buy") && !vac.includes("Newegg"),
    vac.join(", "),
  );
});

test("8. a drafted kind's store groups meet the region's by their words; none met means every store", () => {
  const region = loadRegion();
  // the second live run's stand mixer: three groups no store had, so no store at all
  const mixer = storesOf(region, { storeGroups: ["kitchen-appliances", "home-kitchen", "department-store"] }, "").map(
    (s) => s.name,
  );
  for (const s of ["Costco", "IKEA", "Best Buy", "Canadian Tire"])
    assert.ok(mixer.includes(s), `${s} missing: ${mixer.join(", ")}`);
  for (const s of ["Altitude Sports", "MEC"])
    assert.ok(!mixer.includes(s), `${s} sells no mixers: ${mixer.join(", ")}`);
  const monitor = storesFor(region, ["computer"]).map((s) => s.name);
  assert.ok(monitor.includes("Memory Express") && monitor.includes("Canada Computers"), monitor.join(", "));
  assert.equal(storesFor(region, ["department-store"]).length, region.stores.length);
  // a drafted kind picks from the region's groups
  const prompt = understandPrompt(
    { words: "a stand mixer", budget: null, note: "" },
    [],
    null,
    "CAD",
    groupsOf(region),
  );
  assert.match(
    prompt,
    /storeGroups: the kinds of store that sell it, from these only: appliances, clothing, computers, /,
  );
});

test("9. an implied need is said once, whatever its article or case", () => {
  assert.deepEqual(
    onceEach(["tangle-resistant brushroll", "a tangle-resistant brushroll", "A Tangle-Resistant Brushroll."]),
    ["tangle-resistant brushroll"],
  );
  // one inside a longer one gives way to it
  assert.deepEqual(onceEach(["strong noise cancelling for flights", "strong noise cancelling"]), [
    "strong noise cancelling for flights",
  ]);
});

test("a tester's page whose picks live in its data is read: its prose under each pick's title and product", () => {
  const text = reviewText(RTINGS_PAGE);
  assert.match(text, /^## Best Travel Headphones: Sony WH-1000XM6$/m);
  assert.match(text, /The Sony WH-1000XM6 are the best travel headphones we've tested\./);
  assert.match(text, /^## Best Mid-Range Travel Headphones: JBL Live 780NC$/m);
  assert.equal(text.match(/best travel headphones we've tested/g)?.length, 1, "a copy of the same words, once");
  assert.ok(!/XXXX/.test(text), "a placeholder copy never");
  // the picks then read as any page: the product named, its value checked against its words
  const [xm6] = checkPage(
    answer([
      product("Sony WH-1000XM6", "Sony", {
        battery: { v: 32, unit: "hours", quote: "the battery lasts for close to 32 hours" },
      }),
    ]),
    text,
    needFor("headphones"),
    "CAD",
    "s1",
  );
  assert.deepEqual([xm6.facts.battery?.v, xm6.facts.battery?.unit], [32, "h"]);
});

export const ev = (sources: number, a: number, refs: string[]): Evidence => ({
  sources,
  a,
  b: sources - a,
  newest: "2026-11",
  thin: sources < 2,
  old: false,
  refs,
});
export const f = (v: number | boolean, ref = "s1", unit?: string): Fact => ({
  v,
  ref,
  quote: String(v),
  ...(unit ? { unit } : {}),
});
