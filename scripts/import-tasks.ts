// The by-hand door to the tasks import: dry by default with counts, --write to land them.
// Run: node scripts/import-tasks.ts --from <the old tasks data.json> [--write]  (KESTREL_DATA_DIR picks the target)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { openDb } from "../src/db/db.ts";
import { migrate } from "../src/db/migrate.ts";
import { importOldTasks } from "../src/domain/tasks/tasks.ts";
import { dataDir } from "../src/platform/paths.ts";

if (process.argv[1]?.endsWith("import-tasks.ts")) {
  const { values } = parseArgs({ options: { from: { type: "string" }, write: { type: "boolean", default: false } } });
  if (!values.from) {
    console.error("import-tasks: --from <the old tasks data.json> [--write]");
    process.exit(2);
  }
  const file = join(dataDir(), "kestrel.db");
  const db = openDb(file);
  migrate(db, file);
  db.exec("BEGIN");
  const got = importOldTasks(db, JSON.parse(readFileSync(values.from, "utf8")));
  for (const s of got.skipped) console.log(`  skipped: ${s}`);
  if (values.write) {
    db.exec("COMMIT");
    console.log(`written: ${got.landed} tasks`);
  } else {
    db.exec("ROLLBACK");
    console.log(`dry run (nothing written): ${got.landed} tasks would land`);
  }
}
