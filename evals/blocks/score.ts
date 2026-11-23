// The drawings scorer: deterministic. A pass draws the kind the question's subject has (a process as a flow, versions
// as a timeline, numbers as a chart…), and every drawing it writes reads; a question that needs none gets none. At
// most two drawings in an answer.
import { drawingsIn, type Kind } from "../../src/shared/blocks.ts";

export type Expect = { kind?: Kind; tone?: "warn" | "tip"; none?: boolean };
export type Case = { name: string; question: string; expect: Expect; good: string; bad: string; badWhy: string };

export function score(c: Case, answer: string): { pass: boolean; reasons: string[] } {
  if (answer.trim() === "") return { pass: false, reasons: ["empty: no answer"] };
  const got = drawingsIn(answer);
  const drew = got.map((g) => g.kind).join(", ");
  const reasons: string[] = [];
  for (const g of got) if (!g.drawing) reasons.push(`a ${g.kind} that doesn't read`);
  if (got.length > 2) reasons.push(`more than two drawings (${drew})`);
  const e = c.expect;
  if (e.kind) {
    const hit = got.find((g) => g.kind === e.kind && g.drawing);
    if (!hit && !got.some((g) => g.kind === e.kind)) reasons.push(`no ${e.kind}${drew ? ` (drew ${drew})` : ""}`);
    if (hit?.drawing?.kind === "callout" && e.tone && hit.drawing.tone !== e.tone)
      reasons.push(`a callout, but not a ${e.tone === "warn" ? "warning" : "tip"}`);
  }
  if (e.none && got.length) reasons.push(`drew ${drew} for a question that needs none`);
  return { pass: reasons.length === 0, reasons };
}
