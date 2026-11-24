// The design check, a ratchet: a page's one-off looks may only shrink. In every file of web/src outside the shared
// parts (web/src/ui/, and styles.css, which holds the look), it counts the inline style values the design system owns
// (a colour, a background, a border's colour, an SVG fill or stroke, a font's size or family, a line height, padding,
// margin, a gap), the raw colours (#hex, rgb(), hsl(), oklch()), and in its class lists: btn-head (gone: a head's
// buttons are plain .btn), font-bold beside a heading step (the step carries its own weight) and a radius off the
// ladder (6, 8, 12, 14, 999). In styles.css it counts a font size in px, rem or em (every size reads a type step)
// and a radius off the five (6, 8, 12, 14, 999). The check fails when a file has more than its number in scripts/design-baseline.json,
// and prints each one at file:line with what to use instead. A value that changes at run time goes through a CSS
// variable (style={{ "--part": … }}), which is not counted; a deliberate exception carries "design-ok: <why>" on its
// line (in styles.css, in a comment on that line).
//   node scripts/check-design.ts                 the check (inside node --run check)
//   node scripts/check-design.ts <file>…         also list every one-off left in those files
//   node scripts/check-design.ts --write         record today's counts, after a page moved onto the parts
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

export type Hit = { line: number; what: string; fix: string };

// the variables that have a class (styles.css, @theme inline), by the class's name: --bg paints as page, --text as ink
const ROLE: Record<string, string> = {
  ...Object.fromEntries(
    "surface surface-2 surface-hover line line-strong strong muted accent accent-soft green red orange yellow purple pink pink-soft cyan teal magenta ok warn warn-soft add-soft del-soft great good fair poor tone"
      .split(" ")
      .map((r) => [r, r]),
  ),
  bg: "page",
  text: "ink",
};

const STEPS =
  "a type step: text-label 11, text-small 12, text-detail 13, text-body 14, text-read 16, text-head 16, text-section 18, text-lead 22, text-title 26 (in styles.css, var(--text-…); touch makes small, detail and body a step bigger)";
const RADIUS =
  "a radius on the ladder: 6 (pills, chips, .btn-sm), 8 (controls, inner blocks), 12 (cards, lists), 14 (a dialog, the dock), 999 (round)";
// the ladder's radii as classes: rounded-md 6, rounded-lg 8, rounded-xl 12, rounded-full, rounded-none, and the
// steps written out ([14px] for something that floats, as a dialog does)
const ROUNDED_OK = new Set(["md", "lg", "xl", "full", "none", "[6px]", "[8px]", "[12px]", "[14px]"]);
const RADII_OK = /^(0|6px|8px|12px|14px|999px|50%|inherit|var\(--[\w-]+\))$/;
const SPACE = "a spacing class (p-4, mx-2, gap-3: steps of 4 px)";

// the class for a style key and its value: the role's own class when the value is one variable, else the family
function fixFor(key: string, value: string): string {
  const role = ROLE[value.match(/var\(--([\w-]+)\)/)?.[1] ?? ""];
  const prefix =
    key === "color"
      ? "text"
      : /^background/.test(key)
        ? "bg"
        : /^border|^outline/.test(key)
          ? "border"
          : key === "fill" || key === "stroke"
            ? key
            : "";
  if (prefix) return role ? `${prefix}-${role}` : `a ${prefix}-* class on a role, or tone-* for a meaning`;
  if (key === "fontSize") return STEPS;
  if (key === "fontFamily" || key === "font") return "font-sans, font-cond or font-mono (and a type step for the size)";
  if (key === "lineHeight") return "the type step's own line height, or leading-*";
  return SPACE;
}

// a key with its value (color: "var(--muted)"), or a key alone, the shorthand of a variable by that name ({ color })
const KEY =
  /[{,]\s*["']?(color|background(?:Color)?|border(?:Top|Right|Bottom|Left|Block|Inline)?(?:Color)?|outlineColor|fill|stroke|fontSize|fontFamily|font|lineHeight|padding\w*|margin\w*|gap|rowGap|columnGap)["']?\s*(?::(?=([^\n]*))|(?=[,}]))/g;
// a link to a place on the page (href="#feed") is not a colour
const RAW =
  /(?<![&\w]|(?:href|to)=["'`])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\b(?:rgba?|hsla?|oklch|oklab)\(/g;
const OK = /design-ok:\s*\S/;

// the object a style reads: each style={…} in the text, each object a style={name} names (const name = {…}), and each
// object typed as a style (CSSProperties = {…}), so a look moved out of the attribute is still counted. A body runs
// from its opening brace to the one that closes it, counted outside strings
function styleBodies(text: string): { at: number; body: string }[] {
  const starts = new Set<number>();
  for (const m of text.matchAll(/\bstyle=\{/g)) starts.add(m.index + m[0].length - 1);
  for (const m of text.matchAll(/\bstyle=\{\s*(\w+)\s*\}/g))
    for (const d of text.matchAll(new RegExp(`\\b(?:const|let|var)\\s+${m[1]}\\b[^=\\n]*=\\s*\\{`, "g")))
      starts.add(d.index + d[0].length - 1);
  for (const m of text.matchAll(/\bCSSProperties\s*=\s*\{/g)) starts.add(m.index + m[0].length - 1);
  const out: { at: number; body: string }[] = [];
  for (const at of [...starts].sort((a, b) => a - b)) {
    let depth = 0;
    let quote = "";
    let i = at;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (quote) {
        if (ch === "\\") i++;
        else if (ch === quote) quote = "";
      } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      else if (ch === "{") depth++;
      else if (ch === "}") depth--;
      if (depth === 0) break;
    }
    out.push({ at, body: text.slice(at, i + 1) });
  }
  return out;
}

// a line without its comments, so a colour named in a comment is not a colour on the page
const code = (line: string) =>
  /^\s*(\/\/|\/?\*)/.test(line) ? "" : line.replace(/\/\*.*?\*\//g, "").replace(/\s\/\/\s.*$/, "");

// the end of a bracket that opens at text[at], counted the same kind
function closing(text: string, at: number): number {
  const [open, close] = text[at] === "(" ? ["(", ")"] : ["{", "}"];
  let depth = 0;
  for (let i = at; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close && --depth === 0) return i;
  }
  return text.length;
}

// the class lists in a page: className="…", every word of a className={…} expression (a template, a ternary, a cx()
// call: an identifier among them names no class the check looks for), and the strings of a cx(…) outside a className,
// each with where it starts
function classLists(text: string): { at: number; names: string[] }[] {
  const out: { at: number; list: string }[] = [];
  const inside: [number, number][] = [];
  for (const m of text.matchAll(/className=(?:"([^"]*)"|\{)/g)) {
    if (m[1] !== undefined) {
      out.push({ at: m.index, list: m[1] });
      continue;
    }
    const from = m.index + m[0].length - 1;
    const to = closing(text, from);
    inside.push([from, to]);
    out.push({ at: m.index, list: text.slice(from + 1, to).replace(/[(){},"'`]|\$\{/g, " ") });
  }
  for (const m of text.matchAll(/\bcx\(/g)) {
    if (inside.some(([a, b]) => m.index > a && m.index < b)) continue;
    const args = text.slice(m.index, closing(text, m.index + m[0].length - 1) + 1);
    for (const q of args.matchAll(/(["'`])([^"'`\n]*)\1/g)) out.push({ at: m.index + q.index, list: q[2] });
  }
  return out.map(({ at, list }) => ({ at, names: list.split(/\s+/).filter(Boolean) }));
}

// a radius class off the ladder (rounded-2xl, a bare rounded, md:rounded-sm), its variants and ! taken off first
function offLadder(name: string): boolean {
  const m = name
    .replace(/^(?:[\w-]+:)*!?/, "")
    .match(/^rounded(?:-(?:t|r|b|l|s|e|ss|se|es|ee|tl|tr|br|bl))?(?:-(.+))?$/);
  return m !== null && !ROUNDED_OK.has(m[1] ?? "");
}

export function scan(text: string): Hit[] {
  const lines = text.split("\n");
  const lineAt = (index: number) => text.slice(0, index).split("\n").length;
  const hits: Hit[] = [];
  for (const { at, body } of styleBodies(text))
    for (const m of body.matchAll(KEY)) {
      const line = lineAt(at + m.index + m[0].indexOf(m[1]));
      if (!OK.test(lines[line - 1])) hits.push({ line, what: `inline ${m[1]}`, fix: fixFor(m[1], m[2] ?? "") });
    }
  for (const { at, names } of classLists(text)) {
    const line = lineAt(at);
    if (OK.test(lines[line - 1])) continue;
    if (names.includes("btn-head"))
      hits.push({ line, what: "btn-head", fix: "a plain .btn (a head's buttons take no size of their own)" });
    const step = names.find((n) => /^text-(head|section|lead|title)$/.test(n));
    if (step && names.includes("font-bold"))
      hits.push({ line, what: `font-bold beside ${step}`, fix: `${step} alone: the step carries its own weight` });
    for (const n of names.filter(offLadder)) hits.push({ line, what: n, fix: RADIUS });
  }
  lines.forEach((l, i) => {
    if (OK.test(l)) return;
    for (const m of code(l).matchAll(RAW))
      hits.push({
        line: i + 1,
        what: `raw colour ${m[0].replace("(", "()")}`,
        fix: "a role colour: its class (text-muted, bg-surface, tone-*) or its variable in styles.css",
      });
  });
  return hits.sort((a, b) => a.line - b.line);
}

// styles.css, where the look lives: every font size reads a type step (none in px) and every radius is on the ladder.
// A comment may run over several lines, so each line is read without the comments open on it
export function scanStyles(text: string): Hit[] {
  const hits: Hit[] = [];
  let open = false;
  text.split("\n").forEach((raw, i) => {
    let line = "";
    for (let j = 0; j < raw.length; ) {
      const next = raw.indexOf(open ? "*/" : "/*", j);
      if (!open) line += raw.slice(j, next < 0 ? raw.length : next);
      if (next < 0) break;
      open = !open;
      j = next + 2;
    }
    if (OK.test(raw)) return;
    // a size: font-size's value, or font's before the slash of its line height
    const size =
      line.match(/(?:^|[{;])\s*font-size\s*:\s*([^;}]*)/)?.[1] ?? line.match(/(?:^|[{;])\s*font\s*:\s*([^;/}]*)/)?.[1];
    const unit = size?.replace(/var\([^)]*\)/g, "").match(/\d*\.?\d+(?:px|r?em)\b/)?.[0];
    if (unit) hits.push({ line: i + 1, what: `font size ${unit}`, fix: STEPS });
    const radius = line.match(/(?:^|[{;])\s*border(?:-[a-z]+)*-radius\s*:\s*([^;}]*)/)?.[1];
    const off = radius
      ?.split(/[\s/]+/)
      .filter(Boolean)
      .find((v) => !RADII_OK.test(v));
    if (off) hits.push({ line: i + 1, what: `radius ${off}`, fix: RADIUS });
  });
  return hits;
}

// web/src's own files, the shared parts left out: they are where the look is allowed to live
export function sources(root: string): string[] {
  return readdirSync(join(root, "web/src"), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
    .map((e) => relative(root, join(e.parentPath, e.name)))
    .filter((f) => !f.startsWith("web/src/ui/"))
    .sort();
}

export function compare(counts: Record<string, number>, baseline: Record<string, number>) {
  const over = Object.keys(counts).filter((f) => counts[f] > (baseline[f] ?? 0));
  const under = Object.keys(baseline).filter((f) => (counts[f] ?? 0) < baseline[f]);
  return { over, under };
}

if (import.meta.main) {
  const root = new URL("..", import.meta.url).pathname;
  const baselineFile = join(root, "scripts/design-baseline.json");
  const files = sources(root);
  const found = new Map(files.map((f) => [f, scan(readFileSync(join(root, f), "utf8"))]));
  const styles = "web/src/styles.css";
  found.set(styles, scanStyles(readFileSync(join(root, styles), "utf8")));
  const counts = Object.fromEntries(
    [...found].filter(([, h]) => h.length).map(([f, h]): [string, number] => [f, h.length]),
  );
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const print = (f: string) => {
    for (const h of found.get(f) ?? []) console.error(`${f}:${h.line}  ${h.what}: use ${h.fix}`);
  };
  const args = process.argv.slice(2);
  if (args.includes("--write")) {
    writeFileSync(baselineFile, `${JSON.stringify(counts, null, 2)}\n`);
    console.log(
      `design: ${total} one-offs in ${Object.keys(counts).length} files recorded in ${relative(root, baselineFile)}`,
    );
    process.exit(0);
  }
  for (const f of args) print(relative(root, join(process.cwd(), f)));
  const baseline = JSON.parse(readFileSync(baselineFile, "utf8")) as Record<string, number>;
  const { over, under } = compare(counts, baseline);
  for (const f of under)
    console.log(
      `design: ${f} is down to ${counts[f] ?? 0} from ${baseline[f]}: record it with node scripts/check-design.ts --write`,
    );
  if (over.length) {
    for (const f of over) print(f);
    for (const f of over)
      console.error(`design: ${f} has ${counts[f]} one-offs, the baseline allows ${baseline[f] ?? 0}.`);
    console.error(
      'Use what each line names (every token and part is on /design), or mark a deliberate one with a "design-ok: <why>" comment on its line.',
    );
    process.exit(1);
  }
  console.log(`design: ${total} one-offs left in ${Object.keys(counts).length} files, none new`);
}
