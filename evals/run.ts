// The eval, end to end: each case's documents and notes become the real prompt, a model answers, the scorer judges,
// and the placing rules must seat every change. --stand-in answers with the case's own good answer (fast, free,
// inside the check); --live asks the real models (step 15), --runs N times each.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { changesPrompt } from "../src/ai/changes/prompt.ts";
import { Answer } from "../src/ai/changes/shape.ts";
import { callModel, type ModelSettings } from "../src/ai/client.ts";
import { startStandIn } from "../src/ai/stand-in.ts";
import { place } from "../src/domain/notes/place.ts";
import { loadSettings } from "../src/platform/config.ts";
import { type Case, score } from "./changes/score.ts";

const cases = JSON.parse(readFileSync(new URL("./changes/cases.json", import.meta.url), "utf8")) as Case[];
const { values } = parseArgs({
  options: {
    "stand-in": { type: "boolean", default: false },
    live: { type: "boolean", default: false },
    model: { type: "string", default: "careful" },
    runs: { type: "string", default: "1" },
    md: { type: "boolean", default: false },
  },
});

type RowResult = { name: string; model: string; run: number; pass: boolean; why: string; ms: number; tokens: string };

async function runCase(c: Case, settings: ModelSettings, model: string, run: number): Promise<RowResult> {
  const { system, prompt } = changesPrompt(c.documents, c.notes);
  const got = await callModel(settings, { model, system, prompt, maxTokens: 8000, thinking: true }, Answer);
  if (!got.ok)
    return {
      name: c.name,
      model,
      run,
      pass: false,
      why: `${got.why}: ${got.detail.slice(0, 80)}`,
      ms: got.ms,
      tokens: "",
    };
  const judged = score(c, got.value);
  const reasons = [...judged.reasons];
  for (const d of c.documents) {
    const mine = got.value.changes.filter((ch) => ch.document === d.name);
    const anchors = new Map(c.notes.filter((n) => n.document === d.name).map((n) => [n.id, d.text.indexOf(n.quote)]));
    const seated = place(d.text, mine, anchors);
    for (const lost of seated.leftOut) reasons.push(`not placeable in ${d.name}: ${lost.reason}`);
  }
  const tokens = got.tokensIn === null ? "" : `${got.tokensIn}/${got.tokensOut}`;
  return {
    name: c.name,
    model,
    run,
    pass: reasons.length === 0,
    why: reasons.join("; ").slice(0, 160),
    ms: got.ms,
    tokens,
  };
}

const results: RowResult[] = [];
if (values.live) {
  const settings = loadSettings().models;
  const models =
    values.model === "both"
      ? [settings.careful, settings.fast]
      : [values.model === "fast" ? settings.fast : settings.careful];
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
    const asked = body.messages.map((m) => m.content).join("\n");
    const c = cases.find((x) => asked.includes(`DOCUMENT ${x.documents[0].name}:`));
    return { content: JSON.stringify(c?.good ?? {}) };
  });
  const settings: ModelSettings = {
    url: standIn.url,
    careful: "careful-model",
    fast: "fast-model",
    contextChars: 200_000,
  };
  for (const c of cases) results.push(await runCase(c, settings, "careful-model", 1));
  await standIn.close();
}

if (values.md) {
  console.log("| case | model | run | result | time | tokens in/out |");
  console.log("| --- | --- | --- | --- | --- | --- |");
  for (const r of results)
    console.log(
      `| ${r.name} | ${r.model} | ${r.run} | ${r.pass ? "pass" : `fail — ${r.why}`} | ${(r.ms / 1000).toFixed(1)}s | ${r.tokens} |`,
    );
}
const failed = results.filter((r) => !r.pass);
console.error(`${results.length - failed.length} of ${results.length} runs pass`);
if (failed.length) process.exit(1);
