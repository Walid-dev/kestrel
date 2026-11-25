// The pick in the database wins, the settings stay the fallback, and a switch survives a reopen.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../db/migrate.ts";
import type { Settings } from "../platform/config.ts";
import { listUses, modelFor, setModelFor } from "./models.ts";

const settings: Settings = {
  tailscaleLogin: "made-up",
  notes: { folders: [] },
  models: { url: "http://127.0.0.1:1/v1", careful: "careful-model", fast: "fast-model", contextChars: 1000 },
  voice: { url: "http://127.0.0.1:1", name: "made-up" },
  profile: {},
  omlxHome: "",
  apply: { folder: "", skill: "", pdf: "", check: "" },
  links: [],
};

test("the settings answer until a pick is made; the pick wins and survives a reopen", () => {
  const base = mkdtempSync(join(tmpdir(), "kestrel-models-"));
  const file = join(base, "t.db");
  let db = new DatabaseSync(file);
  migrate(db, file);
  assert.equal(modelFor(db, settings, "notes-fast"), "fast-model");
  setModelFor(db, "notes-fast", "another-made-up");
  assert.equal(modelFor(db, settings, "notes-fast"), "another-made-up");
  db.close();
  db = new DatabaseSync(file);
  assert.equal(modelFor(db, settings, "notes-fast"), "another-made-up");
  // Research's two steps, its questions and its answer, on one model unless I pick apart: no swap between them
  assert.equal(modelFor(db, settings, "research-ask"), modelFor(db, settings, "research"));
  const uses = listUses(db, settings);
  assert.deepEqual(
    uses.map((u) => [u.use, u.model]),
    [
      ["notes-careful", "careful-model"],
      ["notes-fast", "another-made-up"],
      ["ask", "fast-model"], // a conversation that streams while I wait: the fast model by default
      ["search-deep", "careful-model"],
      ["research", "careful-model"],
      ["research-ask", "careful-model"], // its questions first: the research's own model, no swap between them
      ["quiz", "careful-model"],
      ["quiz-explain", "fast-model"], // written while I answer: the fast model
      ["letter", "careful-model"],
      ["news-pick", "careful-model"], // the morning news, written while I sleep: the careful model for both steps
      ["news-write", "careful-model"],
    ],
  );
});

test("Research's questions follow a pick on Research alone; their own pick wins over it", () => {
  const base = mkdtempSync(join(tmpdir(), "kestrel-models-"));
  const file = join(base, "t.db");
  const db = new DatabaseSync(file);
  migrate(db, file);
  setModelFor(db, "research", "research-made-up");
  assert.equal(modelFor(db, settings, "research-ask"), "research-made-up"); // no swap between the two steps
  assert.equal(listUses(db, settings).find((u) => u.use === "research-ask")?.fallback, "research-made-up");
  setModelFor(db, "research-ask", "questions-made-up");
  assert.equal(modelFor(db, settings, "research-ask"), "questions-made-up");
  assert.equal(modelFor(db, settings, "research"), "research-made-up");
  db.close();
});

test("a pick must be one the door offers; a down door refuses the switch (PF-1)", async () => {
  const { createServer } = await import("node:http");
  const { once } = await import("node:events");
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: [{ id: "careful-model" }, { id: "third-model" }] }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as { port: number };
  const { doorModels } = await import("./models.ts");
  const up = await doorModels({ ...settings, models: { ...settings.models, url: `http://127.0.0.1:${port}/v1` } });
  assert.deepEqual(up, ["careful-model", "third-model"]);
  server.close();
  const down = await doorModels(settings); // port 1: nothing listens
  assert.deepEqual(down, []);
});
