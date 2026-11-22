// The by-hand door to the Learn import: dry by default with counts, --write to land them.
// Run: node scripts/import-learn.ts --from <the old apps folder> [--answers <a folder of answer .txt files>] [--write]
// (KESTREL_DATA_DIR picks the target folder.) --from expects learn/lessons.json and guides/*.guide.json inside.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { openDb } from "../src/db/db.ts";
import { migrate } from "../src/db/migrate.ts";
import { importAnswers, importGuide, importOldLearn } from "../src/domain/learn/import-learn.ts";
import { dataDir } from "../src/platform/paths.ts";

const readJson = (file: string): unknown => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`that file can't be read as JSON: ${(e as Error).message}`);
    process.exit(1);
  }
};

if (process.argv[1]?.endsWith("import-learn.ts")) {
  const { values } = parseArgs({
    options: {
      from: { type: "string" },
      answers: { type: "string" },
      write: { type: "boolean", default: false },
    },
  });
  if (!values.from && !values.answers) {
    console.error("import-learn: --from <the old apps folder> [--answers <a folder of .txt answers>] [--write]");
    process.exit(2);
  }
  if (!process.env.KESTREL_DATA_DIR?.trim()) {
    console.error("set KESTREL_DATA_DIR to the data folder first, so real content lands only there");
    process.exit(2);
  }
  const file = join(dataDir(), "kestrel.db");
  const db = openDb(file);
  migrate(db, file);
  db.exec("BEGIN");
  const all = { packs: 0, lessons: 0, skipped: [] as string[] };
  const add = (name: string, got: { packs: number; lessons: number; skipped: string[] }) => {
    console.log(
      `  ${name}: ${got.packs} packs, ${got.lessons} lessons${got.skipped.length ? `, ${got.skipped.length} skipped` : ""}`,
    );
    all.packs += got.packs;
    all.lessons += got.lessons;
    all.skipped.push(...got.skipped);
  };
  if (values.from) {
    const lessonsFile = join(values.from, "learn", "lessons.json");
    if (existsSync(lessonsFile)) add("the old lessons", importOldLearn(db, readJson(lessonsFile)));
    else console.log("  no learn/lessons.json there");
    const guidesDir = join(values.from, "guides");
    const guides = existsSync(guidesDir) ? readdirSync(guidesDir).filter((f) => f.endsWith(".guide.json")) : [];
    for (const g of guides) add(g, importGuide(db, readJson(join(guidesDir, g))));
    if (guides.length === 0) console.log("  no guides/*.guide.json there");
  }
  if (values.answers) {
    const files = readdirSync(values.answers).filter((f) => f.endsWith(".txt"));
    for (const f of files)
      add(
        f,
        importAnswers(db, basename(f, ".txt").replaceAll("-", " "), readFileSync(join(values.answers, f), "utf8")),
      );
    if (files.length === 0) console.log("  no .txt answers there");
  }
  for (const s of all.skipped) console.log(`  skipped: ${s}`);
  if (values.write) {
    db.exec("COMMIT");
    console.log(`written: ${all.packs} packs, ${all.lessons} lessons`);
  } else {
    db.exec("ROLLBACK");
    console.log(`dry run (nothing written): ${all.packs} packs, ${all.lessons} lessons would land`);
  }
}
