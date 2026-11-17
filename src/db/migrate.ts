// Migrations: numbered .sql files, applied once each in order, tracked with PRAGMA user_version. Before a migration
// touches an existing database, the whole file is copied with snapshot() (VACUUM INTO), so a bad migration never
// costs data: the copy sits beside the database as <file>.before-migrations. An applied migration is never edited; a
// fix is a new number.
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Db, snapshot } from "./db.ts";

const OWN = fileURLToPath(new URL("./migrations/", import.meta.url));

export function migrate(db: Db, dbFile: string, dir: string = OWN): { applied: number; copy: string | null } {
  const files = readdirSync(dir)
    .filter((f) => /^\d+-.*\.sql$/.test(f))
    .sort();
  const row = db.prepare("PRAGMA user_version").get() as { user_version?: number } | undefined;
  const version = Number(row?.user_version ?? 0);
  const pending = files.filter((f) => Number.parseInt(f, 10) > version);
  if (!pending.length) return { applied: 0, copy: null };
  // a copy only when there is something to protect: a database that has lived through a version already
  let copy: string | null = null;
  if (version > 0 && existsSync(dbFile)) {
    copy = `${dbFile}.before-migrations`;
    if (existsSync(copy)) rmSync(copy);
    snapshot(db, copy);
  }
  for (const f of pending) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(readFileSync(join(dir, f), "utf8"));
      db.exec(`PRAGMA user_version = ${Number.parseInt(f, 10)}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw new Error(`migration ${f} failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  return { applied: pending.length, copy };
}
