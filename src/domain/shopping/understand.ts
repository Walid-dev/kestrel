// Understand: one call that names the kind of product my words need, what matters for it and what my words already
// say, read tolerantly and then fixed by code. A known kind is taken from its file; a new one is drafted and saved as a
// draft category (its key guarded). A question or an option's effect that names a criterion the kind lacks is dropped,
// a question that changes nothing goes, three stay at most. The search words go through the scrub, so neither my
// budget nor my note reaches a search whatever the model wrote. The need card keeps the kind's criteria, uses and
// questions, so an answer later re-ranks from the card alone, never a new run.
import { callModel, type ModelAnswer, type ModelSettings } from "../../ai/client.ts";
import { SYSTEM, understandPrompt } from "../../ai/shopping/prompt.ts";
import { UnderstandAnswer } from "../../ai/shopping/shape.ts";
import type { Hard, Need, Question } from "../../shared/shopping.ts";
import { Refused } from "../notes/documents.ts";
import { type Category, matchCategory, safeKey } from "./categories.ts";
import { scrubContext, scrubQuery, withWords } from "./scrub.ts";

export type Understood = { ok: true; need: Need; raw: UnderstandAnswer } | { ok: false; why: string };

const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]+/g, " ");

export async function understand(
  want: { words: string; budget: number | null; note: string },
  ask: { models: ModelSettings; model: string; record: (a: ModelAnswer<unknown>) => void },
  cats: { list: Category[]; save: (draft: unknown) => Category },
  currency: string,
): Promise<Understood> {
  const match = matchCategory(want.words, cats.list);
  const got = await callModel(
    { ...ask.models, careful: ask.model, fast: ask.model },
    {
      model: ask.model,
      system: SYSTEM,
      prompt: understandPrompt(
        want,
        cats.list.map((c) => ({ key: c.key, name: c.name, words: c.words })),
        match,
        currency,
      ),
      maxTokens: 4000,
      thinking: true,
    },
    UnderstandAnswer,
  );
  ask.record(got);
  if (!got.ok) return { ok: false, why: got.why };
  const raw = got.value;
  // the kind: a known key, else a new one drafted and saved, else the one my words matched
  let category = cats.list.find((c) => c.key === raw.category) ?? null;
  let refused = "";
  if (!category && raw.newCategory) {
    try {
      category = cats.save({ ...raw.newCategory, key: raw.newCategory.key || raw.category });
    } catch (e) {
      if (!(e instanceof Refused)) throw e;
      refused = e.message;
      category = match;
    }
  }
  category ??= match;
  // a draft refused says why (the model named the kind, its draft didn't hold): a new run drafts again
  if (!category && refused) return { ok: false, why: `${refused}: Run again` };
  if (!category) return { ok: false, why: "it couldn't tell what kind of product this is: say it in other words" };
  const criteria = new Set(category.criteria.map((c) => c.key));
  const hardOk = (h: Hard) => (!h.criterion || criteria.has(h.criterion)) && (h.says || h.criterion);
  // the questions: only effects on the kind's criteria, a question that changes nothing gone, three at most
  const keys = new Set<string>();
  const questions: Question[] = [];
  for (const [i, q] of raw.questions.entries()) {
    const options = q.options.map((o) => ({
      label: o.label,
      weights: Object.fromEntries(Object.entries(o.weights).filter(([k]) => criteria.has(k))),
      ...(o.hard.filter(hardOk).length ? { hard: o.hard.filter(hardOk) } : {}),
    }));
    if (options.length < 2 || !options.some((o) => Object.keys(o.weights).length || o.hard)) continue;
    let key = safeKey(q.key, q.q) ?? `q${i + 1}`;
    while (keys.has(key)) key = `${key}-${i + 1}`;
    keys.add(key);
    questions.push({ key, q: q.q, options, default: Math.min(Math.max(0, q.default), options.length - 1) });
    if (questions.length === 3) break;
  }
  const mode = raw.mode === "one" && raw.product ? "one" : "compare";
  const words = fold(want.words);
  const implied = [
    ...raw.implied,
    ...category.implied.filter((i) => words.includes(fold(i.when).trim())).flatMap((i) => i.needs),
  ];
  const need: Need = {
    mode,
    category: category.key,
    name: category.name,
    draft: category.draft,
    words: category.words,
    product: mode === "one" ? raw.product : "",
    use: raw.use in category.uses ? raw.use : "",
    hard: raw.hard.filter(hardOk).slice(0, 6),
    implied: [...new Set(implied)].slice(0, 5),
    questions,
    criteria: category.criteria,
    uses: category.uses,
    searchWords: "",
    listSize: category.listSize,
    tags: category.tags,
    traps: category.traps,
    sources: category.sources,
    storeGroups: category.storeGroups,
    refreshMonths: category.refreshMonths,
  };
  // the search words, scrubbed: neither my budget nor my note, whatever the model wrote
  const ctx = withWords(scrubContext(want, need, mode === "one" ? [{ name: raw.product }] : []), [
    category.name,
    ...category.words,
  ]);
  const fallback = mode === "one" ? raw.product : (category.words[0] ?? category.name);
  need.searchWords = scrubQuery(raw.searchWords, ctx) ?? scrubQuery(fallback, ctx) ?? category.name.toLowerCase();
  return { ok: true, need, raw };
}
