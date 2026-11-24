// The news eval, end to end: a made-up day's items through the real prompts, the model client, the code's checks and
// the scorer (score.ts). Without --live, inside the check: a stand-in model answers with the good pick and write, so
// the pipe itself is checked. --live asks the real door on purpose (--url or KESTREL_MODEL_URL for another, the
// careful model unless --model fast or both), --runs N times, for the record (docs/eval/); never from the check.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { ModelSettings } from "../../src/ai/client.ts";
import { startStandIn } from "../../src/ai/stand-in.ts";
import { composeBrief } from "../../src/domain/news/compose.ts";
import { liveModels } from "../../src/platform/config.ts";
import { type Expect, itemsOf, type MadeItem, score } from "./score.ts";

const data = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url), "utf8")) as {
  expect: Expect;
  items: MadeItem[];
  good: { pick: unknown; write: unknown };
};
const NOW = new Date("2026-11-24T06:30:00Z");
const items = itemsOf(data.items, NOW);
const { values } = parseArgs({
  options: {
    live: { type: "boolean", default: false },
    url: { type: "string" },
    model: { type: "string", default: "careful" },
    runs: { type: "string", default: "1" },
    md: { type: "boolean", default: false },
  },
});

type Result = { model: string; run: number; pass: boolean; why: string; ms: number; tokens: string };

async function runOnce(settings: ModelSettings, model: string, run: number): Promise<Result> {
  // no article is read in the eval: the brief is written from the items' own words, the hardest case for the truth
  const got = await composeBrief(
    settings,
    { pick: model, write: model },
    items,
    { headlines: [], opening: [] },
    async () => "",
    NOW,
  );
  const ms = got.calls.reduce((n, c) => n + c.ms, 0);
  const tokens = got.calls.map((c) => (c.ok && c.tokensIn !== null ? `${c.tokensIn}/${c.tokensOut}` : "")).join(" ");
  if (!got.ok) return { model, run, pass: false, why: got.why, ms, tokens };
  const judged = score(data.expect, { pick: got.pick, picked: got.picked, written: got.written, brief: got.brief });
  return { model, run, pass: judged.pass, why: judged.reasons.join("; ").slice(0, 200), ms, tokens };
}

const results: Result[] = [];
if (values.live) {
  const settings = liveModels(values.url); // the real door on purpose, never the made-up folder's dead one
  const models =
    values.model === "both"
      ? [settings.careful, settings.fast]
      : [values.model === "fast" ? settings.fast : settings.careful];
  for (const model of models)
    for (let run = 1; run <= Number(values.runs); run++) {
      const r = await runOnce(settings, model, run);
      results.push(r);
      console.error(
        `${r.pass ? "pass" : "FAIL"}  ${model}  run ${run}  ${(r.ms / 1000).toFixed(1)}s${r.pass ? "" : `  ${r.why}`}`,
      );
    }
} else {
  const standIn = await startStandIn((body) => {
    const asked = body.messages.at(-1)?.content ?? "";
    return { content: JSON.stringify(asked.includes("Group the items") ? data.good.pick : data.good.write) };
  });
  const settings: ModelSettings = {
    url: standIn.url,
    careful: "careful-model",
    fast: "fast-model",
    contextChars: 200_000,
  };
  results.push(await runOnce(settings, "careful-model", 1));
  await standIn.close();
}
if (values.md) {
  console.log("| model | run | result | time | tokens in/out (pick, write) |");
  console.log("| --- | --- | --- | --- | --- |");
  for (const r of results)
    console.log(
      `| ${r.model} | ${r.run} | ${r.pass ? "pass" : `fail — ${r.why}`} | ${(r.ms / 1000).toFixed(1)}s | ${r.tokens} |`,
    );
}
const failed = results.filter((r) => !r.pass);
for (const r of failed) console.error(`news: ${r.why}`);
console.error(`news: ${results.length - failed.length} of ${results.length} runs pass`);
if (failed.length) process.exit(1);
