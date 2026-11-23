// The catalog's readers keep what fits and drop the rest; a drawing missing what it needs reads as null, so the page
// shows its words instead. Made-up content only.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CATALOG, catalogLines, drawingsIn, readDrawing } from "./blocks.ts";

test("each kind reads its parts and refuses one missing what it needs", () => {
  assert.deepEqual(readDrawing("flow", { title: "Brewing", steps: ["Boil", "Steep", 3, ""] }), {
    kind: "flow",
    title: "Brewing",
    steps: ["Boil", "Steep", "3"],
  });
  assert.equal(readDrawing("flow", { steps: ["Only one"] }), null);
  assert.equal(readDrawing("compare", { items: [{ title: "Clay", points: "Warm" }] }), null); // one option isn't a comparison
  assert.deepEqual(
    readDrawing("tree", { root: "A teapot", branches: [{ label: "Lid" }, { label: "Spout", leaves: "Tip" }] }),
    {
      kind: "tree",
      title: "",
      root: "A teapot",
      branches: [
        { label: "Lid", leaves: [] },
        { label: "Spout", leaves: ["Tip"] },
      ],
    },
  );
  assert.equal(readDrawing("timeline", { events: [{ when: "1900", what: "" }, { when: "1910" }] }), null);
  // a chart takes numbers only: "1,200" reads, a word doesn't, a negative bar is dropped
  const chart = readDrawing("chart", {
    unit: "cups",
    bars: [
      { label: "Mon", value: "1,200" },
      { label: "Tue", value: "many" },
      { label: "Wed", value: -3 },
      { label: "Thu", value: 4 },
    ],
  });
  assert.deepEqual(chart, {
    kind: "chart",
    title: "",
    unit: "cups",
    bars: [
      { label: "Mon", value: 1200 },
      { label: "Thu", value: 4 },
    ],
  });
  assert.equal(readDrawing("callout", { tone: "loud", text: ["Hot.", "Careful."] })?.kind, "callout");
  assert.equal((readDrawing("callout", { tone: "loud", text: "Hot." }) as { tone: string }).tone, "tip");
  assert.equal(readDrawing("check", { q: "Why warm the pot?" }), null);
  assert.equal(readDrawing("diagram", { steps: ["a", "b"] }), null); // not in the catalog
  assert.equal(readDrawing("flow", ["a", "b"]), null);
});

test("the drawings in an answer are found by their fence; a broken one is there, as null", () => {
  const answer = [
    "First the point.",
    "```flow",
    '{"steps": ["Boil", "Steep"]}',
    "```",
    "```js",
    "const tea = 1;",
    "```",
    "```chart",
    '{"bars": [{"label": "a", "value": 1}',
    "```",
    "```tree",
    '{"root": "A pot", "branches": [{"label": "Lid"}, {"label": "Spout"}]}```',
    "The words after it stay words.",
  ].join("\n");
  const got = drawingsIn(answer);
  assert.deepEqual(
    got.map((g) => [g.kind, g.drawing === null]),
    [
      ["flow", false],
      ["chart", true],
      ["tree", false],
    ],
  );
});

test("the catalog goes into a prompt as fences for Ask and as typed blocks for Research", () => {
  const fence = catalogLines(["flow"], "fence")[0];
  assert.match(fence, /^- the steps of a process.*: ```flow\n\{"title"/);
  const typed = catalogLines(["chart"], "typed")[0];
  assert.match(typed, /^- 2 to 10 numbers.*: \{"type": "chart", "title"/);
  assert.equal(Object.keys(CATALOG).length, 7);
});
