// The made-up want for development: a robot vacuum compared on six criteria, eight fictional products, offers in
// every read state (a data price, a price from the page's words, blocked, link, mismatch) and 40 days of readings,
// written into the made-up data folder's database (src/domain/shopping/made-up.ts). Never the real folder: it stops
// when KESTREL_DATA_DIR names one. Run it with the TMPDIR of the dev server it serves.
import { join } from "node:path";
import { openDb } from "../src/db/db.ts";
import { migrate } from "../src/db/migrate.ts";
import { seedMadeUpWant } from "../src/domain/shopping/made-up.ts";
import { dataDir, isDeployed } from "../src/platform/paths.ts";

if (isDeployed()) {
  console.error("seed-shopping writes made-up data; unset KESTREL_DATA_DIR");
  process.exit(1);
}
const file = join(dataDir(), "kestrel.db");
const db = openDb(file);
migrate(db, file);
const id = seedMadeUpWant(db, new Date());
db.close();
console.log(`made-up want ${id} seeded`);
