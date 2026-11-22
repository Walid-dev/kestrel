// The settings page's writes: a good search lands as its file and loads back; a bad name or a bad shape is refused
// with the reason, and nothing is written.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadSpecs, readSpecFile, writeSpecFile } from "./specs.ts";

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
