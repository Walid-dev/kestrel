// The cover letter's answers: the draft names the needs and stories it chose, then the letter; a fix is the letter.
import { z } from "zod";

const list = z.preprocess((v) => (typeof v === "string" ? [v] : v), z.array(z.string()).catch([])).default([]);

export const LetterDraft = z.object({ needs: list, stories: list, letter: z.string().min(40) });
export const LetterFix = z.object({ letter: z.string().min(40) });
