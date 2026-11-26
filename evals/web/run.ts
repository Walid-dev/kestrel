// The web eval, end to end: a made-up story of the morning's news and a made-up document of mine become the pages Ask
// builds (each with the tools and the web's way it really has: the story's searches run as the model writes, the
// document's wait for my tap), through Ask's real prompt and the conversation client, scored on whether it searches
// only when the answer needs it, in a few words that carry nothing of mine. --stand-in inside the check (the good
// answers, so the pipe itself is checked); --live for the record (docs/eval/), never from the check.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";
import { ASK_MAX_TOKENS, type AskPage, askMessages } from "../../src/ai/ask/prompt.ts";
import { chatModel, type ModelSettings } from "../../src/ai/client.ts";
import { startStandIn } from "../../src/ai/stand-in.ts";
import { migrate } from "../../src/db/migrate.ts";
import { askPageOf } from "../../src/domain/ask/ask.ts";
import { addUpload } from "../../src/domain/notes/documents.ts";
import { liveModels } from "../../src/platform/config.ts";
import type { NewsBrief } from "../../src/shared/news.ts";
import { type Case, score } from "./score.ts";

const { cases } = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url), "utf8")) as { cases: Case[] };
const { values } = parseArgs({
  options: {
    live: { type: "boolean", default: false },
    url: { type: "string" },
    model: { type: "string", default: "fast" },
    runs: { type: "string", default: "1" },
    md: { type: "boolean", default: false },
  },
});

// the two pages, made from made-up rows by the app's own helpers
const base = mkdtempSync(join(tmpdir(), "kestrel-web-eval-"));
const db = new DatabaseSync(join(base, "eval.db"));
migrate(db, join(base, "eval.db"));
const link = { paywall: false, score: null, thread: null, threadBy: "", at: "2026-11-25T05:00:00Z" };
const brief: NewsBrief = {
  opening: ["A made-up lab shipped Brew 2."],
  stories: [
    {
      section: "models",
      headline: "Brew 2 reads two million words",
      text: "The made-up lab says Brew 2 reads two million words at once. It did not say what it costs.",
      figure: "2M words",
      trend: "up",
      links: [
        { ...link, url: "https://lab.example.org/brew-2", host: "lab.example.org", title: "Brew 2", source: "Lab" },
      ],
      unsure: false,
    },
  ],
  quiet: "",
};
db.prepare(
  "INSERT INTO news_briefs (id, day, state, started, brief) VALUES ('nb', '2026-11-25', 'done', '2026-11-25T06:30:00Z', ?)",
).run(JSON.stringify(brief));
const doc = addUpload(
  db,
  "made-up-hive-log.md",
  "Robin Example opened the Hiveton hive on a still day in March.\nThe box held ten frames, eight of them full.\n",
);
const pages: Record<Case["page"], AskPage> = {
  news: askPageOf(db, "news", "nb:1") as AskPage,
  notes: askPageOf(db, "notes", doc.id) as AskPage,
};

async function runCase(c: Case, settings: ModelSettings, model: string, run: number) {
  const { system, messages } = askMessages(pages[c.page], [], c.question);
  const got = await chatModel(settings, { model, system, messages, maxTokens: ASK_MAX_TOKENS, thinking: true }); // the app's own
  if (!got.ok)
    return { name: c.name, model, run, pass: false, why: `${got.why}: ${got.detail.slice(0, 60)}`, ms: got.ms };
  const judged = score(c, got.value);
  return { name: c.name, model, run, pass: judged.pass, why: judged.reasons.join("; ").slice(0, 120), ms: got.ms };
}

const results: { name: string; model: string; run: number; pass: boolean; why: string; ms: number }[] = [];
if (values.live) {
  const settings = liveModels(values.url); // the real door on purpose, never the made-up folder's dead one
  const models =
    values.model === "both"
      ? [settings.careful, settings.fast]
      : [values.model === "careful" ? settings.careful : settings.fast];
  for (const model of models)
    for (const c of cases)
      for (let run = 1; run <= Number(values.runs); run++) {
        const r = await runCase(c, settings, model, run);
        results.push(r);
        console.error(
          `${r.pass ? "pass" : "FAIL"}  ${model}  ${c.name}  run ${run}  ${(r.ms / 1000).toFixed(1)}s${r.pass ? "" : `  ${r.why}`}`,
        );
      }
} else {
  const standIn = await startStandIn((body) => {
    const asked = body.messages.at(-1)?.content ?? "";
    return { content: cases.find((x) => asked === x.question)?.good ?? "" };
  });
  const settings: ModelSettings = {
    url: standIn.url,
    careful: "careful-model",
    fast: "fast-model",
    contextChars: 200_000,
  };
  for (const c of cases) results.push(await runCase(c, settings, "fast-model", 1));
  await standIn.close();
}
db.close();
if (values.md) {
  console.log("| case | model | run | result | time |");
  console.log("| --- | --- | --- | --- | --- |");
  for (const r of results)
    console.log(
      `| ${r.name} | ${r.model} | ${r.run} | ${r.pass ? "pass" : `fail — ${r.why}`} | ${(r.ms / 1000).toFixed(1)}s |`,
    );
}
const failed = results.filter((r) => !r.pass);
console.error(`web: ${results.length - failed.length} of ${results.length} runs pass`);
if (failed.length) process.exit(1);
