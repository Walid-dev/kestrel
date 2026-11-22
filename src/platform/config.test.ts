import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadSettings, MODEL_DEFAULTS } from "./config.ts";

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
  assert.deepEqual(loadSettings(dir), {
    tailscaleLogin: "made-up-login",
    notes: { folders: [] },
    models: MODEL_DEFAULTS,
    voice: { url: "http://127.0.0.1:8798", name: "af_heart" },
    profile: {},
  });
});

test("a voice door off this computer is refused: sound never leaves", () => {
  const dir = mkdtempSync(join(tmpdir(), "kestrel-cfg-"));
  writeFileSync(
    join(dir, "settings.json"),
    JSON.stringify({ tailscaleLogin: "made-up-login", voice: { url: "https://voice.example.com" } }),
  );
  assert.throws(() => loadSettings(dir), /must stay on this computer/);
});

test("a model door off this computer is refused: documents never leave (R2-1)", () => {
  const dir = mkdtempSync(join(tmpdir(), "kestrel-cfg-"));
  writeFileSync(
    join(dir, "settings.json"),
    JSON.stringify({ tailscaleLogin: "made-up-login", models: { url: "https://models.example.com/v1" } }),
  );
  assert.throws(() => loadSettings(dir), /must stay on this computer/);
  writeFileSync(
    join(dir, "settings.json"),
    JSON.stringify({ tailscaleLogin: "made-up-login", models: { url: "http://localhost:8000/v1" } }),
  );
  assert.equal(loadSettings(dir).models.url, "http://localhost:8000/v1");
});

test("a settings error never carries the folder's path: the service log must stay clean (R2-9)", () => {
  const dir = mkdtempSync(join(tmpdir(), "kestrel-cfg-"));
  try {
    loadSettings(dir);
    assert.fail("should have thrown");
  } catch (e) {
    assert.ok(!(e as Error).message.includes(dir), "the message must not name the folder");
  }
  writeFileSync(join(dir, "settings.json"), JSON.stringify({}));
  try {
    loadSettings(dir);
    assert.fail("should have thrown");
  } catch (e) {
    assert.ok(!(e as Error).message.includes(dir));
  }
});
