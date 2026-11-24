// The morning news' two answers, read tolerantly as Research's are: item numbers as 3, "3" or "[3]"; an unknown
// section becomes "tech"; a story that can't be read is left out alone; an opening written as one string is split into
// its sentences. The code checks the rest after (src/domain/news/brief.ts): which items exist, the links, the numbers.
import { z } from "zod";
import { SECTION_KEYS, type Section } from "../../shared/news.ts";

const ids = z
  .preprocess((v) => (Array.isArray(v) ? v : v == null ? [] : [v]), z.array(z.unknown()))
  .transform((list) =>
    list.map((x) => Number(String(x).replace(/[[\]\s#]/g, ""))).filter((n) => Number.isInteger(n) && n > 0),
  )
  .catch([]);

const section = z
  .string()
  .catch("tech")
  .transform((s): Section => {
    const key = s.trim().toLowerCase();
    return (SECTION_KEYS as string[]).includes(key) ? (key as Section) : "tech";
  });

// a list of parts that can each fail alone: the good ones stay, twelve at most
const tolerant = <T>(one: z.ZodType<T>) =>
  z.array(z.unknown()).transform((list) =>
    list.slice(0, 12).flatMap((x) => {
      const r = one.safeParse(x);
      return r.success ? [r.data] : [];
    }),
  );

const words = z.preprocess((v) => (Array.isArray(v) ? v.join(" ") : v), z.string());

export const PickAnswer = z.object({
  stories: tolerant(z.object({ section, items: ids, why: words.catch("") })),
});
export type PickAnswer = z.infer<typeof PickAnswer>;

export const sentences = (s: string): string[] =>
  s
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“‘(])/)
    .map((x) => x.trim())
    .filter(Boolean);

export const BriefAnswer = z.object({
  opening: z.preprocess((v) => (typeof v === "string" ? sentences(v) : v), z.array(z.string())).catch([]),
  stories: tolerant(
    z.object({
      story: z.coerce.number().int().catch(0),
      headline: words.pipe(z.string().trim().min(1)),
      text: words.pipe(z.string().trim().min(1)),
      figure: z
        .union([z.string(), z.number()])
        .transform((v) => String(v).trim())
        .catch(""),
      trend: z.enum(["up", "down", "none"]).catch("none"),
      items: ids,
    }),
  ),
  quiet: words.catch(""),
});
export type BriefAnswer = z.infer<typeof BriefAnswer>;
