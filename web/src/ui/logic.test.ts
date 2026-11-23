/// <reference types="node" />
// The confirm answers each question once and asks one at a time; a pill pick keeps the options' order.
import assert from "node:assert/strict";
import { test } from "node:test";
import { asker, toggle } from "./logic.ts";

test("a confirm resolves with the answer, and only the first answer counts", async () => {
  const a = asker<string>();
  const asked = a.ask("Delete this answer?");
  assert.equal(a.current(), "Delete this answer?");
  a.answer(true);
  a.answer(false); // the close that follows a tap on Delete: already answered
  assert.equal(await asked, true);
  assert.equal(a.current(), null);
});

test("a second confirm while one is open answers no at once and leaves the first open", async () => {
  const a = asker<string>();
  let seen = 0;
  a.subscribe(() => seen++);
  const first = a.ask("first");
  assert.equal(await a.ask("second"), false);
  assert.equal(a.current(), "first");
  a.answer(false);
  assert.equal(await first, false);
  assert.equal(seen, 2); // opened, then answered: the refused one changed nothing on screen
  assert.equal(await Promise.race([a.ask("third"), Promise.resolve("open")]), "open");
});

test("a pill toggles in and out, in the options' order", () => {
  const order = ["a", "b", "c", "d"];
  assert.deepEqual(toggle(order, ["c"], "a"), ["a", "c"]);
  assert.deepEqual(toggle(order, ["a", "c"], "c"), ["a"]);
  assert.deepEqual(toggle(order, [], "d"), ["d"]);
});
