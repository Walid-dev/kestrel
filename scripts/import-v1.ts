// The by-hand door to the import: dry by default with counts that must match, --write to land them.
// Run: node scripts/import-v1.ts --from <old hunts.db> [--write]  (KESTREL_DATA_DIR picks the target folder)
import { join } from "node:path";
import { parseArgs } from "node:util";
import { openDb } from "../src/db/db.ts";
import { migrate } from "../src/db/migrate.ts";
import { importV1 } from "../src/domain/search/import-v1.ts";
import { dataDir } from "../src/platform/paths.ts";

if (process.argv[1]?.endsWith("import-v1.ts")) {
  const { values } = parseArgs({ options: { from: { type: "string" }, write: { type: "boolean", default: false } } });
  if (!values.from) {
    console.error("import-v1: --from <the old hunts.db> [--write]");
    process.exit(2);
  }
  const file = join(dataDir(), "kestrel.db");
  const db = openDb(file);
  migrate(db, file);
  const counts = importV1(db, values.from, values.write);
  console.log(values.write ? "written:" : "dry run (nothing written):");
  console.log("  the old database by status:", JSON.stringify(counts.source));
  console.log(`  the old database: ${counts.sourceStarred} starred, ${counts.sourceScored} scored`);
  console.log("  would land / landed:", JSON.stringify(counts.landed));
  console.log("  kestrel by status:", JSON.stringify(counts.kestrel));
  console.log(`  kestrel: ${counts.kestrelStarred} starred, ${counts.kestrelScored} scored`);
}
