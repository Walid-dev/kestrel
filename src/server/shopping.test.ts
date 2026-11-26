// Shopping's doors on the made-up want: its view, my answer re-ranking it at once, a bad body refused in plain words,
// a product's marks and watch, Delete and Restore of a product and of a want; questions that move no top pick, a
// budget in my words, a region with no file. No model is asked.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { Hono } from "hono";
import { migrate } from "../db/migrate.ts";
import { seedMadeUpWant } from "../domain/shopping/made-up.ts";
import type { Settings } from "../platform/config.ts";
import type { ProductView, ShoppingHome, WantView } from "../shared/shopping.ts";
import { mountShopping } from "./shopping.ts";

function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db, ":memory:");
  const id = seedMadeUpWant(db);
  const app = new Hono();
  let kicked = 0;
  mountShopping(app, db, { shopping: { read: false } } as Settings, { started: () => kicked++ });
  return { app, db, id, kicked: () => kicked };
}
const send = (app: Hono, method: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

test("a want's view; my answer re-ranks it at once; a bad answer is refused in words", async () => {
  const { app, id } = setup();
  const view = (await (await app.request(`/api/shopping/wants/${id}`)).json()) as WantView;
  assert.equal(view.words, "a robot vacuum for pet hair");
  // the budget of 600 sends Tidal T9 (usual price $899) to also considered, with its reason
  assert.equal(view.products.length, 7);
  assert.deepEqual(
    view.also.map((p) => [p.name, p.out]),
    [["Tidal T9", "over the budget"]],
  );
  assert.equal(view.questions.length, 2);
  assert.equal(
    view.kind.fields.some((f) => f.key === "c:noise"),
    true,
  );
  assert.equal(view.budget, 600);
  const order = view.products.map((p) => p.name);
  const res = await send(app, "POST", `/api/shopping/wants/${id}/answers`, { key: "pets", option: 0 });
  assert.equal(res.status, 200);
  const after = (await res.json()) as WantView;
  assert.equal(after.questions[1].picked, 0);
  assert.notDeepEqual(
    after.products.map((p) => p.name),
    order,
  );
  const bad = await send(app, "POST", `/api/shopping/wants/${id}/answers`, { key: "floors", option: 7 });
  assert.deepEqual([bad.status, await bad.json()], [400, { error: "that question has no such option" }]);
  assert.equal((await app.request("/api/shopping/wants/nope")).status, 404);
});

test("questions that move no top pick are marked; a budget in my words shows; a region with no file falls back", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db, ":memory:");
  const id = seedMadeUpWant(db);
  const app = new Hono();
  // a region with no file: kestrel still starts, on the shipped region
  mountShopping(app, db, { shopping: { read: false, region: "zz" } } as Settings);
  const view = (await (await app.request(`/api/shopping/wants/${id}`)).json()) as WantView;
  assert.equal(view.currency, "CAD");
  // on the made-up want no answer moves Brisk R7 from the top, so neither question decides
  assert.deepEqual(
    view.questions.map((q) => [q.key, q.changes]),
    [
      ["floors", false],
      ["pets", false],
    ],
  );
  const res = await send(app, "POST", "/api/shopping/wants", { words: "a made-up kettle under $80" });
  const { id: kettle } = (await res.json()) as { id: string };
  const k = (await (await app.request(`/api/shopping/wants/${kettle}`)).json()) as WantView;
  assert.deepEqual([k.budget, k.budgetWords, k.budgetSet], [null, 80, true]);
});

test("a new want is queued and the run told; Run again queues a whole run", async () => {
  const { app, kicked } = setup();
  const res = await send(app, "POST", "/api/shopping/wants", { words: "made-up winter boots", budget: 180 });
  assert.equal(res.status, 202);
  const { id } = (await res.json()) as { id: string };
  assert.equal(kicked(), 2); // once at mount (a queued want waits for no one), once for this want
  const home = (await (await app.request("/api/shopping")).json()) as ShoppingHome;
  assert.equal(home.wants.find((w) => w.id === id)?.state, "queued");
  assert.equal(home.figures.wants, 2);
  const short = await send(app, "POST", "/api/shopping/wants", { words: "x" });
  assert.deepEqual([short.status, await short.json()], [400, { error: "say what you need, in a few words" }]);
});

test("a product's marks and watch; a product and a want deleted and restored", async () => {
  const { app, id } = setup();
  const view = (await (await app.request(`/api/shopping/wants/${id}`)).json()) as WantView;
  const p = view.products[0];
  const marked = (await (
    await send(app, "PATCH", `/api/shopping/products/${p.id}`, { starred: true, target: 40000 })
  ).json()) as ProductView;
  assert.deepEqual([marked.starred, marked.target], [true, 40000]);
  const watched = (await (
    await send(app, "PUT", `/api/shopping/products/${p.id}/watch`, { days: 14, everyHours: 24 })
  ).json()) as ProductView;
  assert.equal(watched.watch?.everyHours, 24);
  assert.equal(
    (await send(app, "PUT", `/api/shopping/products/${p.id}/watch`, { days: 3, everyHours: 24 })).status,
    400,
  );
  const home = (await (await app.request("/api/shopping")).json()) as ShoppingHome;
  assert.equal(home.figures.watching, 1);
  // a product deleted: its sheet opens as it was, says so, and Restore brings it back
  assert.equal((await send(app, "DELETE", `/api/shopping/products/${p.id}`)).status, 200);
  const gone = (await (await app.request(`/api/shopping/products/${p.id}`)).json()) as ProductView & {
    deleted?: { at: string };
  };
  assert.ok(gone.deleted);
  assert.equal(gone.offers.length, p.offers.length);
  assert.equal((await send(app, "POST", `/api/shopping/products/${p.id}/restore`)).status, 200);
  assert.equal((await send(app, "POST", `/api/shopping/products/${p.id}/restore`)).status, 409);
  // a want deleted, then restored
  assert.equal((await send(app, "DELETE", `/api/shopping/wants/${id}`)).status, 200);
  const missing = await app.request(`/api/shopping/wants/${id}`);
  assert.equal(missing.status, 404);
  assert.ok(((await missing.json()) as { deleted?: unknown }).deleted);
  // Shopping's page keeps it at its foot with Restore, and lets it go once it is back
  const listed = (await (await app.request("/api/shopping")).json()) as ShoppingHome;
  assert.deepEqual(
    listed.deleted.map((d) => d.id),
    [id],
  );
  assert.equal((await send(app, "POST", `/api/shopping/wants/${id}/restore`)).status, 200);
  assert.equal(((await (await app.request("/api/shopping")).json()) as ShoppingHome).deleted.length, 0);
  const history = (await (await app.request(`/api/shopping/products/${p.id}/history`)).json()) as {
    readings: unknown[];
  };
  assert.ok(history.readings.length >= 1);
});
