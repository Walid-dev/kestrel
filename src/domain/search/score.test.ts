// A table of made-up jobs scores as labelled: the engine is rules, so the labels are exact.
import assert from "node:assert/strict";
import { test } from "node:test";
import { type Scoring, scoreJob } from "./score.ts";

const NOW = new Date("2026-11-21T12:00:00Z");
const scoring: Scoring = {
  title: { want: ["engineer", "developer"], avoid: ["intern"] },
  skills: ["TypeScript", "React", "AWS", "Node"],
  level: { want: ["senior"], avoid: ["junior"] },
  pay: { floor: 100_000, usdToCad: 1.38 },
  places: { words: ["Toronto"], remoteOk: true },
  freshDays: 7,
};

test("a strong match scores great, with its why readable", () => {
  const got = scoreJob(
    scoring,
    {
      title: "Senior Software Engineer",
      location: "Toronto, ON",
      seniority: "Senior",
      salaryMax: 150_000,
      salaryCurrency: "CAD",
      posted: "2026-11-20",
      excerpt: "TypeScript, React and AWS on a Node platform.",
    },
    NOW,
  );
  assert.equal(got.match, "great");
  assert.ok(got.score >= 80);
  assert.match(got.why, /title matches/);
});

test("an avoided title word zeroes the title part; US only zeroes the place", () => {
  const intern = scoreJob(scoring, { title: "Engineer Intern", posted: "2026-11-20" }, NOW);
  assert.equal(intern.parts.title, 0);
  assert.match(intern.why, /intern/);
  const us = scoreJob(scoring, { title: "Senior Engineer", usOnly: true, posted: "2026-11-20" }, NOW);
  assert.equal(us.parts.place, 0);
  assert.match(us.why, /US only/);
});

test("pay under the floor says so; unstated pay takes the middle road; USD converts", () => {
  const low = scoreJob(
    scoring,
    { title: "Senior Engineer", salaryMax: 60_000, salaryCurrency: "CAD", posted: "2026-11-20" },
    NOW,
  );
  assert.equal(low.parts.pay, 0);
  assert.match(low.why, /under the floor/);
  const unstated = scoreJob(scoring, { title: "Senior Engineer", posted: "2026-11-20" }, NOW);
  assert.equal(unstated.parts.pay, 6);
  const usd = scoreJob(
    scoring,
    { title: "Senior Engineer", salaryMax: 80_000, salaryCurrency: "USD", posted: "2026-11-20" },
    NOW,
  );
  assert.equal(usd.parts.pay, 10); // 80k USD clears a 100k CAD floor at 1.38
});

test("freshness fades: full inside the window, half after, nothing when stale", () => {
  const fresh = scoreJob(scoring, { title: "Engineer", posted: "2026-11-19" }, NOW);
  const older = scoreJob(scoring, { title: "Engineer", posted: "2026-11-01" }, NOW);
  const stale = scoreJob(scoring, { title: "Engineer", posted: "2026-08-01" }, NOW);
  assert.deepEqual([fresh.parts.fresh, older.parts.fresh, stale.parts.fresh], [10, 5, 0]);
});
