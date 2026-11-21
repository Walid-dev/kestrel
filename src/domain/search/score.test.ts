// A table of made-up beekeeping jobs scores as labelled: the engine is rules, so the labels are exact.
import assert from "node:assert/strict";
import { test } from "node:test";
import { scoreJob } from "./score.ts";

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
