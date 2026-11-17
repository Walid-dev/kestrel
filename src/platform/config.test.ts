import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadSettings } from "./config.ts";

test("a missing settings file stops kestrel with a filled example", () => {
  const dir = mkdtempSync(join(tmpdir(), "kestrel-cfg-"));
  assert.throws(() => loadSettings(dir), /settings\.json.*example/is);
});

test("a wrong settings file says which field, with the example", () => {
  const dir = mkdtempSync(join(tmpdir(), "kestrel-cfg-"));
  writeFileSync(join(dir, "settings.json"), JSON.stringify({ notes: { folders: [] } }));
  assert.throws(() => loadSettings(dir), /tailscaleLogin.*example/is);
});

test("a good settings file answers the settings, defaults filled", () => {
  const dir = mkdtempSync(join(tmpdir(), "kestrel-cfg-"));
  writeFileSync(join(dir, "settings.json"), JSON.stringify({ tailscaleLogin: "made-up-login" }));
  assert.deepEqual(loadSettings(dir), { tailscaleLogin: "made-up-login", notes: { folders: [] } });
});
