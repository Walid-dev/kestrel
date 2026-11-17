// The database: one SQLite file in the data folder, through Node's own node:sqlite — nothing to install. WAL mode
// (readers don't block the writer), foreign keys on, STRICT tables in the migrations. main.ts opens it once and
// passes it where it is needed; only src/domain/ writes to it.
import { DatabaseSync } from "node:sqlite"; // named Database since Node 26.11; this alias stays, and the types know it

export type Db = DatabaseSync;

export function openDb(file: string): Db {
  const db = new DatabaseSync(file, { timeout: 5000 });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA synchronous = NORMAL;");
  return db;
}

// a small transaction helper: everything in fn, or nothing
export function tx<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

// the copy before migrations: SQLite's own snapshot, which includes committed WAL changes the main file doesn't hold yet
export function snapshot(db: Db, to: string): void {
  db.exec(`VACUUM INTO '${to.replaceAll("'", "''")}'`);
}
