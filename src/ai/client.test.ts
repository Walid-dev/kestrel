// The client against a stand-in model: every bad outcome becomes a value with its reason, and a refused call never
// reaches the door.
import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { callModel, escapeRawBreaks } from "./client.ts";
import { startStandIn } from "./stand-in.ts";

const Shape = z.object({ answer: z.string() });
const settings = (url: string) => ({ url, careful: "careful-model", fast: "fast-model", contextChars: 500 });
const ask = { model: "careful-model", system: "answer json", prompt: "made-up question", timeoutMs: 1500 };

test("a good streamed answer comes back parsed, with its time and tokens", async () => {
  const s = await startStandIn(() => ({ content: '{"answer": "made-up"}' }));
  const got = await callModel(settings(s.url), ask, Shape);
  await s.close();
  assert.ok(got.ok);
  assert.equal(got.value.answer, "made-up");
  assert.equal(got.tokensOut, 9);
});

test("an answer in the wrong shape fails with the field named", async () => {
  const s = await startStandIn(() => ({ content: '{"wrong": 1}' }));
  const got = await callModel(settings(s.url), ask, Shape);
  await s.close();
  assert.ok(!got.ok && got.why === "shape");
  assert.match(got.detail, /answer/);
});

test("raw line breaks inside a string are repaired before the parse gives up; outside strings nothing moves", async () => {
  const s = await startStandIn(() => ({ content: '{"answer": "Dear team,\n\nHello and \\"thanks\\".\tBest"}' }));
  const got = await callModel(settings(s.url), ask, Shape);
  await s.close();
  assert.ok(got.ok);
  assert.equal(got.value.answer, 'Dear team,\n\nHello and "thanks".\tBest');
  assert.equal(escapeRawBreaks('{\n "a": "x\ty",\n "b": 1\n}'), '{\n "a": "x\\ty",\n "b": 1\n}');
});

test("a model that runs out of room while thinking says so, so the budget gets raised", async () => {
  const s = await startStandIn(() => ({ content: "", finish: "length" }));
  const got = await callModel(settings(s.url), ask, Shape);
  await s.close();
  assert.ok(!got.ok && got.why === "refusal");
  assert.match(got.detail, /whole answer thinking/);
});

test("a slow model becomes a timeout; a refusal and a down door name themselves", async () => {
  const slow = await startStandIn(() => ({ content: '{"answer":"late"}', delayMs: 3000 }));
  const late = await callModel(settings(slow.url), ask, Shape);
  await slow.close();
  assert.ok(!late.ok && late.why === "timeout");
  const empty = await startStandIn(() => ({ content: "" }));
  const refusal = await callModel(settings(empty.url), ask, Shape);
  await empty.close();
  assert.ok(!refusal.ok && refusal.why === "refusal");
  const down = await callModel(settings("http://127.0.0.1:1"), ask, Shape);
  assert.ok(!down.ok && down.why === "down");
});

test("an unlisted model and a too-long request are refused before any call", async () => {
  const s = await startStandIn(() => ({ content: '{"answer":"never"}' }));
  const unlisted = await callModel(settings(s.url), { ...ask, model: "made-up-model" }, Shape);
  assert.ok(!unlisted.ok && unlisted.why === "unlisted");
  const long = await callModel(settings(s.url), { ...ask, prompt: "x".repeat(600) }, Shape);
  assert.ok(!long.ok && long.why === "too-long");
  assert.equal(s.calls(), 0);
  await s.close();
});
