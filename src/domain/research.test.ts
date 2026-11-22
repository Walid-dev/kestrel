// Research keeps each link once across searches, numbers its pages so the report can cite them, reads a near-miss
// answer, and a restart never leaves a report spinning. Made-up pages only.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { askPrompt, planPrompt, reportPrompt } from "../ai/research/prompt.ts";
import { ResearchReport } from "../ai/research/shape.ts";
import { migrate } from "../db/migrate.ts";
import { dataDir } from "../platform/paths.ts";
import {
  answersText,
  contextText,
  deleteResearch,
  getResearch,
  listResearch,
  mergeHits,
  researchContext,
  saveAbout,
  sweepResearch,
} from "./research.ts";

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

test("what it knows about me: About me and the context files, cut to fit; the searches never see it", () => {
  saveAbout("I am a made-up gardener who grows teapots.");
  mkdirSync(join(dataDir(), "research", "context"), { recursive: true });
  writeFileSync(join(dataDir(), "research", "context", "garden.md"), "The garden is made up too.");
  const ctx = researchContext();
  assert.match(ctx.about, /made-up gardener/);
  assert.ok(ctx.files.some((f) => f.name === "garden.md"));
  const text = contextText();
  assert.match(text, /made-up gardener[\s\S]*\(garden\.md\)\nThe garden is made up too\./);
  // the plan's prompt takes the question and my answers only: nothing kept about me reaches a search
  const plan = planPrompt("Which watering can?", answersText([{ q: "Budget?", a: "Under 20" }]));
  assert.match(plan, /Budget\? Under 20/);
  assert.doesNotMatch(plan, /gardener/);
  // the report and the questions do know me
  assert.match(reportPrompt("Which watering can?", "quick", [], [], { about: text }), /made-up gardener/);
  assert.match(askPrompt("Which watering can?", text), /made-up gardener/);
  assert.match(askPrompt("Which watering can?", ""), /\(nothing yet\)/);
  assert.equal(answersText([{ q: "Budget?", a: "  " }]), "");
});
