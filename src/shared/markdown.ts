// Markdown, read for the screen: a document parsed into blocks (headings, paragraphs, lists, quotes, code, tables,
// rules) and inline runs (text, code, emphasis, links). Every run of text keeps its place in the source, so my notes
// mark the rendered words and a selection maps back to the exact characters it covers. The rule every text run keeps:
// run.text === source.slice(run.at, run.at + run.text.length). Pure TypeScript with no package and no DOM: the web
// renders it (web/src/ui/markdown.tsx), and the server may read it too.
// Safety: raw HTML is never rendered (it stays text), and a link opens only an http(s):, mailto: or relative address;
// anything else stays text. kestrel keeps every document as LF text; a CRLF line still reads right (its \r sits
// outside the line's words).

// how a document reads: Markdown; a PDF's or a plain text's lines, each kept; or code, as written
export type DocKind = "markdown" | "lines" | "code";

const MARKDOWN = new Set(["md", "markdown", "mdown", "mkd", "mdx"]);
const LINES = new Set(["pdf", "txt", "text", "rst", "org", ""]);
export function docKind(name: string): DocKind {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  return MARKDOWN.has(ext) ? "markdown" : LINES.has(ext) ? "lines" : "code";
}

// a leaf holds words at their place; the others hold leaves
export type Leaf = { k: "text"; at: number; text: string } | { k: "code"; at: number; text: string };
export type Run =
  | Leaf
  | { k: "br"; at: number } // a hard line break
  | { k: "em"; kids: Run[] }
  | { k: "strong"; kids: Run[] }
  | { k: "del"; kids: Run[] }
  | { k: "link"; href: string; title: string; kids: Run[] };

export type Align = "left" | "center" | "right" | null;
export type Level = 1 | 2 | 3 | 4 | 5 | 6;
export type Cell = { from: number; to: number; runs: Run[] };
export type Item = { from: number; to: number; check: boolean | null; blocks: Block[] };
// from and to: the block's whole extent in the source, its marks included
export type Block =
  | { k: "heading"; from: number; to: number; level: Level; slug: string; runs: Run[] }
  | { k: "para"; from: number; to: number; runs: Run[] }
  | { k: "code"; from: number; to: number; lang: string; runs: Leaf[] }
  | { k: "quote"; from: number; to: number; blocks: Block[] }
  | { k: "list"; from: number; to: number; ordered: boolean; start: number; tight: boolean; items: Item[] }
  | { k: "table"; from: number; to: number; align: Align[]; head: Cell[]; rows: Cell[][] }
  | { k: "hr"; from: number; to: number };

export function parse(src: string, kind: DocKind = "markdown"): Block[] {
  if (kind === "code")
    return src ? [{ k: "code", from: 0, to: src.length, lang: "", runs: [leaf("text", src, 0)] }] : [];
  const lines: Ln[] = [];
  for (let s = 0; ; ) {
    const e = src.indexOf("\n", s);
    if (e === -1) {
      lines.push({ s, e: src.length });
      break;
    }
    lines.push({ s, e: e > s && src[e - 1] === "\r" ? e - 1 : e }); // a CRLF line ends before its \r
    s = e + 1;
  }
  return kind === "lines" ? lineBlocks(src, lines) : blocks(src, lines, new Map());
}

// a link's address, if it may open: http(s):, mailto: or relative (a path, a #part); null for anything else
export function safeHref(raw: string): string | null {
  const href = raw.trim();
  // a control character could hide a scheme from this check: browsers drop tabs and newlines inside an address
  // biome-ignore lint/suspicious/noControlCharactersInRegex: finding them is the point
  if (href === "" || /[\u0000-\u001f\u007f]/.test(href)) return null;
  const scheme = href.match(/^([A-Za-z][A-Za-z0-9+.-]*):/);
  if (scheme && !/^(?:https?|mailto)$/i.test(scheme[1])) return null;
  return href.replaceAll(" ", "%20");
}

// every leaf in reading order: what the reader marks, and what the tests hold to the rule
export function leaves(list: Block[]): Leaf[] {
  const out: Leaf[] = [];
  const runs = (rs: Run[]) => {
    for (const r of rs)
      if ("kids" in r) runs(r.kids);
      else if (r.k !== "br") out.push(r);
  };
  const walk = (bs: Block[]) => {
    for (const b of bs)
      if (b.k === "heading" || b.k === "para") runs(b.runs);
      else if (b.k === "code") out.push(...b.runs);
      else if (b.k === "quote") walk(b.blocks);
      else if (b.k === "list") for (const it of b.items) walk(it.blocks);
      else if (b.k === "table") for (const c of [...b.head, ...b.rows.flat()]) runs(c.runs);
  };
  walk(list);
  return out;
}

// a note's quote as it reads on the page: the paired marks between its words (** __ ~~ `) left out
export const bare = (quote: string): string => quote.replace(/\*\*|__|~~|`+/g, "");

// the words a run shows, its marks gone
export function plain(rs: Run[]): string {
  return rs.map((r) => ("kids" in r ? plain(r.kids) : r.k === "br" ? "\n" : r.text)).join("");
}

// where a block's words start and end in the source: its first leaf to its last, its own marks left out
export function wordsRange(rs: Run[]): [number, number] | null {
  const ls = leaves([{ k: "para", from: 0, to: 0, runs: rs }]);
  if (ls.length === 0) return null;
  const last = ls[ls.length - 1];
  return [ls[0].at, last.at + last.text.length];
}

// ---- blocks ----

type Ln = { s: number; e: number }; // one line's content: from s (after any container's marks) to e (the line's end)
type Slugs = Map<string, number>;

const leaf = (k: Leaf["k"], src: string, at: number, end = src.length): Leaf => ({ k, at, text: src.slice(at, end) });
const isSpace = (c: string | undefined) => c === " " || c === "\t";

// the columns of a line's leading white space (a tab runs to the next stop of 4) and where its text starts
function indent(src: string, l: Ln): { cols: number; at: number } {
  let cols = 0;
  let at = l.s;
  while (at < l.e && isSpace(src[at])) {
    cols += src[at] === "\t" ? 4 - (cols % 4) : 1;
    at++;
  }
  return { cols, at };
}
const blank = (src: string, l: Ln) => indent(src, l).at >= l.e;

// the line past `cols` columns of its white space (a tab that runs past them goes whole)
function strip(src: string, l: Ln, cols: number): Ln {
  let c = 0;
  let s = l.s;
  while (s < l.e && c < cols && isSpace(src[s])) {
    c += src[s] === "\t" ? 4 - (c % 4) : 1;
    s++;
  }
  return { s, e: l.e };
}

const ATX = /^(#{1,6})(?:[ \t]+|$)/;
const FENCE = /^(`{3,}|~{3,})(.*)$/;
const HR = /^(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const BULLET = /^([-+*])(?=[ \t]|$)/;
const ORDERED = /^(\d{1,9})([.)])(?=[ \t]|$)/;
const SETEXT = /^(?:=+|-+)[ \t]*$/;
const DELIM_ROW = /^\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const TASK = /^\[([ xX])\](?=[ \t]|$)/;

const fenceOf = (rest: string) => {
  const m = rest.match(FENCE);
  return m && !(m[1][0] === "`" && m[2].includes("`")) ? m : null;
};

type Marker = { ordered: boolean; ch: string; num: number; at: number; content: number; width: number; empty: boolean };
// a list item's marker on this line: its kind, and the column its content sits at (later lines indent to it)
function marker(src: string, l: Ln): Marker | null {
  const { cols, at } = indent(src, l);
  if (cols >= 4 || at >= l.e) return null;
  const rest = src.slice(at, l.e);
  if (HR.test(rest)) return null; // "- - -" and "* * *" are rules, not items
  const b = rest.match(BULLET);
  const o = b ? null : rest.match(ORDERED);
  if (!b && !o) return null;
  const mark = (b ?? o) as RegExpMatchArray;
  const after = at + mark[0].length;
  let q = after;
  let sp = 0;
  while (q < l.e && isSpace(src[q])) {
    sp += src[q] === "\t" ? 4 - ((cols + mark[0].length + sp) % 4) : 1;
    q++;
  }
  const empty = q >= l.e;
  const head = cols + mark[0].length;
  // five spaces or more after the marker: one belongs to it, the rest make indented code
  const [width, content] = empty ? [head + 1, l.e] : sp > 4 ? [head + 1, after + 1] : [head + sp, q];
  return {
    ordered: !b,
    ch: b ? b[1] : (o as RegExpMatchArray)[2],
    num: o ? Number(o[1]) : 1,
    at,
    content,
    width,
    empty,
  };
}

// does this line, as the next of a paragraph, start a block of its own instead?
function interrupts(src: string, l: Ln): boolean {
  const { cols, at } = indent(src, l);
  if (cols >= 4 || at >= l.e) return false;
  const rest = src.slice(at, l.e);
  if (ATX.test(rest) || fenceOf(rest) || HR.test(rest) || rest[0] === ">") return true;
  const m = marker(src, l);
  return !!m && !m.empty && (!m.ordered || m.num === 1);
}

// the fence still open after one more line, if any (a lazy line never joins code). Kept line by line as a quote or a
// list item grows: checking all its lines again at each lazy line took quadratic time.
function fenceAfter(src: string, l: Ln, open: string | null): string | null {
  const { cols, at } = indent(src, l);
  if (cols >= 4) return open;
  const f = src.slice(at, l.e).match(/^(`{3,}|~{3,})/);
  if (!f) return open;
  if (open === null) return f[1];
  return f[1][0] === open[0] && f[1].length >= open.length ? null : open;
}

// the cells of a table row: split at each | not escaped, the outer pipes dropped, each cell trimmed
function cellsOf(src: string, l: Ln): Ln[] {
  let { at: s } = indent(src, l);
  let e = l.e;
  while (e > s && isSpace(src[e - 1])) e--;
  if (src[s] === "|") s++;
  if (e > s && src[e - 1] === "|" && src[e - 2] !== "\\") e--;
  const out: Ln[] = [];
  let start = s;
  for (let i = s; i <= e; i++) {
    if (i < e && src[i] === "\\") {
      i++;
      continue;
    }
    if (i === e || src[i] === "|") {
      let a = start;
      let b = i;
      while (a < b && isSpace(src[a])) a++;
      while (b > a && isSpace(src[b - 1])) b--;
      out.push({ s: a, e: b });
      start = i + 1;
    }
  }
  return out;
}

// a table starts here: a row with a pipe, then a delimiter row with as many cells
function tableAt(src: string, lines: Ln[], i: number): boolean {
  const head = lines[i];
  const delim = lines[i + 1];
  if (!delim) return false;
  const h = indent(src, head);
  const d = indent(src, delim);
  if (h.cols >= 4 || d.cols >= 4) return false;
  const row = src.slice(h.at, head.e);
  const dl = src.slice(d.at, delim.e);
  if (!row.includes("|") || !dl.includes("|") || !DELIM_ROW.test(dl)) return false;
  return cellsOf(src, head).length === cellsOf(src, delim).length;
}

function blocks(src: string, lines: Ln[], slugs: Slugs): Block[] {
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    const { cols, at } = indent(src, l);
    if (at >= l.e) {
      i++;
      continue;
    }
    if (cols >= 4) {
      i = indentedCode(src, lines, i, out);
      continue;
    }
    const rest = src.slice(at, l.e);
    const fence = fenceOf(rest);
    if (fence) {
      i = fenced(src, lines, i, out, cols, fence);
      continue;
    }
    const atx = rest.match(ATX);
    if (atx) {
      let cs = at + atx[0].length;
      let ce = l.e;
      while (ce > cs && isSpace(src[ce - 1])) ce--;
      // an optional closing run of #, after a space (or the whole content)
      let k = ce;
      while (k > cs && src[k - 1] === "#") k--;
      if (k < ce && (k === cs || isSpace(src[k - 1]))) {
        ce = k;
        while (ce > cs && isSpace(src[ce - 1])) ce--;
      }
      if (cs > ce) cs = ce;
      out.push(heading(src, [{ s: cs, e: ce }], atx[1].length, at, l.e, slugs));
      i++;
      continue;
    }
    if (HR.test(rest)) {
      out.push({ k: "hr", from: at, to: l.e });
      i++;
      continue;
    }
    if (rest[0] === ">") {
      i = quote(src, lines, i, out, slugs);
      continue;
    }
    if (marker(src, l)) {
      i = list(src, lines, i, out, slugs);
      continue;
    }
    if (tableAt(src, lines, i)) {
      i = table(src, lines, i, out);
      continue;
    }
    i = paragraph(src, lines, i, out, slugs);
  }
  return out;
}

function heading(
  src: string,
  segs: Ln[],
  level: number,
  from: number,
  to: number,
  slugs: Slugs,
  runs: Run[] = inline(src, segs), // a PDF's title has no Markdown in it: lineRuns
): Block {
  // the address a #part link finds it by, as GitHub and VS Code make it; repeats get -1, -2…
  const base =
    plain(runs)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .trim()
      .replace(/\s+/g, "-") || "section";
  const n = slugs.get(base) ?? 0;
  slugs.set(base, n + 1);
  return { k: "heading", from, to, level: level as Level, slug: n ? `${base}-${n}` : base, runs };
}

function paragraph(src: string, lines: Ln[], i: number, out: Block[], slugs: Slugs): number {
  const segs: Ln[] = [{ s: indent(src, lines[i]).at, e: lines[i].e }];
  let j = i + 1;
  for (; j < lines.length; j++) {
    const l = lines[j];
    const { cols, at } = indent(src, l);
    if (at >= l.e) break;
    if (cols < 4) {
      // a line of = or - under the text makes it a heading
      if (SETEXT.test(src.slice(at, l.e))) {
        trimEnd(src, segs);
        out.push(heading(src, segs, src[at] === "=" ? 1 : 2, segs[0].s, l.e, slugs));
        return j + 1;
      }
      if (interrupts(src, l) || tableAt(src, lines, j)) break;
    }
    segs.push({ s: at, e: l.e });
  }
  trimEnd(src, segs);
  out.push({ k: "para", from: segs[0].s, to: segs[segs.length - 1].e, runs: inline(src, segs) });
  return j;
}

// a paragraph's last line ends at its last word: trailing spaces are no break
function trimEnd(src: string, segs: Ln[]) {
  const last = segs[segs.length - 1];
  let e = last.e;
  while (e > last.s && isSpace(src[e - 1])) e--;
  segs[segs.length - 1] = { s: last.s, e };
}

// code's lines as leaves, each newline at its place between them
function codeRuns(src: string, body: Ln[]): Leaf[] {
  const out: Leaf[] = [];
  body.forEach((l, n) => {
    // the line's end as the source has it: \n, or \r\n
    if (n > 0) push(out, leaf("text", src, body[n - 1].e, src.indexOf("\n", body[n - 1].e) + 1));
    if (l.e > l.s) push(out, leaf("text", src, l.s, l.e));
  });
  return out;
}

function fenced(src: string, lines: Ln[], i: number, out: Block[], cols: number, f: RegExpMatchArray): number {
  const ch = f[1][0];
  const body: Ln[] = [];
  let j = i + 1;
  let closed = false;
  for (; j < lines.length; j++) {
    const l = lines[j];
    const ind = indent(src, l);
    const close = ind.cols < 4 ? src.slice(ind.at, l.e).match(/^(`{3,}|~{3,})[ \t]*$/) : null;
    if (close && close[1][0] === ch && close[1].length >= f[1].length) {
      closed = true;
      break;
    }
    body.push(strip(src, l, cols));
  }
  const to = closed ? lines[j].e : (body.at(-1)?.e ?? lines[i].e);
  out.push({
    k: "code",
    from: indent(src, lines[i]).at,
    to,
    lang: f[2].trim().split(/\s+/)[0] ?? "",
    runs: codeRuns(src, body),
  });
  return closed ? j + 1 : j;
}

function indentedCode(src: string, lines: Ln[], i: number, out: Block[]): number {
  const body: Ln[] = [];
  let last = i;
  let j = i;
  for (; j < lines.length; j++) {
    const l = lines[j];
    const { cols, at } = indent(src, l);
    if (at < l.e && cols < 4) break;
    body.push(strip(src, l, 4));
    if (at < l.e) last = j;
  }
  body.length = last - i + 1; // trailing blank lines are not the code's
  out.push({ k: "code", from: body[0].s, to: lines[last].e, lang: "", runs: codeRuns(src, body) });
  return last + 1;
}

function quote(src: string, lines: Ln[], i: number, out: Block[], slugs: Slugs): number {
  const inner: Ln[] = [];
  let fence: string | null = null;
  const add = (l: Ln) => {
    inner.push(l);
    fence = fenceAfter(src, l, fence);
  };
  let j = i;
  for (; j < lines.length; j++) {
    const l = lines[j];
    const { cols, at } = indent(src, l);
    if (cols < 4 && src[at] === ">") {
      add({ s: at + 1 + (isSpace(src[at + 1]) ? 1 : 0), e: l.e });
      continue;
    }
    // a lazy line: plain text right after the quote's text goes on with it
    const prev = inner.at(-1);
    if (at < l.e && prev && !blank(src, prev) && !interrupts(src, l) && fence === null) {
      add({ s: at, e: l.e });
      continue;
    }
    break;
  }
  out.push({ k: "quote", from: indent(src, lines[i]).at, to: lines[j - 1].e, blocks: blocks(src, inner, slugs) });
  return j;
}

function list(src: string, lines: Ln[], i: number, out: Block[], slugs: Slugs): number {
  const first = marker(src, lines[i]) as Marker;
  const items: Item[] = [];
  let loose = false;
  let j = i;
  let end = i;
  for (;;) {
    const mk = marker(src, lines[j]) as Marker;
    // the item's lines: its first, then each one indented to its content, blank ones, and lazy text
    const inner: Ln[] = [{ s: mk.content, e: lines[j].e }];
    let fence = fenceAfter(src, inner[0], null);
    const add = (l: Ln) => {
      inner.push(l);
      fence = fenceAfter(src, l, fence);
    };
    let last = j;
    for (let k = j + 1; k < lines.length; k++) {
      const l = lines[k];
      const { cols, at } = indent(src, l);
      if (at >= l.e) {
        inner.push({ s: l.e, e: l.e });
        continue;
      }
      if (cols >= mk.width) {
        add(strip(src, l, mk.width));
        last = k;
        continue;
      }
      const prev = inner[k - 1 - j];
      if (k === last + 1 && !blank(src, prev) && !interrupts(src, l) && !marker(src, l) && fence === null) {
        add({ s: at, e: l.e });
        last = k;
        continue;
      }
      break;
    }
    inner.length = last - j + 1; // blank lines after the item belong between items
    let check: boolean | null = null;
    const task = src.slice(inner[0].s, inner[0].e).match(TASK);
    if (task) {
      check = task[1] !== " ";
      let s = inner[0].s + 3;
      while (s < inner[0].e && isSpace(src[s])) s++;
      inner[0] = { s, e: inner[0].e };
    }
    const kids = blocks(src, inner, slugs);
    // two of its blocks with a blank line between make the whole list loose
    for (let n = 1; n < kids.length; n++) if (blankBetween(src, kids[n - 1].to, kids[n].from)) loose = true;
    items.push({ from: mk.at, to: lines[last].e, check, blocks: kids });
    end = last;
    let n = last + 1;
    while (n < lines.length && blank(src, lines[n])) n++;
    const next = n < lines.length ? marker(src, lines[n]) : null;
    if (!next || next.ordered !== first.ordered || next.ch !== first.ch) break;
    if (n > last + 1) loose = true;
    j = n;
  }
  out.push({
    k: "list",
    from: first.at,
    to: lines[end].e,
    ordered: first.ordered,
    start: first.num,
    tight: !loose,
    items,
  });
  return end + 1;
}

// is there a blank line between two places? (a line of only white space, or only a quote's >)
function blankBetween(src: string, a: number, b: number): boolean {
  return /\n[ \t>\r]*\n/.test(src.slice(a, b));
}

function table(src: string, lines: Ln[], i: number, out: Block[]): number {
  const head = cellsOf(src, lines[i]);
  const align: Align[] = cellsOf(src, lines[i + 1]).map((c) => {
    const d = src.slice(c.s, c.e);
    const l = d.startsWith(":");
    const r = d.endsWith(":");
    return l && r ? "center" : r ? "right" : l ? "left" : null;
  });
  const cell = (c: Ln | undefined): Cell =>
    c ? { from: c.s, to: c.e, runs: inline(src, [c]) } : { from: -1, to: -1, runs: [] };
  const rows: Cell[][] = [];
  let j = i + 2;
  for (; j < lines.length; j++) {
    const l = lines[j];
    if (blank(src, l) || interrupts(src, l)) break;
    const cs = cellsOf(src, l);
    rows.push(head.map((_, n) => cell(cs[n])));
  }
  out.push({
    k: "table",
    from: indent(src, lines[i]).at,
    to: lines[j - 1].e,
    align,
    head: head.map((c) => cell(c)),
    rows,
  });
  return j;
}

// ---- a PDF's or a plain text's lines: each kept, a bullet at a line's start a list item ----
// A PDF's text keeps the printed line breaks, so a sentence that wrapped on the page comes in pieces: a line that only
// goes on with the sentence above it joins that paragraph or list item (continues, below); every other line keeps its
// own line.

// first-level bullets, and second-level ones that sit under a first-level item when one is just above (\uf0b7,
// \uf0a7, \uf076, \uf0d8 and \uf0fc are the bullets of Word's Symbol and Wingdings fonts, as a PDF's text may carry
// them)
const LINE_BULLET = /^[ \t]*(?:([•◦▪‣●○■–·►▸➢➤✓✔\uf0b7\uf0a7\uf076\uf0d8\uf0fc])[ \t]*(?=\S)|([-*])[ \t]+(?=\S))/;
const SECOND = new Set(["◦", "○", "–"]);

// a section's title in a PDF's text, as a CV prints it: a short line in capitals ("EXPERIENCE", "SKILLS & TOOLS"),
// never a sentence or a list
function capsTitle(line: string): boolean {
  const t = line.trim();
  const letters = t.match(/\p{L}/gu) ?? [];
  return (
    t.length <= 40 &&
    letters.length >= 2 &&
    t === t.toUpperCase() &&
    t !== t.toLowerCase() &&
    !/[,;.!?]$/.test(t) &&
    !t.includes(",")
  );
}

// the small words a wrapped line may end on mid-sentence ("…and wrote the" / "Field handbook…")
const JOINER = /(?:^|\s)(?:and|or|of|the|a|an|to|with|for|in|on|at|by|from|as|that|which|into|via|across|including)$/;
// a line that starts with an address of its own: a web address ("example.org/me", "https://…") or an email
const OWN_ADDRESS = /^(?:[a-z0-9-]+(?:\.[a-z0-9-]+)+\/|https?:|www\.|[^\s@]+@[^\s@]+\.\w)/i;

// does this line only go on with the sentence of the line above? Yes when it starts in lower case, when the line
// above left a bracket open or ends on a comma, a hyphen or a small word (and, of, the…), or when the line above
// was full (near the text's longest line, measure) without ending its sentence. Never for a heading, a bullet, an
// address or a line under a heading: a name, a role and a contact line keep their own lines.
function continues(above: string, line: string, measure: number): boolean {
  if (!above || !line || LINE_BULLET.test(line) || capsTitle(line) || capsTitle(above) || OWN_ADDRESS.test(line))
    return false;
  const open = (above.match(/\(/g)?.length ?? 0) > (above.match(/\)/g)?.length ?? 0);
  return (
    /^\p{Ll}/u.test(line) ||
    open ||
    /(?:[,&+]|\p{L}-)$/u.test(above) ||
    JOINER.test(above) ||
    (measure >= 50 && above.length >= measure * 0.85 && !/[.!?:;]$/.test(above))
  );
}

// a line's words, and whether they go on from the line before (on) rather than start a line of their own
type Seg = Ln & { on?: boolean };

function lineBlocks(src: string, lines: Ln[]): Block[] {
  const out: Block[] = [];
  const slugs: Slugs = new Map();
  const bulletOf = (l: Ln) => src.slice(l.s, l.e).match(LINE_BULLET);
  const words = (l: Ln): Ln => {
    let e = l.e;
    while (e > l.s && isSpace(src[e - 1])) e--;
    return { s: indent(src, l).at, e };
  };
  // how long a full line runs in this text: its longest line, leaving out the very long ones (sentences an upload
  // already joined, a pasted paragraph)
  const measure = lines.reduce((m, l) => (l.e - l.s <= 140 ? Math.max(m, l.e - l.s) : m), 0);
  const goesOn = (above: Ln, l: Ln) => continues(src.slice(above.s, above.e), src.slice(l.s, l.e), measure);
  let i = 0;
  while (i < lines.length) {
    if (blank(src, lines[i])) {
      i++;
      continue;
    }
    if (bulletOf(lines[i])) {
      const items: Item[] = [];
      let lastTop: { item: Item; second: boolean } | null = null;
      const from = indent(src, lines[i]).at;
      for (; i < lines.length; i++) {
        const b = bulletOf(lines[i]);
        if (!b) break;
        const w = words(lines[i]);
        const at = lines[i].s + b[0].length;
        // the item's sentence may go on in the lines under it
        const segs: Seg[] = [{ s: at, e: w.e }];
        while (i + 1 < lines.length && !blank(src, lines[i + 1]) && goesOn(segs[segs.length - 1], words(lines[i + 1])))
          segs.push({ ...words(lines[++i]), on: true });
        const end = segs[segs.length - 1].e;
        const item: Item = {
          from: w.s,
          to: end,
          check: null,
          blocks: [{ k: "para", from: at, to: end, runs: lineRuns(src, segs) }],
        };
        const ch = b[1] ?? b[2];
        if (SECOND.has(ch) && lastTop && !lastTop.second) {
          const kids = lastTop.item.blocks;
          let sub = kids.at(-1);
          if (sub?.k !== "list") {
            sub = { k: "list", from: w.s, to: end, ordered: false, start: 1, tight: true, items: [] };
            kids.push(sub);
          }
          sub.items.push(item);
          sub.to = end;
          lastTop.item.to = end;
        } else {
          items.push(item);
          lastTop = { item, second: SECOND.has(ch) };
        }
      }
      out.push({ k: "list", from, to: items.at(-1)?.to ?? from, ordered: false, start: 1, tight: true, items });
      continue;
    }
    const title = (l: Ln) => capsTitle(src.slice(l.s, l.e));
    if (title(lines[i])) {
      const w = words(lines[i]);
      out.push(heading(src, [w], 3, w.s, w.e, slugs, lineRuns(src, [w])));
      i++;
      continue;
    }
    const segs: Seg[] = [];
    for (; i < lines.length && !blank(src, lines[i]) && !bulletOf(lines[i]) && !title(lines[i]); i++) {
      const w = words(lines[i]);
      const above = segs[segs.length - 1];
      segs.push(above && goesOn(above, w) ? { ...w, on: true } : w);
    }
    out.push({ k: "para", from: segs[0].s, to: segs[segs.length - 1].e, runs: lineRuns(src, segs) });
  }
  return out;
}

// one line after another, a break between them, or for a line that goes on from the one above, the line's end read as
// a space (nothing after a hyphen: "mid-" and "size" read "mid-size"); only bare addresses become links (a PDF's text
// has no other marks)
function lineRuns(src: string, segs: Seg[]): Run[] {
  const out: Run[] = [];
  segs.forEach((g, n) => {
    const above = segs[n - 1];
    if (above && !g.on) out.push({ k: "br", at: above.e });
    else if (above && !/\p{L}-$/u.test(src.slice(above.s, above.e))) push(out, leaf("text", src, above.e, g.s));
    let lit = g.s;
    for (let i = g.s; i < g.e; i++) {
      if (i > g.s && !/[\s(]/.test(src[i - 1])) continue;
      const u = bareUrl(src, i, g.e);
      if (!u) continue;
      if (i > lit) push(out, leaf("text", src, lit, i));
      out.push({ k: "link", href: u.href, title: "", kids: [leaf("text", src, i, u.end)] });
      i = u.end - 1;
      lit = u.end;
    }
    if (g.e > lit) push(out, leaf("text", src, lit, g.e));
  });
  return out;
}

// ---- inline: the CommonMark way (a delimiter stack for emphasis, brackets for links), on a block's lines ----

type Delim = { t: "delim"; ch: string; a: number; n: number; orig: number; open: boolean; close: boolean };
type Bracket = { t: "bracket"; a: number; image: boolean; active: boolean };
type Tok =
  | { t: "text" | "code"; a: number; b: number }
  | { t: "br"; a: number }
  | Delim
  | Bracket
  | { t: "auto"; a: number; b: number; href: string }
  | { t: "node"; k: "em" | "strong" | "del"; kids: Tok[] }
  | { t: "link"; href: string; title: string; kids: Tok[] };

const ESCAPABLE = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";
const WS = /\s/u;
const PUNCT = /[\p{P}\p{S}]/u;
const AUTO_URI = /<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*)>/y;
const AUTO_MAIL =
  /<([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*)>/y;
const BARE = /(?:https?:\/\/|www\.)[^\s<]*/iy;

// a bare address (https://…, www.…) starting at i, its trailing punctuation left out as GitHub does
function bareUrl(s: string, i: number, limit = s.length): { end: number; href: string } | null {
  BARE.lastIndex = i;
  const m = BARE.exec(s);
  if (!m) return null;
  let end = Math.min(limit, i + m[0].length);
  for (;;) {
    const c = s[end - 1];
    if ("?!.,:*_~'\"".includes(c)) end--;
    else if (c === ")") {
      const part = s.slice(i, end);
      if ((part.match(/\)/g)?.length ?? 0) > (part.match(/\(/g)?.length ?? 0)) end--;
      else break;
    } else break;
  }
  const raw = s.slice(i, end);
  const host = raw.replace(/^(?:https?:\/\/|www\.)/i, "").split(/[/?#:]/)[0];
  if (!/^[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)+$/u.test(host)) return null;
  return { end, href: /^www\./i.test(raw) ? `https://${raw}` : raw };
}

const unescaped = (s: string) => s.replace(/\\([!-/:-@[-`{-~])/g, "$1");

// "(address "title")" right after a link's ], or null
function linkTail(v: string, p: number): { href: string; title: string; end: number } | null {
  if (v[p] !== "(") return null;
  const skip = (i: number) => {
    while (i < v.length && WS.test(v[i])) i++;
    return i;
  };
  let i = skip(p + 1);
  let href: string;
  if (v[i] === "<") {
    let j = i + 1;
    while (j < v.length && v[j] !== ">" && v[j] !== "\n" && v[j] !== "<") j += v[j] === "\\" ? 2 : 1;
    if (v[j] !== ">") return null;
    href = v.slice(i + 1, j);
    i = j + 1;
  } else {
    let depth = 0;
    let j = i;
    for (; j < v.length; j++) {
      const c = v[j];
      if (c === "\\" && ESCAPABLE.includes(v[j + 1] ?? "")) j++;
      else if (c === "(") depth++;
      else if (c === ")") {
        if (depth === 0) break;
        depth--;
      } else if (WS.test(c) || c < " ") break;
    }
    if (depth !== 0) return null;
    href = v.slice(i, j);
    i = j;
  }
  const afterHref = i;
  i = skip(i);
  let title = "";
  const q = v[i];
  if (i > afterHref && (q === '"' || q === "'" || q === "(")) {
    const close = q === "(" ? ")" : q;
    let j = i + 1;
    while (j < v.length && v[j] !== close) j += v[j] === "\\" ? 2 : 1;
    if (j >= v.length) return null;
    title = v.slice(i + 1, j);
    i = skip(j + 1);
  }
  if (v[i] !== ")") return null;
  return { href: unescaped(href), title: unescaped(title), end: i + 1 };
}

function flank(ch: string, before: string, after: string): { open: boolean; close: boolean } {
  const bw = WS.test(before);
  const aw = WS.test(after);
  const bp = PUNCT.test(before);
  const ap = PUNCT.test(after);
  const left = !aw && (!ap || bw || bp);
  const right = !bw && (!bp || aw || ap);
  // an underscore inside a word (snake_case) is no emphasis
  if (ch === "_") return { open: left && (!right || bp), close: right && (!left || ap) };
  return { open: left, close: right };
}

// the end of the code span that opens with n backticks before `from`, or -1 (a cache keeps it fast on long text)
function ticksEnd(v: string, from: number, n: number, none: Map<number, number>): number {
  if ((none.get(n) ?? Number.POSITIVE_INFINITY) <= from) return -1;
  for (let i = v.indexOf("`", from); i !== -1; i = v.indexOf("`", i)) {
    let m = 1;
    while (v[i + m] === "`") m++;
    if (m === n) return i;
    i += m;
  }
  none.set(n, from);
  return -1;
}

function scan(v: string): Tok[] {
  const toks: Tok[] = [];
  const brackets: Bracket[] = [];
  const none = new Map<number, number>();
  let lit = 0; // where the pending literal text starts
  const flush = (to: number) => {
    if (to > lit) toks.push({ t: "text", a: lit, b: to });
  };
  let i = 0;
  while (i < v.length) {
    const c = v[i];
    if (c === "\\") {
      const d = v[i + 1];
      if (d === "\n") {
        flush(i);
        toks.push({ t: "br", a: i });
        i += 2;
        lit = i;
        continue;
      }
      if (d !== undefined && ESCAPABLE.includes(d)) {
        flush(i);
        toks.push({ t: "text", a: i + 1, b: i + 2 });
        i += 2;
        lit = i;
        continue;
      }
      i++;
      continue;
    }
    if (c === "`") {
      let n = 1;
      while (v[i + n] === "`") n++;
      const close = ticksEnd(v, i + n, n, none);
      if (close < 0) {
        i += n;
        continue;
      }
      flush(i);
      let a = i + n;
      let b = close;
      // one space on each side comes off, when both are there and the code is more than spaces
      if (b - a >= 2 && WS.test(v[a]) && WS.test(v[b - 1]) && /\S/.test(v.slice(a, b))) {
        a++;
        b--;
      }
      toks.push({ t: "code", a, b });
      i = close + n;
      lit = i;
      continue;
    }
    if (c === "*" || c === "_" || c === "~") {
      let n = 1;
      while (v[i + n] === c) n++;
      if (c === "~" && n > 2) {
        i += n;
        continue;
      }
      flush(i);
      const { open, close } = flank(c, i === 0 ? "\n" : v[i - 1], v[i + n] ?? "\n");
      toks.push({ t: "delim", ch: c, a: i, n, orig: n, open, close });
      i += n;
      lit = i;
      continue;
    }
    if (c === "[" || (c === "!" && v[i + 1] === "[")) {
      flush(i);
      const b: Bracket = { t: "bracket", a: i, image: c === "!", active: true };
      toks.push(b);
      brackets.push(b);
      i += c === "!" ? 2 : 1;
      lit = i;
      continue;
    }
    if (c === "]") {
      const opener = brackets.pop();
      const tail = opener?.active ? linkTail(v, i + 1) : null;
      const href = tail ? safeHref(tail.href) : null;
      if (opener && tail && href !== null) {
        flush(i);
        const kids = toks.splice(toks.lastIndexOf(opener));
        kids.shift();
        emphasis(kids);
        toks.push({ t: "link", href, title: tail.title, kids: unlink(kids) });
        // no link inside a link: the brackets before this one open none any more
        if (!opener.image) for (const o of brackets) o.active = false;
        i = tail.end;
        lit = i;
        continue;
      }
      i++; // not a link (or one whose address may not open): its brackets stay as text
      continue;
    }
    if (c === "<") {
      AUTO_URI.lastIndex = i;
      AUTO_MAIL.lastIndex = i;
      const uri = AUTO_URI.exec(v);
      const mail = uri ? null : AUTO_MAIL.exec(v);
      const m = uri ?? mail;
      if (m) {
        flush(i);
        const href = uri ? safeHref(m[1]) : `mailto:${m[1]}`;
        if (href === null) toks.push({ t: "text", a: i, b: i + m[0].length });
        else toks.push({ t: "auto", a: i + 1, b: i + 1 + m[1].length, href });
        i += m[0].length;
        lit = i;
        continue;
      }
    }
    if ((c === "h" || c === "H" || c === "w" || c === "W") && (i === 0 || /[\s*_~(]/.test(v[i - 1]))) {
      const u = bareUrl(v, i);
      if (u) {
        flush(i);
        toks.push({ t: "auto", a: i, b: u.end, href: u.href });
        i = u.end;
        lit = i;
        continue;
      }
    }
    if (c === "\n") {
      // two spaces or more at a line's end break the line there
      let sp = 0;
      while (i - sp - 1 >= lit && v[i - sp - 1] === " ") sp++;
      if (sp >= 2) {
        flush(i - sp);
        toks.push({ t: "br", a: i - sp });
        i += 1;
        lit = i;
        continue;
      }
    }
    i++;
  }
  flush(v.length);
  emphasis(toks);
  return toks;
}

// no link inside a link: a bare address in its words goes back to words, an image (shown as a link) to its words
function unlink(toks: Tok[]): Tok[] {
  return toks.flatMap((t): Tok[] =>
    t.t === "auto"
      ? [{ t: "text", a: t.a, b: t.b }]
      : t.t === "link"
        ? unlink(t.kids)
        : t.t === "node"
          ? [{ ...t, kids: unlink(t.kids) }]
          : [t],
  );
}

// pair the * _ ~ runs into emphasis, strong and strikethrough (CommonMark's "process emphasis")
function emphasis(toks: Tok[]): void {
  let ci = 0;
  while (ci < toks.length) {
    const c = toks[ci];
    if (c.t !== "delim" || !c.close || c.n === 0) {
      ci++;
      continue;
    }
    let oi = ci - 1;
    for (; oi >= 0; oi--) {
      const o = toks[oi];
      if (o.t !== "delim" || o.ch !== c.ch || !o.open || o.n === 0) continue;
      if (c.ch === "~") {
        if (o.n === c.n) break;
        continue;
      }
      // the rule of 3: a run that can both open and close pairs only when the lengths allow it
      if ((o.close || c.open) && (o.orig + c.orig) % 3 === 0 && !(o.orig % 3 === 0 && c.orig % 3 === 0)) continue;
      break;
    }
    if (oi < 0) {
      c.close = false; // no opener: from here on, at most an opener itself
      ci++;
      continue;
    }
    const o = toks[oi] as Delim;
    const use = c.ch === "~" ? c.n : o.n >= 2 && c.n >= 2 ? 2 : 1;
    o.n -= use; // the opener gives its last characters, the closer its first
    const node: Tok = {
      t: "node",
      k: c.ch === "~" ? "del" : use === 2 ? "strong" : "em",
      kids: toks.slice(oi + 1, ci),
    };
    c.a += use;
    c.n -= use;
    toks.splice(oi + 1, ci - oi - 1, node);
    ci = oi + 2;
    if (o.n === 0) {
      toks.splice(oi, 1);
      ci--;
    }
    if (c.n === 0) toks.splice(ci, 1);
  }
}

// a leaf added to a list, joined with the one before when it carries straight on in the source
function push(out: Run[], l: Leaf) {
  const prev = out.at(-1);
  if ((prev?.k === "text" || prev?.k === "code") && prev.k === l.k && prev.at + prev.text.length === l.at)
    out[out.length - 1] = { k: l.k, at: prev.at, text: prev.text + l.text };
  else out.push(l);
}

// a block's inline content: its lines joined by newlines into one string, parsed, then each run put back at its place
// in the source (split where a container's marks sit between two lines)
function inline(src: string, segs: Ln[]): Run[] {
  let v = "";
  const starts: number[] = [];
  segs.forEach((g, n) => {
    if (n > 0) v += "\n";
    starts.push(v.length);
    v += src.slice(g.s, g.e);
  });
  const seg = (x: number) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= x) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const at = (x: number) => {
    const k = seg(x);
    return segs[k].s + (x - starts[k]);
  };
  // [a, b) of the joined string as leaves: a line and its newline are one stretch of the source
  const put = (k: Leaf["k"], a: number, b: number, out: Run[]) => {
    for (let x = a; x < b; ) {
      const n = seg(x);
      const y = Math.min(b, starts[n] + (segs[n].e - segs[n].s) + 1);
      const s = at(x);
      push(out, { k, at: s, text: src.slice(s, s + (y - x)) });
      x = y;
    }
  };
  const runs = (toks: Tok[]): Run[] => {
    const out: Run[] = [];
    for (const t of toks) {
      if (t.t === "text" || t.t === "code") put(t.t, t.a, t.b, out);
      else if (t.t === "delim") put("text", t.a, t.a + t.n, out);
      else if (t.t === "bracket") put("text", t.a, t.a + (t.image ? 2 : 1), out);
      else if (t.t === "br") out.push({ k: "br", at: at(t.a) });
      else if (t.t === "auto") {
        const kids: Run[] = [];
        put("text", t.a, t.b, kids);
        out.push({ k: "link", href: t.href, title: "", kids });
      } else if (t.t === "node") out.push({ k: t.k, kids: runs(t.kids) });
      else if (t.t === "link") out.push({ k: "link", href: t.href, title: t.title, kids: runs(t.kids) });
    }
    return out;
  };
  return runs(scan(v));
}
