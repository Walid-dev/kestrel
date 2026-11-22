// The by-hand door to the import: dry by default with counts that must match, --write to land them.
// Run: node scripts/import-v1.ts --from <old hunts.db> [--specs <old specs folder>] [--write]  (KESTREL_DATA_DIR picks the target folder)
import { join } from "node:path";
import { parseArgs } from "node:util";
import { openDb } from "../src/db/db.ts";
import { migrate } from "../src/db/migrate.ts";
import { importV1 } from "../src/domain/search/import-v1.ts";
import { dataDir } from "../src/platform/paths.ts";

if (process.argv[1]?.endsWith("import-v1.ts")) {
  const { values } = parseArgs({
    options: { from: { type: "string" }, specs: { type: "string" }, write: { type: "boolean", default: false } },
  });
  if (!values.from) {
    console.error("import-v1: --from <the old hunts.db> [--write]");
    process.exit(2);
  }
  if (!process.env.KESTREL_DATA_DIR?.trim()) {
    console.error("set KESTREL_DATA_DIR to the data folder first, so real content lands only there");
    process.exit(2);
  }
  const file = join(dataDir(), "kestrel.db");
  const db = openDb(file);
  migrate(db, file);
  // one transaction: a crash midway leaves nothing half-landed (a rerun would heal it, but why make it)
  db.exec("BEGIN");
  let counts: ReturnType<typeof importV1>;
  try {
    counts = importV1(db, values.from, values.write, { specsDir: values.specs });
    db.exec(values.write ? "COMMIT" : "ROLLBACK");
  } catch (e) {
    db.exec("ROLLBACK");
    console.error(`the import failed and nothing landed: ${(e as Error).message}`);
    process.exit(1);
  }
  console.log(values.write ? "written:" : "dry run (nothing written):");
  console.log("  the old database by status:", JSON.stringify(counts.source));
  console.log(`  the old database: ${counts.sourceStarred} starred, ${counts.sourceScored} scored`);
  console.log("  would land / landed:", JSON.stringify(counts.landed));
  console.log("  deals by status:", JSON.stringify(counts.deals.source));
  console.log("  deals would land / landed:", JSON.stringify(counts.deals.landed));
  console.log(`  applications: ${counts.applications.sent} sent, ${counts.applications.notSent} not sent`);
  console.log(`  deep checks: ${counts.deepChecks}`);
  console.log("  kestrel by status:", JSON.stringify(counts.kestrel));
  console.log(`  kestrel: ${counts.kestrelStarred} starred, ${counts.kestrelScored} scored`);
}
