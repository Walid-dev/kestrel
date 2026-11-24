// The design check, a ratchet: a page's one-off looks may only shrink. In every file of web/src outside the shared
// parts (web/src/ui/, and styles.css, which holds the look), it counts the inline style values the design system owns
// (a colour, a background, a border's colour, an SVG fill or stroke, a font's size or family, a line height, padding,
// margin, a gap) and the raw colours (#hex, rgb(), hsl(), oklch()). The check fails when a file has more than its
// number in scripts/design-baseline.json, and prints each one at file:line with the class to use instead. A value
// that changes at run time goes through a CSS variable (style={{ "--part": … }}), which is not counted; a deliberate
// exception carries "design-ok: <why>" on its line.
//   node scripts/check-design.ts                 the check (inside node --run check)
//   node scripts/check-design.ts <file>…         also list every one-off left in those files
//   node scripts/check-design.ts --write         record today's counts, after a page moved onto the parts
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

export type Hit = { line: number; what: string; fix: string };

// the variables that have a class (styles.css, @theme inline), by the class's name: --bg paints as page, --text as ink
const ROLE: Record<string, string> = {
  ...Object.fromEntries(
    "surface surface-2 line strong muted accent accent-soft green red orange yellow purple pink pink-soft cyan teal magenta ok warn warn-soft add-soft del-soft great good fair poor tone"
      .split(" ")
      .map((r) => [r, r]),
  ),
  bg: "page",
  text: "ink",
};

const STEPS =
  "a type step: text-label 11, text-small 13, text-detail 14, text-body 15.5, text-read 16.5, text-head 19, text-lead 24, text-title 34";
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

const KEY =
  /[{,]\s*["']?(color|background(?:Color)?|border(?:Top|Right|Bottom|Left|Block|Inline)?(?:Color)?|outlineColor|fill|stroke|fontSize|fontFamily|font|lineHeight|padding\w*|margin\w*|gap|rowGap|columnGap)["']?\s*:(?=([^\n]*))/g;
const RAW = /(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\b(?:rgba?|hsla?|oklch|oklab)\(/g;
const OK = /design-ok:\s*\S/;

// each style={…} in the text, its body found by counting braces outside strings
function styleBodies(text: string): { at: number; body: string }[] {
  const out: { at: number; body: string }[] = [];
  for (const m of text.matchAll(/\bstyle=\{/g)) {
    const at = m.index + m[0].length;
    let depth = 1;
    let quote = "";
    let i = at;
    for (; i < text.length && depth > 0; i++) {
      const ch = text[i];
      if (quote) {
        if (ch === "\\") i++;
        else if (ch === quote) quote = "";
      } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      else if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    out.push({ at, body: text.slice(at, i - 1) });
  }
  return out;
}

// a line without its comments, so a colour named in a comment is not a colour on the page
const code = (line: string) =>
  /^\s*(\/\/|\/?\*)/.test(line) ? "" : line.replace(/\/\*.*?\*\//g, "").replace(/\s\/\/\s.*$/, "");

export function scan(text: string): Hit[] {
  const lines = text.split("\n");
  const lineAt = (index: number) => text.slice(0, index).split("\n").length;
  const hits: Hit[] = [];
  for (const { at, body } of styleBodies(text))
    for (const m of body.matchAll(KEY)) {
      const line = lineAt(at + m.index + m[0].indexOf(m[1]));
      if (!OK.test(lines[line - 1])) hits.push({ line, what: `inline ${m[1]}`, fix: fixFor(m[1], m[2]) });
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
      'Use the class named on each line (every token and part is on /design), or mark a deliberate one with a "design-ok: <why>" comment on its line.',
    );
    process.exit(1);
  }
  console.log(`design: ${total} one-offs left in ${Object.keys(counts).length} files, none new`);
}
