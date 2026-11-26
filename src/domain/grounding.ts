// Grounding: every number a sentence writes must be in its sources. News checks its stories with it, and Shopping its
// reasons (after taking the products' names and codes out of the sentence, so "Fen 300" is a name, not a claim).

// the numbers that carry a claim: one with a decimal, a currency, a percent or a size, or of two digits or more (a
// lone digit is too common to check). Thousands' commas go, so 1,886 and 1886 are one number. Each keeps its unit
// (%, thousand, million, billion, trillion) and its currency: $40bn is not $40tn, nor 40%
const NUMBER =
  /([$€£¥]\s?)?(\d+(?:[.,]\d+)*)(\s?(?:%|per\s?cent\b|percent\b|bn\b|billion\b|tn\b|trillion\b|mn?\b|million\b|k\b|thousand\b))?/gi;
export type Num = { n: string; unit: string; cur: string };
const UNIT: [RegExp, string][] = [
  [/^(%|per\s?cent)$/, "%"],
  [/^(k|thousand)$/, "k"],
  [/^(mn?|million)$/, "m"],
  [/^(bn|billion)$/, "bn"],
  [/^(tn|trillion)$/, "tn"],
];
export function numbersIn(text: string, all = false): Num[] {
  const out: Num[] = [];
  for (const m of text.matchAll(NUMBER)) {
    const n = m[2].replace(/,(?=\d{3}(?!\d))/g, "");
    const word = (m[3] ?? "").trim().toLowerCase();
    const unit = UNIT.find(([re]) => re.test(word))?.[1] ?? "";
    if (all || m[1] || unit || /[.,]/.test(n) || n.replace(/^0+/, "").length >= 2)
      out.push({ n, unit, cur: (m[1] ?? "").trim() });
  }
  return out;
}
// a number is grounded when its sources hold the same value with the same unit (a bare one, any unit), and the same
// currency when both name one
export const holds = (source: Num[], x: Num) =>
  source.some((s) => s.n === x.n && (!x.unit || s.unit === x.unit) && (!x.cur || !s.cur || s.cur === x.cur));
export const grounded = (text: string, source: Num[], all = false) =>
  numbersIn(text, all).every((x) => holds(source, x));
