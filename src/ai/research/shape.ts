// Research's answers, read tolerantly: a stray string where a list belongs still lands, an unknown block is kept for
// the page to skip, and the sources are the numbers of the pages read.
import { z } from "zod";

const list = z.preprocess((v) => (typeof v === "string" ? [v] : v), z.array(z.string()).catch([])).default([]);

export const Plan = z.object({ queries: list });
export const Questions = z.object({ questions: list });

export const ResearchReport = z.object({
  title: z.string().min(1),
  short: z.string().min(1),
  blocks: z.array(z.record(z.string(), z.unknown())).catch([]).default([]),
  words: z
    .array(z.object({ w: z.string().catch(""), m: z.string().catch("") }))
    .catch([])
    .default([]),
  unsure: list,
  sources: z.array(z.coerce.number().int()).catch([]).default([]),
});
export type ResearchReport = z.infer<typeof ResearchReport>;
