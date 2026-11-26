// Understand on a stand-in model: a drafted kind with too few criteria fails the want in words that say so (never "it
// couldn't tell what kind of product this is"), and one with eight keeps seven. Made-up kinds only.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { startStandIn } from "../../ai/stand-in.ts";
import { loadCategories, saveDraft } from "./categories.ts";
import { understand } from "./understand.ts";

const criterion = (key: string, weight: number) => ({ key, label: key, type: "score", better: "higher", weight });

test("a drafted kind with three criteria fails in its own words; one with eight keeps the seven that weigh most", async (t) => {
  let count = 3;
  const standIn = await startStandIn(() => ({
    content: JSON.stringify({
      mode: "compare",
      category: "made-up-mount",
      newCategory: {
        key: "made-up-mount",
        name: "Made-up mount",
        criteria: Array.from({ length: count }, (_, i) => criterion(`c${i + 1}`, 10 + i)),
      },
      questions: [],
      searchWords: "made-up mount",
    }),
  }));
  t.after(() => standIn.close());
  const ask = {
    models: { url: standIn.url, careful: "careful-model", fast: "fast-model", contextChars: 400_000 },
    model: "careful-model",
    record: () => {},
  };
  const run = async () => {
    const dir = mkdtempSync(join(tmpdir(), "kestrel-understand-"));
    const list = loadCategories(dir);
    return understand(
      { words: "a made-up mount for a bike", budget: null, note: "" },
      ask,
      { list, save: (d) => saveDraft(d, list, dir) },
      "CAD",
    );
  };
  const thin = await run();
  assert.equal(thin.ok, false);
  assert.match((thin as { why: string }).why, /3 usable criteria, too few to compare.*: Run again$/);
  count = 8;
  const wide = await run();
  assert.ok(wide.ok, JSON.stringify(wide));
  assert.equal(wide.need.criteria.length, 7);
});
