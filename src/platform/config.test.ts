import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { liveModels, loadSettings, MODEL_DEFAULTS } from "./config.ts";

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
    omlxHome: "",
    links: [],
    apply: { folder: "", skill: "", pdf: "", check: "" },
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

test("development's made-up doors are dead; the evals' --live asks the real door on purpose", (t) => {
  // the made-up seed: every model and voice door is a dead address on this computer, never the real ones
  const seed = loadSettings(fileURLToPath(new URL("../../scripts/dev-data/", import.meta.url)));
  for (const url of [seed.models.url, seed.voice.url]) {
    assert.match(url, /^http:\/\/127\.0\.0\.1:9(\/|$)/);
    assert.doesNotMatch(url, /:8000|:8798/);
  }
  // --live: the real default door, or one given by the flag or KESTREL_MODEL_URL, on this computer only
  const before = process.env.KESTREL_MODEL_URL;
  t.after(() => {
    if (before === undefined) delete process.env.KESTREL_MODEL_URL;
    else process.env.KESTREL_MODEL_URL = before;
  });
  delete process.env.KESTREL_MODEL_URL;
  assert.deepEqual(liveModels(), MODEL_DEFAULTS);
  assert.equal(liveModels("http://localhost:8001/v1").url, "http://localhost:8001/v1");
  process.env.KESTREL_MODEL_URL = "http://127.0.0.1:8002/v1";
  assert.equal(liveModels().url, "http://127.0.0.1:8002/v1");
  assert.equal(liveModels("http://127.0.0.1:8003/v1").url, "http://127.0.0.1:8003/v1"); // the flag wins
  assert.throws(() => liveModels("https://models.example.com/v1"), /must stay on this computer/);
});
