// The quiz's answers, read tolerantly: an unknown verdict reads as partly, a lone string where the lines belong is
// one line, and a code line keeps its code.
import { z } from "zod";

const line = z.union([z.string(), z.object({ code: z.string() })]);

export const Grade = z.object({
  verdict: z.enum(["right", "partly", "wrong"]).catch("partly"),
  why: z.string().catch(""),
  correct: z.preprocess((v) => (typeof v === "string" ? [v] : v), z.array(line).catch([])).default([]),
});
export type Grade = z.infer<typeof Grade>;

export const Made = z.object({ q: z.string().min(1), a: z.string().min(1) });
