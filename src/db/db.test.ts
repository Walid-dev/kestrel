import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDb, snapshot, tx } from "./db.ts";
import { migrate } from "./migrate.ts";

const fresh = () => {
  const dir = mkdtempSync(join(tmpdir(), "kestrel-db-"));
  return { dir, file: join(dir, "made-up.db") };
};

test("migrations run once, in order, and a second run changes nothing", () => {
  const { dir, file } = fresh();
  const mig = join(dir, "migrations");
  mkdirSync(mig, { recursive: true });
  writeFileSync(join(mig, "001-a.sql"), "CREATE TABLE a (id INTEGER PRIMARY KEY, n TEXT NOT NULL) STRICT;");
  const db = openDb(file);
  assert.deepEqual(migrate(db, file, mig).applied, 1);
  db.prepare("INSERT INTO a (n) VALUES (?)").run("one");
  assert.equal(migrate(db, file, mig).applied, 0);
  assert.equal((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 1);
  db.close();
});

// two branches built side by side may each add the next number: a fresh database runs both, but one already at that
// number never runs the second. So each number is used once, from 1, with none skipped
test("the migrations are numbered once each, from 1, with no gap", () => {
  const numbers = readdirSync(new URL("./migrations/", import.meta.url))
    .filter((f) => /^\d+-.*\.sql$/.test(f))
    .map((f) => Number.parseInt(f, 10))
    .sort((a, b) => a - b);
  assert.deepEqual(
    numbers,
    numbers.map((_, i) => i + 1),
    "two migrations share a number, or one is missing: give the newer one the next free number",
  );
});

test("the database runs in WAL mode with foreign keys on, and tx rolls back whole", () => {
  const { dir, file } = fresh();
  const mig = join(dir, "m");
  mkdirSync(mig, { recursive: true });
  writeFileSync(
    join(mig, "001-fk.sql"),
    "CREATE TABLE p (id INTEGER PRIMARY KEY) STRICT; CREATE TABLE c (id INTEGER PRIMARY KEY, p INTEGER NOT NULL REFERENCES p(id)) STRICT;",
  );
  const db = openDb(file);
  migrate(db, file, mig);
  assert.equal((db.prepare("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode, "wal");
  assert.throws(() => db.prepare("INSERT INTO c (p) VALUES (99)").run());
  assert.throws(() =>
    tx(db, () => {
      db.prepare("INSERT INTO p (id) VALUES (1)").run();
      throw new Error("made-up failure");
    }),
  );
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM p").get() as { n: number }).n, 0);
  db.close();
});

test("a later migration first copies the database, committed WAL rows included", () => {
  const { dir, file } = fresh();
  const mig = join(dir, "m");
  mkdirSync(mig, { recursive: true });
  writeFileSync(join(mig, "001-a.sql"), "CREATE TABLE a (id INTEGER PRIMARY KEY, n TEXT NOT NULL) STRICT;");
  const db = openDb(file);
  migrate(db, file, mig);
  db.prepare("INSERT INTO a (n) VALUES (?)").run("kept"); // committed, but likely still in the -wal file
  writeFileSync(join(mig, "002-b.sql"), "CREATE TABLE b (id INTEGER PRIMARY KEY) STRICT;");
  const { applied, copy } = migrate(db, file, mig);
  assert.equal(applied, 1);
  assert.ok(copy);
  const old = openDb(copy as string);
  assert.equal((old.prepare("SELECT COUNT(*) AS n FROM a").get() as { n: number }).n, 1);
  assert.throws(() => old.prepare("SELECT COUNT(*) FROM b").get()); // the copy is from before the migration
  old.close();
  db.close();
});

test("snapshot writes a copy that opens on its own", () => {
  const { dir, file } = fresh();
  const db = openDb(file);
  db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, w TEXT NOT NULL) STRICT;");
  db.prepare("INSERT INTO t (w) VALUES (?)").run("made-up");
  const to = join(dir, "copy.db");
  snapshot(db, to);
  const copy = openDb(to);
  assert.equal((copy.prepare("SELECT w FROM t").get() as { w: string }).w, "made-up");
  copy.close();
  db.close();
});
