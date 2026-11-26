// Shopping's store on the real migrations, in memory, with the made-up want: one want runs at a time and the next
// waits; Find offers joins a queued job; a run again keeps my marks; offers upsert by address and keep every reading;
// a delete moves the want or product whole and Restore puts it back; a restart fails a running want and keeps a
// queued one. The best price is a verified total, never a price read from the page's words.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../../db/migrate.ts";
import { madeUpProducts, seedMadeUpWant } from "./made-up.ts";
import {
  addWant,
  claimNext,
  deletedOf,
  deleteProduct,
  deleteWant,
  getProduct,
  getWant,
  offersOf,
  productsOf,
  queueJob,
  readingsOf,
  restoreProduct,
  restoreWant,
  saveOffer,
  saveProduct,
  setProductMarks,
  sweepWants,
} from "./store.ts";
import { wantView } from "./view.ts";

function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db, ":memory:");
  return db;
}
const count = (db: DatabaseSync, table: string) =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

test("one want runs at a time; the next waits its turn; Find offers joins a queued job", () => {
  const db = setup();
  const a = addWant(db, { words: "a quiet made-up kettle" }, new Date("2026-11-25T10:00:00Z"));
  const b = addWant(db, { words: "made-up winter boots", budget: 200 }, new Date("2026-11-25T10:01:00Z"));
  assert.deepEqual(getWant(db, a)?.job, { do: "full" });
  assert.equal(claimNext(db)?.id, a);
  assert.equal(claimNext(db), null); // a runs: b waits
  assert.equal(getWant(db, b)?.state, "queued");
  // a whole run queued already covers Find offers; an offers job joins another's products
  assert.deepEqual(queueJob(db, b, { do: "offers", products: ["p1"] }), { do: "full" });
  db.prepare("UPDATE wants SET state = 'done', job = NULL WHERE id = ?").run(b);
  queueJob(db, b, { do: "offers", products: ["p1"] });
  assert.deepEqual(queueJob(db, b, { do: "offers", products: ["p2", "p1"] }), { do: "offers", products: ["p1", "p2"] });
  // a running want refuses a new job, but its whole run covers Find offers
  assert.throws(() => queueJob(db, a, { do: "full" }), /running/);
  assert.deepEqual(queueJob(db, a, { do: "offers", products: ["p9"] }), { do: "full" });
  // a restart: the running want fails and says why; the queued one keeps its job
  assert.equal(sweepWants(db), 1);
  assert.match(getWant(db, a)?.error ?? "", /restarted/);
  assert.deepEqual(getWant(db, b)?.job, { do: "offers", products: ["p1", "p2"] });
});

test("a want's words, budget and note are checked", () => {
  const db = setup();
  assert.throws(() => addWant(db, { words: "  " }), /say what you need/);
  assert.throws(() => addWant(db, { words: "a kettle", budget: 0 }), /a budget is a whole amount/);
  assert.throws(() => addWant(db, { words: "a kettle", note: "x".repeat(501) }), /500 characters/);
});

test("a run again keeps my marks on a product it finds again; a deleted product never comes back", () => {
  const db = setup();
  const id = seedMadeUpWant(db);
  const [r7] = productsOf(db, id).filter((p) => p.name === "Brisk R7");
  setProductMarks(db, r7.id, { starred: true, target: 42000, status: "bought" }, new Date("2026-11-25T13:00:00Z"));
  const again = madeUpProducts()[0];
  assert.equal(saveProduct(db, id, { ...again, name: "Brisk R7 (2026)" }), r7.id);
  const kept = getProduct(db, r7.id);
  assert.deepEqual([kept?.starred, kept?.target, kept?.status, kept?.name], [true, 42000, "bought", "Brisk R7 (2026)"]);
  assert.equal(kept?.mine.target, "2026-11-25T13:00:00.000Z");
  // deleted, whole: a run again never brings it back; Restore does, offers and readings with it
  const readings = readingsOf(db, r7.id).length;
  assert.ok(readings >= 40);
  deleteProduct(db, r7.id);
  assert.equal(getProduct(db, r7.id), null);
  assert.equal(saveProduct(db, id, again), null);
  assert.deepEqual(
    deletedOf(db, id).map((d) => d.name),
    ["Brisk R7 (2026)"],
  );
  restoreProduct(db, r7.id);
  assert.equal(readingsOf(db, r7.id).length, readings);
  assert.equal(offersOf(db, r7.id).length, 5);
  assert.throws(() => restoreProduct(db, r7.id), /isn't deleted/);
});

test("offers upsert by address and keep every reading; a want deleted whole comes back whole", () => {
  const db = setup();
  const id = seedMadeUpWant(db);
  const p = productsOf(db, id)[0];
  const o = offersOf(db, p.id)[0];
  const before = readingsOf(db, p.id).length;
  saveOffer(db, p.id, { ...o, price: 43900 }, new Date("2026-11-26T08:00:00Z"));
  assert.equal(offersOf(db, p.id).length, 5);
  assert.equal(readingsOf(db, p.id).length, before + 1);
  const rows = ["products", "offers", "price_readings"].map((t) => count(db, t));
  deleteWant(db, id);
  assert.equal(getWant(db, id), null);
  assert.deepEqual(
    ["products", "offers", "price_readings"].map((t) => count(db, t)),
    [0, 0, 0],
  );
  restoreWant(db, id);
  assert.deepEqual(
    ["products", "offers", "price_readings"].map((t) => count(db, t)),
    rows,
  );
  // a running want can't be deleted
  db.prepare("UPDATE wants SET state = 'running' WHERE id = ?").run(id);
  assert.throws(() => deleteWant(db, id), /running/);
});

test("the best price is the lowest verified total, never a price read from the page's words", () => {
  const db = setup();
  const id = seedMadeUpWant(db);
  const view = wantView(db, id);
  const r7 = [...(view?.products ?? []), ...(view?.also ?? [])].find((p) => p.name === "Brisk R7");
  assert.ok(r7);
  assert.equal(r7.best?.store, "store-a.example");
  assert.equal(r7.best?.total, 44900);
  // read prices first (data, then the page's words), then mismatch, blocked, link
  assert.deepEqual(
    r7.offers.map((o) => `${o.read}:${o.method}`),
    ["ok:jsonld", "ok:text", "mismatch:jsonld", "blocked:", "link:link"],
  );
  assert.deepEqual(r7.reach, { read: 2, links: 1, blocked: 1, text: 1 });
  assert.equal(r7.budget, "yes");
  // a cheaper price from the page's words never takes Best price
  const text = offersOf(db, r7.id).find((o) => o.method === "text");
  if (text) saveOffer(db, r7.id, { ...text, price: 30000 });
  const again = wantView(db, id);
  const r7b = [...(again?.products ?? []), ...(again?.also ?? [])].find((p) => p.name === "Brisk R7");
  assert.equal(r7b?.best?.total, 44900);
});
