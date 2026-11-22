// Writing's answers: the draft names the needs and stories it chose, then the text; a fix is the text. The text comes
// as its paragraphs, one string each (a long string with line breaks inside broke the JSON), joined with a blank line
// between them, as the PDF tool wants a letter; one whole string is still read.
import { z } from "zod";

const list = z.preprocess((v) => (typeof v === "string" ? [v] : v), z.array(z.string()).catch([])).default([]);
const text = z.preprocess(
  (v) =>
    Array.isArray(v)
      ? v
          .map((p) => String(p).trim())
          .filter(Boolean)
          .join("\n\n")
      : v,
  z.string().min(40),
);
// the text under "text" (older answers called it "letter": still read)
const named = (v: unknown) =>
  v && typeof v === "object" && !("text" in v) && "letter" in v ? { ...v, text: (v as { letter: unknown }).letter } : v;

export const LetterDraft = z.preprocess(named, z.object({ needs: list, stories: list, text }));
export const LetterFix = z.preprocess(named, z.object({ text }));
