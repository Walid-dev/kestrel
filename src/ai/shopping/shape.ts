// Shopping's model answers, read tolerantly as Research's and News' are: an amount as 449.99, "449.99" or "$449.99";
// a part that can't be read becomes null or is left out alone. Code checks everything after (src/domain/shopping/).
import { z } from "zod";

// an amount of money as the model may write it: a number, or a string with a currency sign and thousands' commas
const amount = z.preprocess((v) => {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return v;
  const s = v.replace(/[^\d.,]/g, "");
  const n = /,\d{2}$/.test(s) && !s.includes(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  return Number(n);
}, z.number().positive().finite());

const quoted = z
  .object({ amount, words: z.string().catch("") })
  .nullable()
  .catch(null);

export const TextPrice = z.object({
  price: quoted.default(null),
  regular: quoted.default(null),
  currency: z.string().catch("").default(""),
});
export type TextPrice = z.infer<typeof TextPrice>;

const text = (max: number) =>
  z.preprocess((v) => (Array.isArray(v) ? v.join(" ") : v), z.string()).transform((s) => s.trim().slice(0, max));
// a list whose parts can each fail alone: the good ones stay
const tolerant = <T>(one: z.ZodType<T>, max = 30) =>
  z
    .preprocess((v) => (Array.isArray(v) ? v : v == null ? [] : [v]), z.array(z.unknown()))
    .transform((list) =>
      list.slice(0, max).flatMap((x) => {
        const r = one.safeParse(x);
        return r.success ? [r.data] : [];
      }),
    )
    .catch([]);
const strings = z
  .preprocess((v) => (typeof v === "string" ? [v] : v), z.array(z.unknown()))
  .transform((l) =>
    l
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean),
  )
  .catch([]);
const weights = z
  .record(z.string(), z.unknown())
  .transform((w) =>
    Object.fromEntries(
      Object.entries(w).flatMap(([k, v]) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? [[k, v]] : [])),
    ),
  )
  .catch({});

const Hard = z.object({
  criterion: z.string().catch(""),
  says: text(160).catch(""),
  min: z.number().optional().catch(undefined),
  max: z.number().optional().catch(undefined),
  is: z.union([z.boolean(), z.string()]).optional().catch(undefined),
});
const Criterion = z.object({
  key: z.string(),
  label: text(60),
  type: z.enum(["number", "score", "bool", "enum"]).catch("score"),
  unit: z.string().optional().catch(undefined),
  better: z.enum(["higher", "lower"]).catch("higher"),
  weight: z.coerce.number().catch(0),
  how: z.string().optional().catch(undefined),
  measured: z.boolean().optional().catch(undefined),
});
export const UnderstandAnswer = z.object({
  mode: z.enum(["compare", "one"]).catch("compare"),
  category: z.string().catch(""),
  use: z.string().catch(""),
  newCategory: z
    .object({
      key: z.string().catch(""),
      name: text(60).catch(""),
      words: strings,
      criteria: tolerant(Criterion, 10),
      storeGroups: strings,
      sources: strings,
    })
    .nullable()
    .catch(null),
  product: text(120).catch(""),
  hard: tolerant(Hard, 8),
  implied: strings,
  questions: tolerant(
    z.object({
      key: z.string(),
      q: text(160),
      options: tolerant(z.object({ label: text(60), weights, hard: tolerant(Hard, 4) }), 4),
      default: z.coerce.number().int().catch(0),
    }),
    6,
  ),
  searchWords: text(120).catch(""),
});
export type UnderstandAnswer = z.infer<typeof UnderstandAnswer>;

const quotedLine = z.object({ text: text(240).catch(""), quote: text(400) });
const FactValue = z.union([z.number(), z.boolean(), z.string()]);
export const ReadAnswer = z.object({
  method: z
    .object({
      buysOwn: z.boolean().catch(false),
      numbers: z.boolean().catch(false),
      date: z.string().nullable().catch(null).default(null),
    })
    .catch({ buysOwn: false, numbers: false, date: null }),
  products: tolerant(
    z.object({
      name: text(120),
      brand: text(60).catch(""),
      models: strings,
      label: text(60).catch(""),
      facts: z
        .record(z.string(), z.unknown())
        .transform((f) =>
          Object.fromEntries(
            Object.entries(f).flatMap(([k, v]) => {
              const r = z
                .object({ v: FactValue, unit: z.string().optional().catch(undefined), quote: text(400) })
                .safeParse(v);
              return r.success ? [[k, r.data]] : [];
            }),
          ),
        )
        .catch({}),
      pros: tolerant(quotedLine, 6),
      cons: tolerant(quotedLine, 6),
      skip: tolerant(quotedLine, 4),
      price: z
        .object({ amount, currency: z.string().catch("") })
        .nullable()
        .catch(null)
        .default(null),
    }),
    20,
  ),
});
export type ReadAnswer = z.infer<typeof ReadAnswer>;

const sentence = z.object({ text: text(400), refs: strings });
export const WriteAnswer = z.object({
  products: tolerant(
    z.object({
      id: z.string(),
      why: tolerant(sentence, 4),
      tradeoff: sentence.nullable().catch(null).default(null),
      notFor: sentence.nullable().catch(null).default(null),
    }),
    12,
  ),
  assumptions: tolerant(sentence, 6),
  changeIf: tolerant(sentence, 6),
  conflicts: tolerant(sentence, 6),
});
export type WriteAnswer = z.infer<typeof WriteAnswer>;

export const CheckAnswer = z.object({
  verdicts: tolerant(
    z.object({
      n: z.coerce.number().int(),
      supported: z.preprocess(
        (v) => (typeof v === "string" ? /^(yes|true|supported)$/i.test(v.trim()) : v),
        z.boolean(),
      ),
    }),
    80,
  ),
});
export type CheckAnswer = z.infer<typeof CheckAnswer>;
