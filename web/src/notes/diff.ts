// A line diff for the review, the way code diffs read: minus lines out, plus lines in, context around them. A small
// document shows whole; a big one shows hunks with a little context.
export type DiffLine = { kind: "same" | "del" | "add"; text: string };

export function lineDiff(a: string, b: string): DiffLine[] {
  const A = a.split("\n");
  const B = b.split("\n");
  const dp: number[][] = Array.from({ length: A.length + 1 }, () => new Array<number>(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--)
    for (let j = B.length - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) {
      out.push({ kind: "same", text: A[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ kind: "del", text: A[i++] });
    else out.push({ kind: "add", text: B[j++] });
  }
  while (i < A.length) out.push({ kind: "del", text: A[i++] });
  while (j < B.length) out.push({ kind: "add", text: B[j++] });
  return out;
}

export type DiffRow = DiffLine | { kind: "skip"; text: string };

// the whole document when it is small; otherwise the changed parts with `context` lines around each
export function diffRows(a: string, b: string, wholeUnder = 3500, context = 2): DiffRow[] {
  const lines = lineDiff(a, b);
  if (a.length <= wholeUnder) return lines;
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((l, i) => {
    if (l.kind === "same") return;
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep[k] = true;
  });
  const out: DiffRow[] = [];
  let skipped = 0;
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (skipped > 0) out.push({ kind: "skip", text: `… ${skipped} unchanged lines …` });
      skipped = 0;
      out.push(l);
    } else skipped++;
  });
  if (skipped > 0) out.push({ kind: "skip", text: `… ${skipped} unchanged lines …` });
  return out;
}
