// The Ask eval on a hunt's page, end to end: the made-up hunt made into the page the app builds, through Ask's real
// prompt and the conversation client, scored on the blocks it writes (a find, a change, none); --stand-in inside the
// check, --live for the record (docs/eval/).
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { askMessages } from "../../src/ai/ask/prompt.ts";
import { chatModel, type ModelSettings } from "../../src/ai/client.ts";
import { startStandIn } from "../../src/ai/stand-in.ts";
import { searchAskPage } from "../../src/domain/search/ask.ts";
import type { ListingRow } from "../../src/domain/search/listings.ts";
import { loadSettings } from "../../src/platform/config.ts";
import { type Case, score } from "./score.ts";

type Made = { id: string; score: number; match: string } & Record<string, unknown>;
const { cases, listings } = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url), "utf8")) as {
  cases: Case[];
  listings: Made[];
};
const rows: ListingRow[] = listings.map(({ id, score: s, match, ...data }) => ({
  id,
  search: "beekeeping",
  source: "made-up-board",
  link: `https://example.com/${id}`,
  dedupe: id,
  status: "new",
  starred: null,
  found: "2026-11-20T00:00:00Z",
  updated: "2026-11-20T00:00:00Z",
  score: s,
  match,
  data,
  kind: "jobs",
  priority: false,
}));
const page = searchAskPage(
  { kind: "jobs", key: "beekeeping", name: "Beekeeping roles", count: 40 },
  { review: 6, possible: 9, leftout: 25 },
  rows,
);
const ids = rows.map((r) => r.id);
const { values } = parseArgs({
  options: {
    live: { type: "boolean", default: false },
    model: { type: "string", default: "fast" },
    runs: { type: "string", default: "1" },
    md: { type: "boolean", default: false },
  },
});

async function runCase(c: Case, settings: ModelSettings, model: string, run: number) {
  const { system, messages } = askMessages(page, [], c.question);
  const got = await chatModel(settings, { model, system, messages, maxTokens: 6000, thinking: true }); // the app's own
  if (!got.ok)
    return { name: c.name, model, run, pass: false, why: `${got.why}: ${got.detail.slice(0, 60)}`, ms: got.ms };
  const judged = score(c, got.value, ids);
  return { name: c.name, model, run, pass: judged.pass, why: judged.reasons.join("; ").slice(0, 120), ms: got.ms };
}

const results: { name: string; model: string; run: number; pass: boolean; why: string; ms: number }[] = [];
if (values.live) {
  const settings = loadSettings().models;
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
if (values.md) {
  console.log("| case | model | run | result | time |");
  console.log("| --- | --- | --- | --- | --- |");
  for (const r of results)
    console.log(
      `| ${r.name} | ${r.model} | ${r.run} | ${r.pass ? "pass" : `fail — ${r.why}`} | ${(r.ms / 1000).toFixed(1)}s |`,
    );
}
const failed = results.filter((r) => !r.pass);
console.error(`${results.length - failed.length} of ${results.length} runs pass`);
