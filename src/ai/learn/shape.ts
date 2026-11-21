// What an Ask answer must be: plain lines, at most ten, and the lessons it drew on.
import { z } from "zod";

export const AskAnswer = z.object({
  answer: z
    .string()
    .min(1)
    .refine((a) => a.split("\n").filter((l) => l.trim()).length <= 10, { message: "more than ten lines" }),
  drewOn: z.array(z.string()).default([]),
});
export type AskAnswer = z.infer<typeof AskAnswer>;
