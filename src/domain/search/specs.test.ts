// The settings page's writes: a good search lands as its file and loads back; a bad name or a bad shape is refused
// with the reason, and nothing is written.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { isDue, loadSpecs, readSpecFile, writeSpecFile } from "./specs.ts";

test("a good search is written, reads back, and loads with the others", () => {
  const dir = mkdtempSync(join(tmpdir(), "kestrel-specs-"));
  const raw = {
    name: "Hive keeper",
    kind: "jobs",
    collector: "collectors/made-up.mjs",
    about: "Keepers near Hiveton",
    env: { TERM_WORDS: "keeper" },
    scoring: { title: { want: ["keeper"] } },
  };
  const spec = writeSpecFile("hive-keeper", raw, dir);
  assert.equal(spec.id, "hive-keeper");
  assert.equal(spec.everyMinutes, 360); // the default filled on the way through
  assert.deepEqual(readSpecFile("hive-keeper", dir)?.env, { TERM_WORDS: "keeper" });
  assert.deepEqual(
    loadSpecs(dir).specs.map((s) => s.id),
    ["hive-keeper"],
  );
});

test("a bad file name or a search without its collector is refused, and nothing lands", () => {
  const dir = mkdtempSync(join(tmpdir(), "kestrel-specs-bad-"));
  assert.throws(() => writeSpecFile("../escape", { name: "x", collector: "c" }, dir), /lowercase words and dashes/);
  assert.throws(() => writeSpecFile("no-collector", { name: "x" }, dir), /collector/);
  assert.equal(existsSync(join(dir, "no-collector.json")), false);
  assert.equal(readSpecFile("../escape", dir), null);
});

test("set times: due once the next one passes, once after a sleep through several; without them, every interval", () => {
  const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m); // the computer's own clock
  const twice = { times: ["10:00", "20:00"], everyMinutes: 720 };
  assert.equal(isDue(twice, null, at(21, 9)), true); // never ran
  assert.equal(isDue(twice, at(21, 10, 0).toISOString(), at(21, 19, 59)), false);
  assert.equal(isDue(twice, at(21, 10, 0).toISOString(), at(21, 20, 0)), true);
  assert.equal(isDue(twice, at(21, 20, 1).toISOString(), at(22, 9, 0)), false); // the night has no time set
  assert.equal(isDue(twice, at(20, 20, 1).toISOString(), at(22, 9, 0)), true); // slept through: once, on waking
  const every = { times: [], everyMinutes: 360 };
  assert.equal(isDue(every, at(21, 6).toISOString(), at(21, 11, 59)), false);
  assert.equal(isDue(every, at(21, 6).toISOString(), at(21, 12)), true);
});
