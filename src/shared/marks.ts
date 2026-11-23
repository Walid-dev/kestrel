// My notes as marks on the rendered words: one run of text (its words and where they start in the whole document,
// as src/shared/markdown.ts gives them) cut into segments by the note ranges that touch it. Pure text math with no
// DOM, kept in shared so node:test can prove it and the web may import it.
export type Seg = { at: number; text: string; noteId: string | null };

// the run's text cut by the note ranges that touch it; the first note wins where two overlap
export function segments(
  run: { at: number; text: string },
  notes: { id: string; at: number | null; end: number | null }[],
): Seg[] {
  const from = run.at;
  const to = run.at + run.text.length;
  const cuts: { s: number; e: number; id: string }[] = [];
  for (const n of notes) {
    if (n.at === null || n.end === null) continue;
    const s = Math.max(from, n.at);
    const e = Math.min(to, n.end);
    if (s < e && !cuts.some((c) => s < c.e && c.s < e)) cuts.push({ s, e, id: n.id });
  }
  cuts.sort((a, b) => a.s - b.s);
  const out: Seg[] = [];
  let i = from;
  for (const c of cuts) {
    if (c.s > i) out.push({ at: i, text: run.text.slice(i - from, c.s - from), noteId: null });
    out.push({ at: c.s, text: run.text.slice(c.s - from, c.e - from), noteId: c.id });
    i = c.e;
  }
  if (i < to || out.length === 0) out.push({ at: i, text: run.text.slice(i - from), noteId: null });
  return out;
}
