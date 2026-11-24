// The design check on made-up samples: it finds an inline colour, size or spacing and names the class to use, finds a
// raw colour outside comments, leaves run-time variables and marked exceptions alone, and fails only on a rise.
import assert from "node:assert/strict";
import { test } from "node:test";
import { compare, scan } from "./check-design.ts";

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
  assert.match(hits[3].fix, /text-small 13/);
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
