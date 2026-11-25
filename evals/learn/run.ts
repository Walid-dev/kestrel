// The Ask eval on a lesson page, end to end: each case's lesson made into the page the app builds, through Ask's real
// prompt and the conversation client; --stand-in inside the check, --live for the record (docs/eval/).
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { ASK_MAX_TOKENS, askMessages } from "../../src/ai/ask/prompt.ts";
import { chatModel, type ModelSettings } from "../../src/ai/client.ts";
import { startStandIn } from "../../src/ai/stand-in.ts";
import { lessonAskPage } from "../../src/domain/learn/ask.ts";
import { liveModels } from "../../src/platform/config.ts";
import { type Case, score } from "./score.ts";

const cases = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url), "utf8")) as Case[];
const { values } = parseArgs({
  options: {
    live: { type: "boolean", default: false },
    url: { type: "string" },
    model: { type: "string", default: "fast" },
    runs: { type: "string", default: "1" },
    md: { type: "boolean", default: false },
  },
});

async function runCase(c: Case, settings: ModelSettings, model: string, run: number) {
  const page = lessonAskPage(
    {
      id: c.lesson.id,
      title: c.lesson.title,
      text: [...c.lesson.say, ...c.lesson.explain, ...c.lesson.words.map((w) => `${w.w}: ${w.m}`)],
    },
    c.packMap,
  );
  const { system, messages } = askMessages(page, [], c.question);
  // the app's own budget for an answer
  const got = await chatModel(settings, { model, system, messages, maxTokens: ASK_MAX_TOKENS, thinking: true });
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
    const c = cases.find((x) => asked === x.question);
    return { content: c?.good ?? "" };
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
if (failed.length) process.exit(1);
