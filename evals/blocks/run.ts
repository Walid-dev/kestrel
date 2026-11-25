// The drawings eval, end to end: a made-up Learn page through Ask's real prompt (with the catalog) and the
// conversation client, scored on the drawings it writes; --stand-in inside the check, --live for the record
// (docs/eval/). Both local models: --model both.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { ASK_MAX_TOKENS, type AskPage, askMessages } from "../../src/ai/ask/prompt.ts";
import { chatModel, type ModelSettings } from "../../src/ai/client.ts";
import { startStandIn } from "../../src/ai/stand-in.ts";
import { liveModels } from "../../src/platform/config.ts";
import { type Case, score } from "./score.ts";

const { cases } = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url), "utf8")) as { cases: Case[] };
const page: AskPage = {
  app: "Learn",
  what: "lessons to learn from, and Ask about them",
  title: "Web basics (a made-up pack)",
  link: "/learn",
  context: "The pack's lessons: How the web works; Databases; Data structures; Safe shell scripts.",
};
const { values } = parseArgs({
  options: {
    live: { type: "boolean", default: false },
    url: { type: "string" },
    model: { type: "string", default: "fast" },
    runs: { type: "string", default: "1" },
    md: { type: "boolean", default: false },
    case: { type: "string", default: "" }, // only these cases, by name, comma between
    show: { type: "boolean", default: false }, // print a failed answer's start, to see what it drew instead
  },
});
const only = values.case ? new Set(values.case.split(",")) : null;

async function runCase(c: Case, settings: ModelSettings, model: string, run: number) {
  const { system, messages } = askMessages(page, [], c.question);
  const got = await chatModel(settings, { model, system, messages, maxTokens: ASK_MAX_TOKENS, thinking: true }); // the app's own
  if (!got.ok)
    return { name: c.name, model, run, pass: false, why: `${got.why}: ${got.detail.slice(0, 60)}`, ms: got.ms };
  const judged = score(c, got.value);
  if (values.show && !judged.pass) console.error(`--- ${c.name}\n${got.value.slice(0, 700)}\n---`);
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
    for (const c of cases.filter((x) => !only || only.has(x.name)))
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
if (failed.length && !values.live) process.exitCode = 1;
