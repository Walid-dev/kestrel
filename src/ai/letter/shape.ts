// The cover letter's answers: the draft names the needs and stories it chose, then the letter; a fix is the letter.
// The letter comes as its paragraphs, one string each (a long string with line breaks inside broke the JSON), and is
// joined with a blank line between them, as the PDF tool wants it; one whole string is still read.
import { z } from "zod";

const list = z.preprocess((v) => (typeof v === "string" ? [v] : v), z.array(z.string()).catch([])).default([]);
const letter = z.preprocess(
  (v) =>
    Array.isArray(v)
      ? v
          .map((p) => String(p).trim())
          .filter(Boolean)
          .join("\n\n")
      : v,
  z.string().min(40),
);

export const LetterDraft = z.object({ needs: list, stories: list, letter });
export const LetterFix = z.object({ letter });
