// A page as the text the model reads: a made-up best-of page keeps its table as rows and its headings, drops its menus
// and scripts; a long page is cut between whole sections, the table's section kept first and never cut inside.
import assert from "node:assert/strict";
import { test } from "node:test";
import { pageText } from "./web.ts";

const TABLE =
  "<table><tr><th>Model</th><th>Noise</th></tr><tr><td>Brisk R7-C</td><td>64 dB</td></tr><tr><td>Fen Clean 3</td><td>61 &amp; quiet</td></tr></table>";

test("a best-of page: its table as rows, headings and items kept, menus and scripts gone", () => {
  const text = pageText(
    `<html><head><script>var ads = 1;</script><style>p{}</style></head><body><nav>Home Deals Login</nav><h1>The best made-up vacuums</h1><p>We bought each one.</p>${TABLE}<h2>Best overall</h2><ul><li>Quiet</li><li>Light</li></ul><footer>Made-up footer</footer></body></html>`,
  );
  assert.equal(
    text,
    [
      "## The best made-up vacuums",
      "We bought each one.",
      "Model | Noise",
      "Brisk R7-C | 64 dB",
      "Fen Clean 3 | 61 & quiet",
      "",
      "## Best overall",
      "- Quiet",
      "- Light",
    ].join("\n"),
  );
});

test("a long page is cut between sections: the table's section first, never cut inside it", () => {
  const filler = (n: number) => `<p>${"Made-up words about cleaning floors. ".repeat(n)}</p>`;
  const html = `<h1>Intro</h1>${filler(20)}<h2>Story one</h2>${filler(20)}<h2>How they compare</h2>${TABLE}<h2>Story two</h2>${filler(20)}`;
  const full = pageText(html, 100_000);
  const cut = pageText(html, 900);
  assert.ok(full.length > 900);
  assert.ok(cut.length <= 900, `${cut.length}`);
  // the section with the table is kept whole, and the kept sections read in page order
  assert.match(cut, /## How they compare\nModel \| Noise\nBrisk R7-C \| 64 dB\nFen Clean 3 \| 61 & quiet/);
  assert.ok(cut.indexOf("## Intro") < cut.indexOf("## How they compare"));
  assert.doesNotMatch(cut, /## Story two/);
  // a table bigger than the room is dropped whole rather than cut between its rows
  const rows = Array.from({ length: 60 }, (_, i) => `<tr><td>Model ${i}</td><td>${60 + i} dB</td></tr>`).join("");
  const giant = pageText(`<h2>Only a table</h2><p>Lead words.</p><table>${rows}</table>`, 300);
  assert.ok(!/\| \d+ dB$/.test(giant), giant);
  assert.match(giant, /^## Only a table\nLead words\.$/);
});
