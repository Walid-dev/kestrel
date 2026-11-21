// Pure text math for the reader, kept in shared so node:test can prove it and the web may import it: the document split into lines that know their place in the whole text, and one
// line's text split into segments by the notes that touch it. No DOM here, so node:test can prove it.
export type Line = {
  n: number;
  at: number; // where the line starts in the whole text
  text: string;
  kind: "h1" | "h2" | "h3" | "bullet" | "fence" | "code" | "blank" | "plain";
};

export function lineKinds(text: string): Line[] {
  const out: Line[] = [];
  let inFence = false;
  let at = 0;
  for (const raw of text.split("\n")) {
    let kind: Line["kind"];
    if (/^\s*```/.test(raw)) {
      kind = "fence";
      inFence = !inFence;
    } else if (inFence) kind = "code";
    else if (raw.startsWith("# ")) kind = "h1";
    else if (raw.startsWith("## ")) kind = "h2";
    else if (raw.startsWith("### ")) kind = "h3";
    else if (/^\s*[-*] /.test(raw)) kind = "bullet";
    else if (raw.trim() === "") kind = "blank";
    else kind = "plain";
    out.push({ n: out.length, at, text: raw, kind });
    at += raw.length + 1; // the newline
  }
  return out;
}

export type Seg = { at: number; text: string; noteId: string | null };

// the line's text cut by the note ranges that touch it; the first note wins where two overlap
export function segments(
  line: { at: number; text: string },
  notes: { id: string; at: number | null; end: number | null }[],
): Seg[] {
  const from = line.at;
  const to = line.at + line.text.length;
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
    if (c.s > i) out.push({ at: i, text: line.text.slice(i - from, c.s - from), noteId: null });
    out.push({ at: c.s, text: line.text.slice(c.s - from, c.e - from), noteId: c.id });
    i = c.e;
  }
  if (i < to || out.length === 0) out.push({ at: i, text: line.text.slice(i - from), noteId: null });
  return out;
}
