// Shopping's eval, end to end on the labelled made-up cases: each step's real prompt, the model client, the code's
// checks and the scorer (score.ts). --stand-in, inside the check: a stand-in model answers each case with its good
// answer, and with its guard answer (one that breaks a rule the code keeps), so the pipe and the code's guards are
// checked. --live asks the real door on purpose (--url or KESTREL_MODEL_URL for another; the careful model unless
// --model fast or both), --runs N times, for the record (docs/eval/); never from the check.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { callModel, type ModelSettings } from "../../src/ai/client.ts";
import { askTextPrice, Pacer, readStorePage, type Wanted } from "../../src/ai/shopping/product-data.ts";
import { checkPrompt, SYSTEM } from "../../src/ai/shopping/prompt.ts";
import { CheckAnswer } from "../../src/ai/shopping/shape.ts";
import { startStandIn } from "../../src/ai/stand-in.ts";
import { pageText, type Reach } from "../../src/ai/web.ts";
import { type Category, loadCategories, saveDraft } from "../../src/domain/shopping/categories.ts";
import type { Found } from "../../src/domain/shopping/compare.ts";
import { readReviewPage } from "../../src/domain/shopping/compare.ts";
import { composeList, mergeFound, type Source } from "../../src/domain/shopping/compose.ts";
import { understand } from "../../src/domain/shopping/understand.ts";
import { liveModels } from "../../src/platform/config.ts";
import type { Need } from "../../src/shared/shopping.ts";
import {
  type ComposeExpect,
  type Judged,
  type Pair,
  type PriceExpect,
  type ReadExpect,
  scoreChecker,
  scoreCompose,
  scorePrice,
  scoreRead,
  scoreUnderstand,
  type UnderstandExpect,
} from "./score.ts";

const load = <T>(name: string) => JSON.parse(readFileSync(new URL(name, import.meta.url), "utf8")) as T;
type UCase = {
  name: string;
  want: { words: string; budget: number | null; note: string };
  expect: UnderstandExpect;
  answer: unknown;
  guard?: unknown;
  guardExpect?: UnderstandExpect;
};
type RCase = {
  name: string;
  page: { url: string; title: string; html: string };
  expect: ReadExpect;
  answer: unknown;
  guard?: unknown;
};
type PCase = {
  name: string;
  product: { name: string; brand: string; models: string[] };
  page: { url: string; html: string };
  expect: PriceExpect;
  answer: unknown;
};
type Ref = [string, string];
type CCase = {
  name: string;
  budget: number | null;
  products: string[];
  forum: [string, string, string[], number, number, number, number][];
  expect: ComposeExpect;
  write: {
    products: { name: string; why: { text: string; refs: Ref[] }[] }[];
    assumptions: { text: string; refs: Ref[] }[];
    changeIf: unknown[];
    conflicts: unknown[];
  };
  checkSays: { unsupported: string[] };
};
const understandData = load<{ cases: UCase[] }>("./understand.json");
const readData = load<{ cases: RCase[] }>("./read.json");
const priceData = load<{ currency: string; cases: PCase[] }>("./prices.json");
const composeData = load<{
  need: Need;
  sources: Source[];
  lab: [string, string, string[], number, number, number, number][];
  handson: [string, boolean, number][];
  cases: CCase[];
  checker: Pair[];
}>("./compose.json");
const NOW = new Date("2026-11-25T12:00:00Z");
const { values } = parseArgs({
  options: {
    live: { type: "boolean", default: false },
    "stand-in": { type: "boolean", default: false },
    url: { type: "string" },
    model: { type: "string", default: "careful" },
    runs: { type: "string", default: "1" },
  },
});

// what the stand-in answers next: a case's good answer, or its guard
const now = { guard: false, compose: null as CCase | null };
type Result = { name: string; pass: boolean; why: string };
const result = (name: string, j: Judged): Result => ({ name, pass: j.pass, why: j.reasons.join("; ").slice(0, 200) });

// a category as a need card, for the steps that start after Understand
const needOf = (c: Category): Need => ({
  mode: "compare",
  category: c.key,
  name: c.name,
  draft: c.draft,
  words: c.words,
  product: "",
  use: "",
  hard: [],
  implied: [],
  questions: c.questions,
  criteria: c.criteria,
  uses: c.uses,
  searchWords: c.words[0] ?? c.name,
  listSize: c.listSize,
  tags: c.tags,
  traps: c.traps,
  sources: c.sources,
  storeGroups: c.storeGroups,
  refreshMonths: c.refreshMonths,
});

async function runUnderstand(models: ModelSettings, model: string): Promise<Result[]> {
  const out: Result[] = [];
  for (const c of understandData.cases)
    for (const guard of c.guard && !values.live ? [false, true] : [false]) {
      now.guard = guard;
      const dir = mkdtempSync(join(tmpdir(), "kestrel-shop-eval-"));
      const list = loadCategories(dir);
      const got = await understand(
        c.want,
        { models, model, record: () => {} },
        { list, save: (d) => saveDraft(d, list, dir) },
        "CAD",
      );
      const expect = guard ? (c.guardExpect ?? c.expect) : c.expect;
      out.push(
        result(
          `understand: ${c.name}${guard ? " (guard)" : ""}`,
          scoreUnderstand(expect, got.ok ? { ok: true, need: got.need } : got),
        ),
      );
    }
  return out;
}

async function runRead(models: ModelSettings, model: string): Promise<Result[]> {
  const out: Result[] = [];
  const vacuum = loadCategories(mkdtempSync(join(tmpdir(), "kestrel-shop-eval-"))).find(
    (c) => c.key === "robot-vacuum",
  );
  if (!vacuum) throw new Error("the robot-vacuum starter is missing");
  for (const c of readData.cases)
    for (const guard of c.guard && !values.live ? [false, true] : [false]) {
      now.guard = guard;
      const got = await readReviewPage(
        { url: c.page.url, title: c.page.title, text: pageText(c.page.html) },
        needOf(vacuum),
        { models, model, record: () => {} },
        "CAD",
        "s1",
      );
      out.push(
        result(
          `read: ${c.name}${guard ? " (guard)" : ""}`,
          scoreRead(c.expect, {
            ok: got.ok,
            why: got.why,
            text: got.text,
            method: got.method,
            products: got.products.map((p) => ({ name: p.name, label: p.label, facts: p.facts })),
          }),
        ),
      );
    }
  return out;
}

const REACH: Reach = { resolve: async () => ["93.184.215.14"], head: async () => ({ status: 200, location: null }) };
async function runPrices(models: ModelSettings, model: string): Promise<Result[]> {
  const out: Result[] = [];
  for (const c of priceData.cases) {
    const get = (async (input: string | URL | Request) =>
      String(input) === c.page.url
        ? new Response(c.page.html, { status: 200 })
        : new Response("", { status: 404 })) as typeof fetch;
    const wanted: Wanted = { name: c.product.name, brand: c.product.brand, codes: c.product.models, gtin: null };
    const got = await readStorePage(c.page.url, wanted, {
      currency: priceData.currency,
      net: { reach: REACH, fetch: get },
      pacer: new Pacer({ sleep: async () => {} }),
      textPrice: async (text, w) => {
        const a = await askTextPrice(models, model, text, w, priceData.currency);
        return a.ok ? a.value : null;
      },
    });
    out.push(
      result(
        `prices: ${c.name}`,
        scorePrice(c.expect, {
          read: got.read,
          method: got.method,
          price: got.price,
          regular: got.regular,
          words: got.words,
        }),
      ),
    );
  }
  return out;
}

// the records Read would have kept: the lab's measured values (s1), the hands-on site's mop and price (s2), a forum's
// claims (s3)
function foundOf(c: CCase): Found[] {
  const lab = composeData.lab.filter((r) => c.products.includes(r[0]));
  const quote = {
    "pickup-carpet": (v: number) => `picked up ${v}% of the embedded hair on carpet`,
    "pickup-hard": (v: number) => `${v}% on hard floors`,
    noise: (v: number) => `${v} dB at full power`,
    battery: (v: number) => `${v} minutes per charge`,
  };
  const facts = (r: (typeof lab)[number]) => {
    const nums = r.slice(3) as number[];
    return Object.fromEntries(
      (["pickup-carpet", "pickup-hard", "noise", "battery"] as const).map((k, i) => [
        k,
        { v: nums[i], quote: quote[k](nums[i]) },
      ]),
    );
  };
  const blank = { label: "", pros: [], cons: [], skip: [] };
  return [
    ...lab.map((r) => ({
      ...blank,
      source: "s1",
      name: r[0],
      brand: r[1],
      models: r[2],
      facts: facts(r),
      price: null,
    })),
    ...composeData.handson
      .filter((r) => c.products.includes(r[0]))
      .map((r) => ({
        ...blank,
        source: "s2",
        name: r[0],
        brand: r[0].split(" ")[0],
        models: [],
        facts: { mop: { v: r[1], quote: r[1] ? "mops as it vacuums" : "has no mop" } },
        price: r[2] * 100,
      })),
    ...c.forum.map((r) => ({
      ...blank,
      source: "s3",
      name: r[0],
      brand: r[1],
      models: r[2],
      facts: facts(r),
      price: null,
    })),
  ];
}

async function runCompose(models: ModelSettings, model: string): Promise<Result[]> {
  const out: Result[] = [];
  for (const c of composeData.cases) {
    now.compose = c;
    const merged = mergeFound(
      foundOf(c),
      composeData.sources.map((s) => ({ ...s, family: s.host })),
      composeData.need,
      { modelRules: [] },
      NOW,
    );
    const got = await composeList(
      { seed: c.name, need: composeData.need, answers: {}, budget: c.budget, merged, price: (m) => m.usual },
      { models, model, checkModel: model, record: () => {} },
    );
    const nameOf = new Map(merged.map((m) => [m.key, m.name]));
    const kept = [...got.words.entries()].flatMap(([key, w]) =>
      [...w.why, ...(w.tradeoff ? [w.tradeoff] : []), ...(w.notFor ? [w.notFor] : [])].map((s) => ({
        product: nameOf.get(key) ?? key,
        text: s.text,
      })),
    );
    out.push(
      result(
        `compose: ${c.name}`,
        scoreCompose(c.expect, {
          ok: true,
          finalists: got.ranked
            .filter((r) => r.place !== null)
            .map((r) => ({ name: nameOf.get(r.id) ?? r.id, labels: r.labels.map((l) => l.key) })),
          also: got.ranked.filter((r) => r.place === null).map((r) => ({ name: nameOf.get(r.id) ?? r.id, out: r.out })),
          kept: [...kept, ...got.assumptions.map((s) => ({ product: "", text: s.text }))],
          wrote: got.wrote,
        }),
      ),
    );
  }
  now.compose = null;
  return out;
}

async function runChecker(models: ModelSettings, model: string): Promise<Result[]> {
  const pairs = composeData.checker;
  const got = await callModel(
    { ...models, careful: model, fast: model },
    {
      model,
      system: SYSTEM,
      prompt: checkPrompt(pairs.map((p, i) => ({ n: i + 1, text: p.sentence, quotes: p.quotes }))),
      maxTokens: 3000,
      thinking: false,
    },
    CheckAnswer,
  );
  const verdicts = pairs.map((_, i) =>
    got.ok ? (got.value.verdicts.find((v) => v.n === i + 1)?.supported ?? null) : null,
  );
  const judged = scoreChecker(pairs, verdicts, values.live ? 0.9 : 1);
  return [result(`checker: ${judged.right} of ${pairs.length} right`, judged)];
}

// the stand-in's answer to one prompt: the case it belongs to is found in the prompt's own words
function standInAnswer(prompt: string): unknown {
  const want = /^MY WANT: (.+)$/m.exec(prompt)?.[1];
  if (want) {
    const c = understandData.cases.find((x) => x.want.words === want);
    return now.guard && c?.guard ? c.guard : c?.answer;
  }
  const page = /<<<THE PAGE: .* \((https?:\/\/[^)]+)\)/.exec(prompt)?.[1];
  if (page) {
    const c = readData.cases.find((x) => x.page.url === page);
    return now.guard && c?.guard ? c.guard : c?.answer;
  }
  const product = /^Below is text from a store's page for the product "([^"]+)"/m.exec(prompt)?.[1];
  if (product) return priceData.cases.find((x) => x.product.name === product)?.answer;
  if (prompt.startsWith("Write short reasons") && now.compose) {
    // the case's answer, its products by name and its refs as [product, criterion], made into the prompt's ids and
    // quote numbers
    const ids = new Map([...prompt.matchAll(/^(p\d+) · (.+?) · /gm)].map((m) => [m[2], m[1]]));
    const qs = new Map(
      [...prompt.matchAll(/^ {2}\[(q\d+)\] (.+?) · ([\w-]+): /gm)].map((m) => [`${m[2]}|${m[3]}`, m[1]]),
    );
    const refs = (r: Ref[]) => r.map(([p, k]) => qs.get(`${p}|${k}`) ?? "q999");
    const w = now.compose.write;
    return {
      products: w.products
        .filter((p) => ids.has(p.name))
        .map((p) => ({ id: ids.get(p.name), why: p.why.map((s) => ({ text: s.text, refs: refs(s.refs) })) })),
      assumptions: w.assumptions.map((s) => ({ text: s.text, refs: refs(s.refs) })),
      changeIf: [],
      conflicts: [],
    };
  }
  if (prompt.startsWith("Each sentence below comes with")) {
    const sentences = [...prompt.matchAll(/^(\d+)\. (".*")$/gm)].map((m) => ({
      n: Number(m[1]),
      text: JSON.parse(m[2]) as string,
    }));
    const no = now.compose?.checkSays.unsupported ?? [];
    return {
      verdicts: sentences.map((s) => {
        const pair = composeData.checker.find((p) => p.sentence === s.text);
        return { n: s.n, supported: pair ? pair.supported : !no.some((w) => s.text.includes(w)) };
      }),
    };
  }
  return {};
}

async function runAll(models: ModelSettings, model: string): Promise<Result[]> {
  return [
    ...(await runUnderstand(models, model)),
    ...(await runRead(models, model)),
    ...(await runPrices(models, model)),
    ...(await runCompose(models, model)),
    ...(await runChecker(models, model)),
  ];
}

const results: Result[] = [];
if (values.live) {
  const settings = liveModels(values.url); // the real door on purpose, never the made-up folder's dead one
  const models =
    values.model === "both"
      ? [settings.careful, settings.fast]
      : [values.model === "fast" ? settings.fast : settings.careful];
  for (const model of models)
    for (let run = 1; run <= Number(values.runs); run++)
      for (const r of await runAll(settings, model)) {
        results.push(r);
        console.error(`${r.pass ? "pass" : "FAIL"}  ${model}  run ${run}  ${r.name}${r.pass ? "" : `  ${r.why}`}`);
      }
} else {
  const standIn = await startStandIn((body) => ({
    content: JSON.stringify(standInAnswer(body.messages.at(-1)?.content ?? "")),
  }));
  const settings: ModelSettings = {
    url: standIn.url,
    careful: "careful-model",
    fast: "fast-model",
    contextChars: 400_000,
  };
  results.push(...(await runAll(settings, "careful-model")));
  await standIn.close();
}
const failed = results.filter((r) => !r.pass);
for (const r of failed) console.error(`shopping: ${r.name}: ${r.why}`);
console.error(`shopping: ${results.length - failed.length} of ${results.length} runs pass`);
if (failed.length) process.exit(1);
