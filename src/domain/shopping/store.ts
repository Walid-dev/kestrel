// Shopping's store (v1.2): my wants with their job, their products, the offers and every price reading; my marks with
// when I set them; a delete moves the row whole, with its children, to shop_deleted, and Restore puts it back. Only
// this folder writes these tables. Money is in cents; a budget is whole units of the region's currency.
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type {
  Condition,
  Evidence,
  Fact,
  Label,
  LogLine,
  Mark,
  Method,
  Need,
  ProductWords,
  ReadState,
  SourceRef,
  Stock,
  WantResult,
  WantState,
  Watch,
} from "../../shared/shopping.ts";
import { Refused } from "../notes/documents.ts";

// the work a want has queued or running: a whole run, or Find offers for products I picked
export type Job = { do: "full" } | { do: "offers"; products: string[] };
export type Kept = WantResult & { sources: SourceRef[] };

export type WantRow = {
  id: string;
  words: string;
  budget: number | null;
  note: string;
  state: WantState;
  job: Job | null;
  step: string;
  status: Mark;
  starred: boolean;
  need: Need | null;
  answers: Record<string, number>;
  result: Kept | null;
  log: LogLine[];
  error: string;
  created: string;
  updated: string;
  ran: string | null;
};

export type ProductRow = {
  id: string;
  want: string;
  key: string;
  name: string;
  brand: string;
  models: string[];
  facts: Record<string, Fact>;
  labels: Label[];
  score: number | null;
  place: number | null;
  out: string;
  flags: string[];
  words: ProductWords;
  usual: number | null;
  evidence: Evidence;
  starred: boolean;
  status: Mark;
  target: number | null;
  watch: Watch | null;
  mine: Record<string, string>;
  found: string;
  updated: string;
};

export type OfferRow = {
  id: string;
  product: string;
  store: string;
  url: string;
  seller: string;
  condition: Condition;
  price: number | null;
  regular: number | null;
  shipping: number | null;
  currency: string;
  stock: Stock;
  pickup: boolean | null;
  validUntil: string | null;
  method: Method;
  read: ReadState;
  words: string;
  why: string;
  seen: string;
};

export type Reading = {
  offer: string;
  store: string;
  condition: Condition;
  at: string;
  price: number;
  regular: number | null;
  stock: Stock;
  method: Method;
};

export const NO_WORDS: ProductWords = { why: [], tradeoff: null, notFor: null, pros: [], cons: [], skip: [] };
export const NO_EVIDENCE: Evidence = { sources: 0, a: 0, b: 0, newest: null, thin: true, old: false, refs: [] };

const json = (v: unknown) => JSON.stringify(v);
const parse = <T>(raw: unknown, empty: T): T => {
  if (typeof raw !== "string" || raw === "") return empty;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return empty;
  }
};
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

// ── Wants ───────────────────────────────────────────────────────────────────────────────────────────────────────

const wantOf = (r: Record<string, unknown>): WantRow => ({
  id: String(r.id),
  words: String(r.words),
  budget: num(r.budget),
  note: String(r.note ?? ""),
  state: r.state as WantState,
  job: parse<Job | null>(r.job, null),
  step: String(r.step ?? ""),
  status: r.status as Mark,
  starred: Number(r.starred) === 1,
  need: parse<Need | null>(r.need, null),
  answers: parse<Record<string, number>>(r.answers, {}),
  result: parse<Kept | null>(r.result, null),
  log: parse<LogLine[]>(r.log, []),
  error: String(r.error ?? ""),
  created: String(r.created),
  updated: String(r.updated),
  ran: r.ran == null ? null : String(r.ran),
});

// a want's words, budget and note, as I may write them: the words name what I need, the budget is whole units
export function checkWant(input: { words: string; budget?: number | null; note?: string }) {
  const words = input.words.replace(/\s+/g, " ").trim();
  if (words.length < 3) throw new Refused("say what you need, in a few words");
  if (words.length > 300) throw new Refused("a want of 300 characters at most");
  const budget = input.budget ?? null;
  if (budget !== null && (!Number.isInteger(budget) || budget < 1 || budget > 10_000_000))
    throw new Refused("a budget is a whole amount, from 1");
  const note = (input.note ?? "").trim();
  if (note.length > 500) throw new Refused("a note of 500 characters at most");
  return { words, budget, note };
}

// a new want, queued with a whole run: the run starts it when the model is free
export function addWant(
  db: DatabaseSync,
  input: { words: string; budget?: number | null; note?: string },
  now = new Date(),
): string {
  const { words, budget, note } = checkWant(input);
  const id = randomUUID();
  const at = now.toISOString();
  db.prepare(
    "INSERT INTO wants (id, words, budget, note, state, job, step, created, updated) VALUES (?, ?, ?, ?, 'queued', ?, 'Waiting its turn', ?, ?)",
  ).run(id, words, budget, note, json({ do: "full" }), at, at);
  return id;
}

export function getWant(db: DatabaseSync, id: string): WantRow | null {
  const r = db.prepare("SELECT * FROM wants WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? wantOf(r) : null;
}

export function listWants(db: DatabaseSync): WantRow[] {
  return (db.prepare("SELECT * FROM wants ORDER BY updated DESC").all() as Record<string, unknown>[]).map(wantOf);
}

// the run's own columns, written as it goes (state, step, need, result, error, ran)
export function updateWant(
  db: DatabaseSync,
  id: string,
  patch: Partial<Pick<WantRow, "state" | "step" | "need" | "result" | "error" | "ran" | "job">>,
  now = new Date(),
): void {
  const cols: string[] = [];
  const vals: (string | number | null)[] = [];
  for (const [k, v] of Object.entries(patch)) {
    cols.push(`${k} = ?`);
    vals.push(k === "need" || k === "result" || k === "job" ? (v === null ? null : json(v)) : (v as string | null));
  }
  if (!cols.length) return;
  db.prepare(`UPDATE wants SET ${cols.join(", ")}, updated = ? WHERE id = ?`).run(...vals, now.toISOString(), id);
}

// my marks on a want: its budget and note (the run reads them), whether it is open, bought or passed, its star
export function setWantMarks(
  db: DatabaseSync,
  id: string,
  marks: { budget?: number | null; note?: string; status?: Mark; starred?: boolean },
  now = new Date(),
): WantRow {
  const w = getWant(db, id);
  if (!w) throw new Refused("no such want");
  const checked = checkWant({
    words: w.words,
    budget: marks.budget === undefined ? w.budget : marks.budget,
    note: marks.note === undefined ? w.note : marks.note,
  });
  db.prepare("UPDATE wants SET budget = ?, note = ?, status = ?, starred = ?, updated = ? WHERE id = ?").run(
    checked.budget,
    checked.note,
    marks.status ?? w.status,
    marks.starred === undefined ? Number(w.starred) : Number(marks.starred),
    now.toISOString(),
    id,
  );
  return getWant(db, id) as WantRow;
}

// my answer to one of its questions: an option's number, kept; the list re-ranks from it
export function setAnswer(db: DatabaseSync, id: string, key: string, option: number, now = new Date()): WantRow {
  const w = getWant(db, id);
  if (!w) throw new Refused("no such want");
  const q = w.need?.questions.find((x) => x.key === key);
  if (!q) throw new Refused("that want has no such question");
  if (!Number.isInteger(option) || option < 0 || option >= q.options.length)
    throw new Refused("that question has no such option");
  db.prepare("UPDATE wants SET answers = ?, updated = ? WHERE id = ?").run(
    json({ ...w.answers, [key]: option }),
    now.toISOString(),
    id,
  );
  return getWant(db, id) as WantRow;
}

// a line in the want's log, newest last; a hundred kept
export function addLog(db: DatabaseSync, id: string, line: Omit<LogLine, "at">, now = new Date()): void {
  const w = getWant(db, id);
  if (!w) return;
  const log = [...w.log, { at: now.toISOString(), ...line }].slice(-100);
  db.prepare("UPDATE wants SET log = ? WHERE id = ?").run(json(log), id);
}

// work queued on a want: a whole run replaces any job; Find offers joins a queued offers job's products, and a whole
// run queued or running already covers it. A want that runs keeps its job until it ends (the run reads it then)
export function queueJob(db: DatabaseSync, id: string, job: Job, now = new Date()): Job {
  const w = getWant(db, id);
  if (!w) throw new Refused("no such want");
  if (w.state === "running") {
    if (job.do === "offers" && w.job?.do === "full") return w.job;
    throw new Refused("it is running now: wait for it to end");
  }
  let next: Job = job;
  if (w.state === "queued" && w.job?.do === "full") next = w.job;
  else if (job.do === "offers" && w.state === "queued" && w.job?.do === "offers")
    next = { do: "offers", products: [...new Set([...w.job.products, ...job.products])] };
  db.prepare(
    "UPDATE wants SET state = 'queued', job = ?, step = 'Waiting its turn', error = '', updated = ? WHERE id = ?",
  ).run(json(next), now.toISOString(), id);
  return next;
}

// the oldest queued want, now running: one at a time, as the model works one request at a time
export function claimNext(db: DatabaseSync, now = new Date()): WantRow | null {
  if (db.prepare("SELECT 1 FROM wants WHERE state = 'running' LIMIT 1").get()) return null;
  const r = db.prepare("SELECT id FROM wants WHERE state = 'queued' ORDER BY created LIMIT 1").get() as
    | { id: string }
    | undefined;
  if (!r) return null;
  db.prepare("UPDATE wants SET state = 'running', step = 'Starting', updated = ? WHERE id = ?").run(
    now.toISOString(),
    r.id,
  );
  return getWant(db, r.id);
}

// ── Products ────────────────────────────────────────────────────────────────────────────────────────────────────

const productOf = (r: Record<string, unknown>): ProductRow => ({
  id: String(r.id),
  want: String(r.want),
  key: String(r.key),
  name: String(r.name),
  brand: String(r.brand ?? ""),
  models: parse<string[]>(r.models, []),
  facts: parse<Record<string, Fact>>(r.facts, {}),
  labels: parse<Label[]>(r.labels, []),
  score: num(r.score),
  place: num(r.place),
  out: String(r.out ?? ""),
  flags: parse<string[]>(r.flags, []),
  words: { ...NO_WORDS, ...parse<Partial<ProductWords>>(r.words, {}) },
  usual: num(r.usual),
  evidence: { ...NO_EVIDENCE, ...parse<Partial<Evidence>>(r.evidence, {}) },
  starred: Number(r.starred) === 1,
  status: r.status as Mark,
  target: num(r.target),
  watch: parse<Watch | null>(r.watch, null),
  mine: parse<Record<string, string>>(r.mine, {}),
  found: String(r.found),
  updated: String(r.updated),
});

export function productsOf(db: DatabaseSync, want: string): ProductRow[] {
  return (
    db
      .prepare("SELECT * FROM products WHERE want = ? ORDER BY place IS NULL, place, score DESC, name")
      .all(want) as Record<string, unknown>[]
  ).map(productOf);
}

export function getProduct(db: DatabaseSync, id: string): ProductRow | null {
  const r = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? productOf(r) : null;
}

// what a run found of a product; my marks are never part of it
export type ProductInput = {
  key: string;
  name: string;
  brand: string;
  models: string[];
  facts: Record<string, Fact>;
  words: ProductWords;
  usual: number | null;
  evidence: Evidence;
};

// a product as a run found it, by its key: one found again keeps its id and my marks (star, status, target, watch);
// a deleted one is never brought back (null)
export function saveProduct(db: DatabaseSync, want: string, p: ProductInput, now = new Date()): string | null {
  if (isDeleted(db, want, p.key)) return null;
  const at = now.toISOString();
  const had = db.prepare("SELECT id FROM products WHERE want = ? AND key = ?").get(want, p.key) as
    | { id: string }
    | undefined;
  if (had) {
    db.prepare(
      "UPDATE products SET name = ?, brand = ?, models = ?, facts = ?, words = ?, usual = ?, evidence = ?, out = '', updated = ? WHERE id = ?",
    ).run(p.name, p.brand, json(p.models), json(p.facts), json(p.words), p.usual, json(p.evidence), at, had.id);
    return had.id;
  }
  const id = randomUUID();
  db.prepare(
    `INSERT INTO products (id, want, key, name, brand, models, facts, words, usual, evidence, found, updated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    want,
    p.key,
    p.name,
    p.brand,
    json(p.models),
    json(p.facts),
    json(p.words),
    p.usual,
    json(p.evidence),
    at,
    at,
  );
  return id;
}

// what the ranking gave a product: its score, place, labels, why it is only also considered, and its unknown must-haves
export function setRank(
  db: DatabaseSync,
  id: string,
  r: { score: number | null; place: number | null; labels: Label[]; out: string; flags: string[] },
): void {
  db.prepare("UPDATE products SET score = ?, place = ?, labels = ?, out = ?, flags = ? WHERE id = ?").run(
    r.score === null ? null : Math.round(r.score * 10) / 10,
    r.place,
    json(r.labels),
    r.out,
    json(r.flags),
    id,
  );
}

// a product's checked words, written after the ranking
export function setWords(db: DatabaseSync, id: string, words: ProductWords): void {
  db.prepare("UPDATE products SET words = ? WHERE id = ?").run(json(words), id);
}

// my marks on a product: its star, Bought or Passed, a target price (cents; null clears it), each with when
export function setProductMarks(
  db: DatabaseSync,
  id: string,
  marks: { starred?: boolean; status?: Mark; target?: number | null },
  now = new Date(),
): ProductRow {
  const p = getProduct(db, id);
  if (!p) throw new Refused("no such product");
  if (marks.target !== undefined && marks.target !== null && (!Number.isInteger(marks.target) || marks.target < 1))
    throw new Refused("a target is a price, from one cent");
  const at = now.toISOString();
  const mine = { ...p.mine };
  for (const k of ["starred", "status", "target"] as const) if (marks[k] !== undefined) mine[k] = at;
  db.prepare("UPDATE products SET starred = ?, status = ?, target = ?, mine = ?, updated = ? WHERE id = ?").run(
    marks.starred === undefined ? Number(p.starred) : Number(marks.starred),
    marks.status ?? p.status,
    marks.target === undefined ? p.target : marks.target,
    json(mine),
    at,
    id,
  );
  return getProduct(db, id) as ProductRow;
}

// a watch on a product, or none; the scheduler's hook checks its offers (watch.ts)
export function setWatch(db: DatabaseSync, id: string, watch: Watch | null, now = new Date()): ProductRow {
  const p = getProduct(db, id);
  if (!p) throw new Refused("no such product");
  const mine = { ...p.mine, watch: now.toISOString() };
  db.prepare("UPDATE products SET watch = ?, mine = ? WHERE id = ?").run(watch ? json(watch) : null, json(mine), id);
  return getProduct(db, id) as ProductRow;
}

// ── Offers and readings ─────────────────────────────────────────────────────────────────────────────────────────

const offerOf = (r: Record<string, unknown>): OfferRow => ({
  id: String(r.id),
  product: String(r.product),
  store: String(r.store),
  url: String(r.url),
  seller: String(r.seller ?? ""),
  condition: r.condition as Condition,
  price: num(r.price),
  regular: num(r.regular),
  shipping: num(r.shipping),
  currency: String(r.currency ?? ""),
  stock: r.stock as Stock,
  pickup: r.pickup == null ? null : Number(r.pickup) === 1,
  validUntil: r.valid_until == null ? null : String(r.valid_until),
  method: String(r.method ?? "") as Method,
  read: r.read as ReadState,
  words: String(r.words ?? ""),
  why: String(r.why ?? ""),
  seen: String(r.seen),
});

export function offersOf(db: DatabaseSync, product: string): OfferRow[] {
  return (
    db.prepare("SELECT * FROM offers WHERE product = ? ORDER BY seen").all(product) as Record<string, unknown>[]
  ).map(offerOf);
}

export function getOffer(db: DatabaseSync, id: string): OfferRow | null {
  const r = db.prepare("SELECT * FROM offers WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? offerOf(r) : null;
}

export type OfferInput = Omit<OfferRow, "id" | "product" | "seen">;

// an offer as it was read, by its address: upserted, and a reading kept whenever a price was read
export function saveOffer(db: DatabaseSync, product: string, o: OfferInput, now = new Date()): string {
  const at = now.toISOString();
  const had = db.prepare("SELECT id FROM offers WHERE product = ? AND url = ?").get(product, o.url) as
    | { id: string }
    | undefined;
  const id = had?.id ?? randomUUID();
  const cols = [
    o.store,
    o.seller,
    o.condition,
    o.price,
    o.regular,
    o.shipping,
    o.currency,
    o.stock,
    o.pickup === null ? null : Number(o.pickup),
    o.validUntil,
    o.method,
    o.read,
    o.words,
    o.why,
    at,
  ];
  if (had)
    db.prepare(
      `UPDATE offers SET store = ?, seller = ?, condition = ?, price = ?, regular = ?, shipping = ?, currency = ?,
       stock = ?, pickup = ?, valid_until = ?, method = ?, read = ?, words = ?, why = ?, seen = ? WHERE id = ?`,
    ).run(...cols, id);
  else
    db.prepare(
      `INSERT INTO offers (store, seller, condition, price, regular, shipping, currency, stock, pickup, valid_until,
       method, read, words, why, seen, id, product, url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(...cols, id, product, o.url);
  if (o.read === "ok" && o.price !== null)
    db.prepare(
      "INSERT OR REPLACE INTO price_readings (offer, at, price, regular, stock, method) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(id, at, o.price, o.regular, o.stock, o.method);
  return id;
}

// a product's readings across its stores, oldest first
export function readingsOf(db: DatabaseSync, product: string): Reading[] {
  return (
    db
      .prepare(
        `SELECT r.offer, o.store, o.condition, r.at, r.price, r.regular, r.stock, r.method FROM price_readings r
         JOIN offers o ON o.id = r.offer WHERE o.product = ? ORDER BY r.at`,
      )
      .all(product) as Record<string, unknown>[]
  ).map((r) => ({
    offer: String(r.offer),
    store: String(r.store),
    condition: r.condition as Condition,
    at: String(r.at),
    price: Number(r.price),
    regular: num(r.regular),
    stock: r.stock as Stock,
    method: String(r.method) as Method,
  }));
}

// ── Delete and Restore ──────────────────────────────────────────────────────────────────────────────────────────

const isDeleted = (db: DatabaseSync, want: string, key: string) =>
  db.prepare("SELECT 1 FROM shop_deleted WHERE what = 'product' AND want = ? AND key = ?").get(want, key) !== undefined;

// a savepoint, so a move happens whole even inside another transaction
function whole<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("SAVEPOINT shop_move");
  try {
    const out = fn();
    db.exec("RELEASE shop_move");
    return out;
  } catch (e) {
    db.exec("ROLLBACK TO shop_move");
    db.exec("RELEASE shop_move");
    throw e;
  }
}

type Saved = {
  product: Record<string, unknown>;
  offers: { offer: Record<string, unknown>; readings: Record<string, unknown>[] }[];
};
const savedProduct = (db: DatabaseSync, id: string): Saved | null => {
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!product) return null;
  const offers = (db.prepare("SELECT * FROM offers WHERE product = ?").all(id) as Record<string, unknown>[]).map(
    (offer) => ({
      offer,
      readings: db.prepare("SELECT * FROM price_readings WHERE offer = ?").all(String(offer.id)) as Record<
        string,
        unknown
      >[],
    }),
  );
  return { product, offers };
};
const put = (db: DatabaseSync, table: string, row: Record<string, unknown>) => {
  const cols = Object.keys(row);
  db.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).run(
    ...cols.map((c) => row[c] as string | number | null),
  );
};
const putProduct = (db: DatabaseSync, s: Saved) => {
  put(db, "products", s.product);
  for (const o of s.offers) {
    put(db, "offers", o.offer);
    for (const r of o.readings) put(db, "price_readings", r);
  }
};

// a want deleted whole, with its products, offers and readings; refused while it runs
export function deleteWant(db: DatabaseSync, id: string, now = new Date()): void {
  whole(db, () => {
    const want = db.prepare("SELECT * FROM wants WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!want) throw new Refused("no such want");
    if (want.state === "running") throw new Refused("it is running now: wait for it to end");
    const ids = (db.prepare("SELECT id FROM products WHERE want = ?").all(id) as { id: string }[]).map((p) => p.id);
    const products = ids.map((p) => savedProduct(db, p)).filter((s): s is Saved => s !== null);
    db.prepare("INSERT INTO shop_deleted (id, what, want, key, name, row, at) VALUES (?, 'want', ?, '', ?, ?, ?)").run(
      id,
      id,
      String(want.words),
      json({ want, products }),
      now.toISOString(),
    );
    db.prepare("DELETE FROM wants WHERE id = ?").run(id);
  });
}

// a deleted want back as it was; a queued or running one comes back failed, its job gone (Run again starts it)
export function restoreWant(db: DatabaseSync, id: string): void {
  whole(db, () => {
    const t = db.prepare("SELECT row FROM shop_deleted WHERE id = ? AND what = 'want'").get(id) as
      | { row: string }
      | undefined;
    if (!t) throw new Refused("that want isn't deleted");
    const { want, products } = JSON.parse(t.row) as { want: Record<string, unknown>; products: Saved[] };
    if (want.state === "queued" || want.state === "running")
      Object.assign(want, { state: "failed", job: null, step: "", error: "deleted before it ran: Run again" });
    put(db, "wants", want);
    for (const p of products) putProduct(db, p);
    db.prepare("DELETE FROM shop_deleted WHERE id = ?").run(id);
  });
}

// a product deleted whole: a run again never brings it back
export function deleteProduct(db: DatabaseSync, id: string, now = new Date()): string {
  return whole(db, () => {
    const s = savedProduct(db, id);
    if (!s) throw new Refused("no such product");
    const want = String(s.product.want);
    db.prepare(
      "INSERT INTO shop_deleted (id, what, want, key, name, row, at) VALUES (?, 'product', ?, ?, ?, ?, ?)",
    ).run(id, want, String(s.product.key), String(s.product.name), json(s), now.toISOString());
    db.prepare("DELETE FROM products WHERE id = ?").run(id);
    return want;
  });
}

// a deleted product back as it was, unless its want is gone or a product with its key landed since
export function restoreProduct(db: DatabaseSync, id: string): string {
  return whole(db, () => {
    const t = db.prepare("SELECT row, want, key FROM shop_deleted WHERE id = ? AND what = 'product'").get(id) as
      | { row: string; want: string; key: string }
      | undefined;
    if (!t) throw new Refused("that product isn't deleted");
    if (!db.prepare("SELECT 1 FROM wants WHERE id = ?").get(t.want))
      throw new Refused("its want is deleted: restore the want first");
    if (db.prepare("SELECT 1 FROM products WHERE want = ? AND key = ?").get(t.want, t.key))
      throw new Refused("a product with its name is there already");
    putProduct(db, JSON.parse(t.row) as Saved);
    db.prepare("DELETE FROM shop_deleted WHERE id = ?").run(id);
    return t.want;
  });
}

export function deletedOf(db: DatabaseSync, want: string): { id: string; name: string; at: string }[] {
  return db
    .prepare("SELECT id, name, at FROM shop_deleted WHERE what = 'product' AND want = ? ORDER BY at DESC")
    .all(want) as { id: string; name: string; at: string }[];
}

export function deletedWant(db: DatabaseSync, id: string): { at: string; words: string } | null {
  const r = db.prepare("SELECT at, name FROM shop_deleted WHERE id = ? AND what = 'want'").get(id) as
    | { at: string; name: string }
    | undefined;
  return r ? { at: r.at, words: r.name } : null;
}

// a deleted product as it was, with its offers, for its sheet
export function deletedProduct(
  db: DatabaseSync,
  id: string,
): { at: string; want: string; row: ProductRow; offers: OfferRow[] } | null {
  const r = db.prepare("SELECT at, want, row FROM shop_deleted WHERE id = ? AND what = 'product'").get(id) as
    | { at: string; want: string; row: string }
    | undefined;
  if (!r) return null;
  const saved = JSON.parse(r.row) as Saved;
  return { at: r.at, want: r.want, row: productOf(saved.product), offers: saved.offers.map((o) => offerOf(o.offer)) };
}

// ── A run's restart sweep ───────────────────────────────────────────────────────────────────────────────────────

// kestrel restarted while a want ran: it can't finish now, so it says so; a queued want stays queued with its job
export function sweepWants(db: DatabaseSync, now = new Date()): number {
  return Number(
    db
      .prepare(
        "UPDATE wants SET state = 'failed', step = '', job = NULL, error = 'kestrel restarted while it ran: Run again', updated = ? WHERE state = 'running'",
      )
      .run(now.toISOString()).changes,
  );
}
