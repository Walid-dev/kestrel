import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { dataDir, isDeployed } from "./paths.ts";

test("without the deploy setting, the data folder is the made-up one, seeded", () => {
  delete process.env.KESTREL_DATA_DIR;
  const dir = dataDir();
  assert.ok(dir.startsWith(tmpdir()));
  assert.ok(!dir.includes("Application Support"));
  assert.ok(existsSync(join(dir, "settings.json")));
  assert.equal(isDeployed(), false);
});

test("the deploy setting names the real folder, used as given", () => {
  process.env.KESTREL_DATA_DIR = join(tmpdir(), "kestrel-made-up-real");
  assert.equal(dataDir(), join(tmpdir(), "kestrel-made-up-real"));
  assert.equal(isDeployed(), true);
  delete process.env.KESTREL_DATA_DIR;
});
