// The by-hand door to the Learn import: dry by default with counts, --write to land them.
// Run: node scripts/import-learn.ts --from <the old apps folder> [--answers <a folder of answer .txt files>]
//        [--interview-topics work,…] [--write]
// (KESTREL_DATA_DIR picks the target folder.) --from expects learn/lessons.json (its topic names are read from
// learn/learn.js, its progress from learn/data.json) and guides/*.guide.json inside.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { openDb } from "../src/db/db.ts";
import { migrate } from "../src/db/migrate.ts";
import { importAnswers, importGuide, importJobPreps, importOldLearn } from "../src/domain/learn/import-learn.ts";
import { importOldProgress } from "../src/domain/learn/review.ts";
import { dataDir } from "../src/platform/paths.ts";

const readJson = (file: string): unknown => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`that file can't be read as JSON: ${(e as Error).message}`);
    process.exit(1);
  }
};

// the old page names its topics in one line, `const TOPICS = { work: "Your work", … };`
function topicLabels(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const line = readFileSync(file, "utf8").match(/const TOPICS = \{([^}]*)\}/)?.[1] ?? "";
  return Object.fromEntries([...line.matchAll(/(\w+):\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]));
}

if (process.argv[1]?.endsWith("import-learn.ts")) {
  const { values } = parseArgs({
    options: {
      from: { type: "string" },
      answers: { type: "string" },
      "interview-topics": { type: "string", default: "" },
      write: { type: "boolean", default: false },
    },
  });
  if (!values.from && !values.answers) {
    console.error(
      "import-learn: --from <the old apps folder> [--answers <a folder of .txt answers>] [--interview-topics a,b] [--write]",
    );
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
    if (existsSync(lessonsFile)) {
      const interviewTopics = values["interview-topics"]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      add(
        "the old lessons",
        importOldLearn(db, readJson(lessonsFile), {
          labels: topicLabels(join(values.from, "learn", "learn.js")),
          interviewTopics,
        }),
      );
      const progressFile = join(values.from, "learn", "data.json");
      if (existsSync(progressFile)) {
        add("the old job preps", importJobPreps(db, readJson(progressFile)));
        const got = importOldProgress(db, readJson(progressFile));
        console.log(
          `  the old progress: ${got.landed} reviews${got.skipped.length ? `, ${got.skipped.length} skipped` : ""}`,
        );
        all.skipped.push(...got.skipped);
      }
    } else console.log("  no learn/lessons.json there");
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
