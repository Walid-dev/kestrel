// Research keeps each link once across searches, numbers its pages so the report can cite them, reads a near-miss
// answer, and a restart never leaves a report spinning. Made-up pages only.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { reportPrompt } from "../ai/research/prompt.ts";
import { ResearchReport } from "../ai/research/shape.ts";
import { migrate } from "../db/migrate.ts";
import { deleteResearch, getResearch, listResearch, mergeHits, sweepResearch } from "./research.ts";

const hit = (n: number) => ({ title: `Page ${n}`, url: `https://example.com/${n}`, snippet: `About ${n}` });

test("each link once, in the order found, a few from each search", () => {
  const merged = mergeHits(
    [
      [hit(1), hit(2), hit(3)],
      [hit(2), hit(4), hit(5)],
    ],
    2,
  );
  assert.deepEqual(
    merged.map((h) => h.url),
    ["https://example.com/1", "https://example.com/2", "https://example.com/4"],
  );
});

test("the report prompt numbers the pages as the hits are numbered, and asks for the lesson's shape", () => {
  const p = reportPrompt(
    "Why do teapots drip?",
    "quick",
    [hit(1), hit(2)],
    [{ n: 2, title: "Page 2", url: "https://example.com/2", text: "Drips come from the spout's lip." }],
  );
  assert.match(p, /\[1\] Page 1/);
  assert.match(p, /\[2\] Page 2 \(https:\/\/example.com\/2\)\nDrips come/);
  assert.match(p, /"type": "lines"/);
  assert.match(p, /8 to 15 lines/);
});

test("a near-miss answer still lands: a lone string in a list, numbers as text", () => {
  const r = ResearchReport.parse({
    title: "Drips",
    short: "The lip's shape.",
    unsure: "Glaze matters?",
    sources: ["2"],
  });
  assert.deepEqual(r.unsure, ["Glaze matters?"]);
  assert.deepEqual(r.sources, [2]);
  assert.deepEqual(r.blocks, []);
});

test("a report left running by a restart is marked failed; a finished one lists, opens and deletes", () => {
  const base = mkdtempSync(join(tmpdir(), "kestrel-research-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  const put = db.prepare(
    "INSERT INTO research (id, question, level, state, step, started, report) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  put.run("r1", "Why do teapots drip?", "quick", "running", "Reading", "2026-11-22T10:00:00Z", null);
  const report = {
    title: "Drips",
    short: "The lip.",
    blocks: [],
    words: [],
    unsure: [],
    sources: [1],
    refs: [],
    read: [],
  };
  put.run("r2", "What is a kettle?", "deep", "done", "", "2026-11-22T11:00:00Z", JSON.stringify(report));
  sweepResearch(db);
  assert.equal(getResearch(db, "r1")?.state, "failed");
  assert.match(getResearch(db, "r1")?.error ?? "", /restarted/);
  const list = listResearch(db);
  assert.deepEqual(
    list.map((r) => [r.id, r.title]),
    [
      ["r2", "Drips"],
      ["r1", ""],
    ],
  );
  assert.equal(getResearch(db, "r2")?.report?.short, "The lip.");
  deleteResearch(db, "r2");
  assert.equal(getResearch(db, "r2"), null);
  assert.throws(() => deleteResearch(db, "nope"), /no such research/);
});
