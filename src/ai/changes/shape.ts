// What a good answer must be, before any feature asks for one: an overview that covers each document, changes that
// quote the exact text they replace and name the notes they answer, and every note left unanswered excused with a
// reason. The eval (evals/changes) holds the model to it.
import { z } from "zod";

export const Change = z.object({
  document: z.string().min(1), // the document's name
  find: z.string().min(1), // the exact text to replace, as it stands in the document
  replace: z.string(), // the new text; empty means remove
  notes: z.array(z.string()).min(1), // the ids of the notes this change answers
});
export type Change = z.infer<typeof Change>;

export const Answer = z.object({
  // a small model sometimes writes the overview as one line per document: an array is read, joined, and held to the
  // same rule
  overview: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v.join(" ") : v))
    .pipe(z.string().min(1)),
  changes: z.array(Change),
  unanswered: z.array(z.object({ note: z.string().min(1), reason: z.string().min(1) })).default([]),
});
export type Answer = z.infer<typeof Answer>;
