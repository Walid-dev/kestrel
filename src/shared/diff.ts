// A line diff for the review, the way code diffs read: minus lines out, plus lines in, context around them. A small
// document shows whole; a big one shows hunks with a little context. Kept in shared so node:test can prove it.
export type DiffLine = { kind: "same" | "del" | "add"; text: string };

// the matrix would be lines-by-lines: past this, the middle shows as out-then-in instead of freezing the phone
const MATRIX_LIMIT = 4_000_000;

export function lineDiff(a: string, b: string): DiffLine[] {
  const A = a.split("\n");
  const B = b.split("\n");
  // the unchanged head and tail cost nothing: trim them before any matrix (review R2-8)
  let head = 0;
  while (head < A.length && head < B.length && A[head] === B[head]) head++;
  let tail = 0;
  while (tail < A.length - head && tail < B.length - head && A[A.length - 1 - tail] === B[B.length - 1 - tail]) tail++;
  const midA = A.slice(head, A.length - tail);
  const midB = B.slice(head, B.length - tail);
  const out: DiffLine[] = A.slice(0, head).map((text) => ({ kind: "same" as const, text }));
  if ((midA.length + 1) * (midB.length + 1) > MATRIX_LIMIT) {
    // too big to align line by line: every change still shows, as the old middle out and the new middle in
    out.push(...midA.map((text) => ({ kind: "del" as const, text })));
    out.push(...midB.map((text) => ({ kind: "add" as const, text })));
  } else {
    const dp: number[][] = Array.from({ length: midA.length + 1 }, () => new Array<number>(midB.length + 1).fill(0));
    for (let i = midA.length - 1; i >= 0; i--)
      for (let j = midB.length - 1; j >= 0; j--)
        dp[i][j] = midA[i] === midB[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0;
    let j = 0;
    while (i < midA.length && j < midB.length) {
      if (midA[i] === midB[j]) {
        out.push({ kind: "same", text: midA[i] });
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ kind: "del", text: midA[i++] });
      else out.push({ kind: "add", text: midB[j++] });
    }
    while (i < midA.length) out.push({ kind: "del", text: midA[i++] });
    while (j < midB.length) out.push({ kind: "add", text: midB[j++] });
  }
  out.push(...A.slice(A.length - tail).map((text) => ({ kind: "same" as const, text })));
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
