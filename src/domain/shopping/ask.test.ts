// Ask on a want keeps my budget and my note out of the web: the page the model sees says only that a budget is set and
// never carries the note; a search the model writes with the budget and the note's words goes out with neither; an
// address that holds the budget is refused in words. A stand-in model and a stand-in door; made-up data only.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { startStandIn } from "../../ai/stand-in.ts";
import { migrate } from "../../db/migrate.ts";
import type { Settings } from "../../platform/config.ts";
import { askPage, conversation } from "../ask/ask.ts";
import { shoppingPage, shoppingScrub } from "./ask.ts";
import { seedMadeUpWant } from "./made-up.ts";

test("the page holds neither my budget nor my note, and a search goes out without them", async (t) => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db, ":memory:");
  const id = seedMadeUpWant(db); // budget 600, note "made-up note: the hall is narrow"
  const searched: string[] = [];
  const systems: string[] = [];
  let round = 0;
  const door = await startStandIn((body) => {
    const sent = body as unknown as { query?: string; messages?: { content: string }[] };
    if (sent.query !== undefined) {
      searched.push(sent.query);
      return { status: 404 };
    }
    systems.push(sent.messages?.[0]?.content ?? "");
    round++;
    return {
      content:
        round === 1
          ? 'Let me look.\n```web\n{"query": "robot vacuum under $600 narrow hall"}\n```'
          : "The Brisk R7 is the pick.",
    };
  });
  t.after(() => door.close());
  const settings = {
    models: { url: door.url, careful: "careful-model", fast: "fast-model", contextChars: 400_000 },
  } as Settings;
  const asked = askPage(db, settings, { app: "shopping", ref: id, text: "Is there a cheaper one?" });
  await asked.done;
  assert.equal(conversation(db, "shopping", id).at(-1)?.state, "done");
  // the search went out with the product's words only
  assert.ok(searched.length >= 1);
  for (const q of searched) assert.equal(q, "robot vacuum");
  // the page the model saw: a budget is set, no amount, no note
  const page = systems[0];
  assert.match(page, /a budget is set/);
  assert.doesNotMatch(page, /600|narrow|hall|made-up note/);
  assert.match(page, /within the budget: yes/);
  // the page itself, and the scrub on an address
  const shown = shoppingPage(db, id);
  assert.ok(shown && !/narrow/.test(shown.context));
  assert.deepEqual(shoppingScrub(db, id, "page", { url: "https://store.example/deals?max=600" }), {
    refused: "https://store.example/deals?max=600: that address holds something private, so it isn't opened.",
  });
  assert.deepEqual(shoppingScrub(db, id, "web", { query: "narrow hall" }), {
    refused: "That search held no product words once my private words were taken out: search for the product itself.",
  });
});
