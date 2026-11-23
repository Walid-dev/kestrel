// The Ask scorer, for a hunt's page: deterministic. A pass asks kestrel for what the question needs, in the page's
// blocks: a find when the answer lies beyond the listings in view, a change proposed for the right listing (and never
// claimed as made: it waits for my tap), and neither for a question about the subject itself; a listing it names is
// linked by its exact id.
import { blocksOf } from "../../src/domain/ask/ask.ts";

export type Expect = {
  find?: { words?: string }; // a find block, its words naming this
  action?: { do: "stage" | "deep" | "apply"; listing: string; to?: string };
  link?: string; // a listing the answer links
  none?: boolean; // no find, no change
};
export type Case = { name: string; question: string; expect: Expect; good: string; bad: string; badWhy: string };

const CLAIMED = /\b(i('ve| have)|has been|is now|i just) (marked|applied|queued|started|moved|set)\b/i;

const field = (o: unknown, k: string) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined);

export function score(c: Case, answer: string, ids: string[]): { pass: boolean; reasons: string[] } {
  if (answer.trim() === "") return { pass: false, reasons: ["empty: no answer"] };
  const { find, actions, words } = blocksOf(answer);
  const reasons: string[] = [];
  const e = c.expect;
  if (e.find) {
    if (!find.length) reasons.push("no find for what lies beyond the page");
    else if (
      e.find.words &&
      !find.some((f) =>
        String(field(f, "words") ?? "")
          .toLowerCase()
          .includes(e.find?.words ?? ""),
      )
    )
      reasons.push(`its find doesn't look for ${e.find.words}`);
  }
  if (e.action) {
    const want = e.action;
    const hit = actions.some(
      (a) =>
        field(a, "do") === want.do && field(a, "listing") === want.listing && (!want.to || field(a, "to") === want.to),
    );
    if (!hit) reasons.push(`no ${want.do} proposed for ${want.listing}`);
    if (CLAIMED.test(words)) reasons.push("claims the change is made before my tap");
  }
  if (e.none && (find.length || actions.length)) reasons.push("a block for a question that needs none");
  if (e.link && !words.includes(`(listing:${e.link})`)) reasons.push(`doesn't link ${e.link}`);
  for (const m of words.matchAll(/\]\(listing:([^)\s]+)\)/g))
    if (!ids.includes(m[1])) reasons.push(`links a listing that isn't there: ${m[1]}`);
  return { pass: reasons.length === 0, reasons };
}
