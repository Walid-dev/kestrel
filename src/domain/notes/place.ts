// Placing the model's changes in the original text, by code only: a change lands where its text appears exactly once;
// when it repeats, inside or nearest its note's words; of two overlapping changes, the first wins. Everything else is
// listed with the reason instead of guessed.
import type { Change } from "../../ai/changes/shape.ts";

export type Placement = { change: Change; at: number };
export type LeftOut = { change: Change; reason: string };
export type Placed = { placed: Placement[]; leftOut: LeftOut[] };

export function place(text: string, changes: Change[], noteAt: Map<string, number | null>): Placed {
  const placed: Placement[] = [];
  const leftOut: LeftOut[] = [];
  for (const change of changes) {
    const spots: number[] = [];
    for (let i = text.indexOf(change.find); i !== -1; i = text.indexOf(change.find, i + 1)) spots.push(i);
    let at: number | null = null;
    if (spots.length === 0) {
      leftOut.push({ change, reason: "its text is not in the document" });
      continue;
    }
    if (spots.length === 1) at = spots[0];
    else {
      const anchor = change.notes.map((id) => noteAt.get(id)).find((a) => a !== null && a !== undefined) ?? null;
      if (anchor === null) {
        leftOut.push({ change, reason: `its text repeats ${spots.length} times and its note doesn't point at one` });
        continue;
      }
      const inside = spots.find((s) => s <= anchor && anchor <= s + change.find.length);
      at = inside ?? spots.reduce((a, b) => (Math.abs(b - anchor) < Math.abs(a - anchor) ? b : a));
    }
    const end = at + change.find.length;
    if (placed.some((p) => at < p.at + p.change.find.length && p.at < end)) {
      leftOut.push({ change, reason: "it overlaps an earlier change" });
      continue;
    }
    placed.push({ change, at });
  }
  placed.sort((a, b) => a.at - b.at);
  return { placed, leftOut };
}

// the new text, the placements applied back to front so earlier offsets stay true
export function apply(text: string, placed: Placement[]): string {
  let out = text;
  for (const p of [...placed].sort((a, b) => b.at - a.at))
    out = out.slice(0, p.at) + p.change.replace + out.slice(p.at + p.change.find.length);
  return out;
}
