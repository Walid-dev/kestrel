// A table of made-up beekeeping jobs scores as labelled: the engine is rules, so the labels are exact.
import assert from "node:assert/strict";
import { test } from "node:test";
import { leftOutOf, outsideOf, scoreJob } from "./score.ts";

const NOW = new Date("2026-11-21T12:00:00Z");
const scoring = {
  title: { want: ["keeper", "wrangler"], avoid: ["intern"] },
  skills: ["Apiary", "Smoker", "Hive", "Wax"],
  level: { want: ["head"], avoid: ["apprentice"] },
  pay: { floor: 100_000, usdToCad: 1.38 },
  places: { words: ["Hiveton"], remoteOk: true },
  freshDays: 7,
};

test("a strong match scores great, with its why readable", () => {
  const got = scoreJob(
    scoring,
    {
      title: "Head Hive Keeper",
      location: "Hiveton",
      seniority: "Head",
      salaryMax: 150_000,
      salaryCurrency: "CAD",
      posted: "2026-11-20",
      excerpt: "Apiary, Smoker and Hive work on a Wax farm.",
    },
    NOW,
  );
  assert.equal(got.match, "great");
  assert.ok(got.score >= 80);
  assert.match(got.why, /title matches/);
});

test("an avoided title word zeroes the title part; US only zeroes the place", () => {
  const intern = scoreJob(scoring, { title: "Keeper Intern", posted: "2026-11-20" }, NOW);
  assert.equal(intern.parts.title, 0);
  assert.match(intern.why, /intern/);
  const us = scoreJob(scoring, { title: "Head Keeper", usOnly: true, posted: "2026-11-20" }, NOW);
  assert.equal(us.parts.place, 0);
  assert.match(us.why, /US only/);
});

test("pay under the floor says so; unstated pay takes the middle road; USD converts", () => {
  const low = scoreJob(
    scoring,
    { title: "Head Keeper", salaryMax: 60_000, salaryCurrency: "CAD", posted: "2026-11-20" },
    NOW,
  );
  assert.equal(low.parts.pay, 0);
  assert.match(low.why, /under the floor/);
  const unstated = scoreJob(scoring, { title: "Head Keeper", posted: "2026-11-20" }, NOW);
  assert.equal(unstated.parts.pay, 6);
  const usd = scoreJob(
    scoring,
    { title: "Head Keeper", salaryMax: 80_000, salaryCurrency: "USD", posted: "2026-11-20" },
    NOW,
  );
  assert.equal(usd.parts.pay, 10); // 80k USD clears a 100k CAD floor at 1.38
  const monthly = scoreJob(
    scoring,
    { title: "Head Keeper", salaryMax: 10_000, salaryPeriod: "monthly", posted: "2026-11-20" },
    NOW,
  );
  assert.equal(monthly.parts.pay, 10); // 10k a month is 120k a year, over the floor
  const weekly = scoreJob(
    scoring,
    { title: "Head Keeper", salaryMax: 2_300, salaryPeriod: "weekly", posted: "2026-11-20" },
    NOW,
  );
  assert.equal(weekly.parts.pay, 10);
  const hourly = scoreJob(
    scoring,
    { title: "Head Keeper", salaryMax: 60, salaryPeriod: "hourly", posted: "2026-11-20" },
    NOW,
  );
  assert.equal(hourly.parts.pay, 10);
});

test("freshness fades: full inside the window, half after, nothing when stale", () => {
  const fresh = scoreJob(scoring, { title: "Keeper", posted: "2026-11-19" }, NOW);
  const older = scoreJob(scoring, { title: "Keeper", posted: "2026-11-01" }, NOW);
  const stale = scoreJob(scoring, { title: "Keeper", posted: "2026-08-01" }, NOW);
  assert.deepEqual([fresh.parts.fresh, older.parts.fresh, stale.parts.fresh], [10, 5, 0]);
});

test("a hand-written spec with lone strings still scores: commas split, junk falls to defaults", () => {
  const got = scoreJob(
    {
      title: { want: "keeper, wrangler", avoid: "night swarm, unpaid trial" },
      skills: "Apiary; Smoker",
      level: { want: "head" },
      freshDays: "not a number",
    },
    { title: "Head Keeper", posted: "2026-11-20", excerpt: "Apiary and Smoker." },
    NOW,
  );
  assert.ok(got.score > 0);
  assert.match(got.why, /title matches keeper/);
});

test("a deal scores by its cap: under earns the pay part, over says so, no price takes the middle road", () => {
  const deals = { title: { want: ["chair"] }, price: { cap: 300 }, freshDays: 7 };
  const under = scoreJob(deals, { title: "A fine chair", price: 120, posted: "2026-11-20" }, NOW);
  assert.equal(under.parts.pay, 10);
  const over = scoreJob(deals, { title: "A fine chair", price: 700, posted: "2026-11-20" }, NOW);
  assert.equal(over.parts.pay, 0);
  assert.match(over.why, /over the cap/);
  const unpriced = scoreJob(deals, { title: "A fine chair", posted: "2026-11-20" }, NOW);
  assert.equal(unpriced.parts.pay, 6);
});

test("a skills list split letter by letter is read back as its words (a corrupted file once named 123 skills)", () => {
  const letters = [..."Apiary, Smoker"];
  const got = scoreJob(
    { title: { want: ["keeper"] }, skills: letters },
    { title: "Head Keeper", posted: "2026-11-20", excerpt: "Apiary work." },
    NOW,
  );
  assert.match(got.why, /1 of 2 skills named/);
});

test("a deal is set aside by the old specs' rules: an avoided word, no wanted word, the price range, an old ad", () => {
  const rules = {
    title: { want: ["teapot", "kettle"], avoid: ["lid only", "replica"] },
    price: { cap: 300, floor: 40 },
    freshDays: 7,
  };
  const why = (item: { title: string; price?: number | null; posted?: string }) =>
    leftOutOf("deals", rules, item, scoreJob(rules, item, NOW), NOW);
  assert.equal(why({ title: "Copper teapot", price: 120, posted: "2026-11-20" }), null);
  assert.equal(why({ title: "Teapot lid only", price: 120 }), "the title says lid only");
  assert.equal(why({ title: "A copper jug", price: 120 }), "the title names none of teapot, kettle");
  assert.equal(why({ title: "Kettle", price: 900 }), "over your price cap");
  assert.equal(why({ title: "Kettle", price: 5 }), "under your price floor");
  assert.equal(why({ title: "Kettle", price: 120, posted: "2026-10-01" }), "an ad older than 7 days");
  assert.equal(why({ title: "Kettle", price: null }), null); // no price, no date: it stays in view
  // a job keeps its one rule: a weak match
  assert.equal(
    leftOutOf("jobs", rules, { title: "Kettle" }, { score: 30, match: "poor", why: "", parts: {} }, NOW),
    "weak match",
  );
});

test("a job open only outside the places it must be in is set aside, with why; vague or inside places stay", () => {
  const within = {
    places: {
      words: ["Hiveton"],
      within: ["Waxland", "Hiveton", "WX"],
      closed: ["authorized to work in nectaria"],
    },
  };
  const out = (job: Record<string, unknown>) => outsideOf(within, { title: "Keeper", ...job });
  assert.equal(out({ location: "Hiveton, WX" }), null);
  assert.equal(out({ location: "Remote (Nectaria | Waxland)" }), null); // open to both
  assert.equal(out({ location: "Remote (Anywhere in the World)" }), null); // names no country
  assert.equal(out({ location: "In-Office or Remote" }), null);
  assert.equal(out({ location: "" }), null);
  assert.equal(out({ location: "Combtown, WX" }), null); // a code in capitals, as its own word
  assert.equal(out({ location: "Wxford, Nectaria" }), "not open in Waxland: Wxford, Nectaria"); // never inside one
  assert.equal(out({ location: "N/A" }), null); // a junk place line names nowhere
  assert.equal(out({ location: "NX" }), null); // a bare two-letter code proves nothing
  assert.equal(out({ location: "Droneville, Nectaria" }), "not open in Waxland: Droneville, Nectaria");
  assert.equal(out({ location: "Remote - Nectaria" }), "not open in Waxland: Remote - Nectaria");
  assert.equal(out({ location: "Remote", usOnly: true }), "not open in Waxland: US only");
  assert.equal(
    out({ location: "Remote", excerpt: "You must be authorized to work in Nectaria." }),
    "not open in Waxland: the posting says authorized to work in nectaria",
  );
  assert.equal(out({ location: "Remote", excerpt: "Authorized to work in Nectaria or Waxland." }), null);
  assert.equal(outsideOf({ places: { words: ["Hiveton"] } }, { title: "Keeper", location: "Droneville" }), null); // no rule set
  const job = { title: "Head Keeper", location: "Droneville, Nectaria" };
  assert.equal(
    leftOutOf("jobs", within, job, scoreJob(within, job, NOW), NOW),
    "not open in Waxland: Droneville, Nectaria",
  );
});
