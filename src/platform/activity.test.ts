// Live's list: work shows while it runs, its steps in order, and moves to the day's history when it ends.
import assert from "node:assert/strict";
import { test } from "node:test";
import { activity, begin, finished, running } from "./activity.ts";

test("a job runs, writes its steps, ends with its outcome, and every change rings", () => {
  let rings = 0;
  const hear = () => rings++;
  activity.on("change", hear);
  const job = begin("search", "Search: a made-up hunt", "/searches");
  assert.ok(running().some((a) => a.title === "Search: a made-up hunt"));
  job.step("Running the collector");
  job.step("12 found, 3 new");
  job.end("done");
  job.step("too late: an ended job writes nothing");
  activity.off("change", hear);
  assert.ok(!running().some((a) => a.title === "Search: a made-up hunt"));
  const done = finished().find((a) => a.title === "Search: a made-up hunt");
  assert.ok(done);
  assert.equal(done.outcome, "done");
  assert.deepEqual(
    done.steps.map((s) => s.text),
    ["Running the collector", "12 found, 3 new"],
  );
  assert.equal(rings, 4); // begin, two steps, end
});
