// The design check on made-up samples: it finds an inline colour, size or spacing and names the class to use, finds a
// raw colour outside comments, leaves run-time variables and marked exceptions alone, and fails only on a rise. In a
// page's class lists it finds btn-head, font-bold beside a heading step and a radius off the ladder; in styles.css, a
// font size in px and a radius off the five.
import assert from "node:assert/strict";
import { test } from "node:test";
import { compare, scan, scanStyles } from "./check-design.ts";

const sample = `export function Row() {
  return (
    <div style={{ color: "var(--muted)", padding: 8 }}>
      <span style={on ? { background: "var(--surface-2)", fontSize: 13 } : undefined}>a</span>
      <i style={{ "--part": "40%", width: "40%" } as CSSProperties} />
      <b style={{ color: "var(--pink)" }} /> {/* design-ok: the logo's own pink */}
    </div>
  );
}`;

test("inline colours, sizes and spacing are found on their lines, each with the class to use", () => {
  const hits = scan(sample);
  assert.deepEqual(
    hits.map((h) => [h.line, h.what]),
    [
      [3, "inline color"],
      [3, "inline padding"],
      [4, "inline background"],
      [4, "inline fontSize"],
    ],
  );
  assert.equal(hits[0].fix, "text-muted");
  assert.equal(hits[2].fix, "bg-surface-2");
  assert.match(hits[3].fix, /text-detail 13/);
});

test("a run-time variable, a width and a line marked design-ok are not one-offs; a bare marker is", () => {
  assert.equal(scan(`<i style={{ "--c": colour, width: w }} />`).length, 0);
  assert.equal(scan(`<b style={{ color: x }} /> // design-ok: the wolf's colour`).length, 0);
  assert.equal(scan(`<b style={{ color: x }} /> // design-ok:`).length, 1);
});

test("raw colours count outside comments, an HTML entity does not", () => {
  const text = [
    `const glow = "rgba(0,0,0,0.2)";`,
    `const ink = "#1c1e24";`,
    `// the old theme was #282c34`,
    `const dash = "&#8212;";`,
    `const deep = "oklch(60% 0.1 250)";`,
  ].join("\n");
  assert.deepEqual(
    scan(text).map((h) => [h.line, h.what]),
    [
      [1, "raw colour rgba()"],
      [2, "raw colour #1c1e24"],
      [5, "raw colour oklch()"],
    ],
  );
});

test("the ratchet fails a file that grew, passes one that held, and names one that shrank", () => {
  const { over, under } = compare({ "a.tsx": 5, "b.tsx": 3, "c.tsx": 1 }, { "a.tsx": 4, "b.tsx": 3, "d.tsx": 2 });
  assert.deepEqual(over, ["a.tsx", "c.tsx"]);
  assert.deepEqual(under, ["d.tsx"]);
});

test("a style held in a named object, a CSSProperties object or a shorthand key is still counted", () => {
  const named = `const box = { color: "var(--pink)", fontSize: 13 };\nconst el = <b style={box} />;`;
  assert.deepEqual(
    scan(named).map((h) => [h.line, h.what]),
    [
      [1, "inline color"],
      [1, "inline fontSize"],
    ],
  );
  assert.equal(scan(named)[0].fix, "text-pink");
  const typed = `const s: CSSProperties = {\n  background: "var(--surface)",\n};`;
  assert.deepEqual(
    scan(typed).map((h) => [h.line, h.what]),
    [[2, "inline background"]],
  );
  assert.deepEqual(
    scan(`<b style={{ color, padding }} />`).map((h) => h.what),
    ["inline color", "inline padding"],
  );
  // an object no style reads is not a look: a query's options, a record's fields
  assert.equal(scan(`const q = { color: "red-team", gap: 2 };`).length, 0);
});

test("a link to a place on the page is not a raw colour", () => {
  assert.equal(scan(`<a href="#feed">Feed</a>`).length, 0);
  assert.equal(scan(`const ink = "#feed";`).length, 1);
});

test("a page's class lists: btn-head, font-bold beside a heading step and a radius off the ladder are found", () => {
  const page = [
    `<button className="btn btn-head">Go</button>`,
    `<h2 className={cx("font-cond text-head font-bold", wide && "mt-2")}>A</h2>`,
    `<div className={\`card rounded-2xl \${on ? "md:rounded-sm" : ""}\`} />`,
    `<i className="skeleton h-4 rounded" />`,
    `<b className="font-bold text-body">fine: body has no weight of its own</b>`,
    `<p className="rounded-md rounded-t-lg rounded-xl rounded-full !rounded-none">fine</p>`,
    `const words = "rounded up, in font-bold text-head";`,
    `<p className={on ? "text-lead font-bold" : "rounded-2xl"} />`,
    `<p className={on ? "rounded-[14px] p-2" : undefined}>fine</p>`,
  ].join("\n");
  assert.deepEqual(
    scan(page).map((h) => [h.line, h.what]),
    [
      [1, "btn-head"],
      [2, "font-bold beside text-head"],
      [3, "rounded-2xl"],
      [3, "md:rounded-sm"],
      [4, "rounded"],
      [8, "font-bold beside text-lead"],
      [8, "rounded-2xl"],
    ],
  );
  assert.match(scan(page)[1].fix, /carries its own weight/);
});

test("styles.css: a font size in px, rem or em and a radius off the five are found, one-line rules too; a step, a comment and design-ok are not", () => {
  const css = [
    `.a { font: 500 var(--text-detail) / 20px var(--sans); }`,
    `.b {`,
    `  font-size: 13.5px;`,
    `  font: 600 15px / 1.2 var(--cond);`,
    `  border-radius: 10px;`,
    `  border-radius: 12px 12px 4px 12px;`,
    `  border-radius: 12px 12px 4px 12px; /* design-ok: the bubble's tail */`,
    `  border-radius: 999px;`,
    `  /* a comment that says font-size: 30px and`,
    `     border-radius: 3px is not a rule */`,
    `  font-size: max(16px, 1em); /* design-ok: the touch floor */`,
    `  font-size: 1.1rem;`,
    `  font: 0.85em var(--mono);`,
    `}`,
    `.c { font-size: 15px; border-radius: 5px }`,
  ].join("\n");
  assert.deepEqual(
    scanStyles(css).map((h) => [h.line, h.what]),
    [
      [3, "font size 13.5px"],
      [4, "font size 15px"],
      [5, "radius 10px"],
      [6, "radius 4px"],
      [12, "font size 1.1rem"],
      [13, "font size 0.85em"],
      [15, "font size 15px"],
      [15, "radius 5px"],
    ],
  );
});
