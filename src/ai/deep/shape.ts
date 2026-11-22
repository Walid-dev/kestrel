// The two deep-check reports, the old setup's shapes: read tolerantly (a missing list is empty, a stray string in a
// list is kept), so a near-miss answer still lands.
import { z } from "zod";

const list = z.preprocess((v) => (typeof v === "string" ? [v] : v), z.array(z.string()).catch([])).default([]);
const sources = z
  .array(z.object({ title: z.string().catch(""), url: z.string().catch("") }))
  .catch([])
  .default([]);

export const JobReport = z.object({
  verdict: z.enum(["apply", "maybe", "skip"]).catch("maybe"),
  headline: z.string().min(1),
  strengths: list,
  gaps: list,
  pay: z.string().catch("").default(""),
  company: z.string().catch("").default(""),
  red_flags: list,
  questions: list,
  pitch: list,
  sources,
});
export type JobReport = z.infer<typeof JobReport>;

export const DealReport = z.object({
  verdict: z.enum(["buy", "negotiate", "skip", "unsure"]).catch("unsure"),
  headline: z.string().min(1),
  fair_low: z.number().nullable().catch(null).default(null),
  fair_high: z.number().nullable().catch(null).default(null),
  offer: z.number().nullable().catch(null).default(null),
  price_why: z.string().catch("").default(""),
  checks: list,
  red_flags: list,
  questions: list,
  about: z.string().catch("").default(""),
  sources,
});
export type DealReport = z.infer<typeof DealReport>;
