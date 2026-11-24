// Turn the old setup's searches into searches/*.json in the data folder. Dry by default: it prints what it would write;
// --write lands it.
// - Job hunts (job_hunts rows, JSON documents): skeletons with the name, title words, the pay floor and deal-breakers as
//   avoid words. They land off, each waiting for its collector line — pointing at a real script is a decision.
// - Deal searches (the old specs folder, one .md each: `kind: deal`, `collector: kijiji`…): ready to run with the old
//   collectors themselves, through node, with the same knobs the old engine gave them (term, pages, price range, age).
//   Same file names, so each owns the listings the import already brought. They run only when asked (auto: false)
//   while the old setup still runs them on its clock.
// Run: node scripts/convert-v1-specs.ts --from <old hunts.db> --out <searches dir> [--write]
//      node scripts/convert-v1-specs.ts --deals <old specs folder> --out <searches dir> [--write]
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";

type OldHunt = {
  name?: string;
  titles?: string[];
  mustHave?: string[] | string; // a list, or one line of text as the old hunt page saves it
  niceToHave?: string[] | string;
  minSalary?: number;
  dealBreakers?: string[] | string;
  area?: string;
  level?: string;
  archived?: boolean;
};

// the old collectors' names on screen
const SITE: Record<string, string> = { kijiji: "Kijiji", "facebook-marketplace": "Marketplace" };
const list = (s: string) =>
  s
    .split(/[;,]/)
    .map((x) => x.trim())
    .filter(Boolean);
// the must-haves and nice-to-haves as skills, each list or text split on commas, semicolons, line breaks (the old
// page's field is a textarea) and "or" (the word, never inside one), stray brackets trimmed: spread whole, a text
// gave one "skill" per letter, and every posting names letters
const skills = (...from: unknown[]): string[] => {
  const seen = new Map<string, string>(); // a repeat in other case is the same skill: the first spelling stays
  for (const piece of from
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .flatMap((x) => (typeof x === "string" ? x.split(/[;,\n]|\bor\b/i) : []))
    // "Python (or Go)" splits into "Python (" and "Go)": a bracket left open or never opened goes, "Go (1.22)" stays
    .map((x) => x.replace(/^[\s()]+|[\s(]+$/g, "").replace(/^([^(]*?)[\s)]+$/, "$1"))
    .filter(Boolean))
    if (!seen.has(piece.toLowerCase())) seen.set(piece.toLowerCase(), piece);
  return [...seen.values()];
};

// one old deal spec (its text and path) as a kestrel search, or null when it isn't a deal run by a collector
export function dealSpecFromV1(text: string, file: string, collectorsDir: string) {
  const head = text.split(/^---$/m)[0] ?? "";
  const get = (k: string) => head.match(new RegExp(`^${k}:[ \\t]*(.*)$`, "m"))?.[1]?.trim() ?? "";
  const num = (k: string) => (get(k) && Number.isFinite(Number(get(k))) ? Number(get(k)) : 0);
  if (get("kind") !== "deal" || get("fetch") !== "script" || !get("collector")) return null;
  const pages = num("pages") || 1;
  const times = list(get("schedule")).length;
  const want = list(get("require")).length ? list(get("require")) : list(get("title_like"));
  return {
    id: basename(file, ".md"),
    spec: {
      name: `${get("category") || get("term")} · ${SITE[get("collector")] ?? get("collector")}`,
      kind: "deals",
      collector: "/usr/bin/env", // the old collectors are plain modules: node runs them, as the old engine did
      args: ["node", join(collectorsDir, `${get("collector")}.mjs`), file],
      everyMinutes: times ? Math.round(1440 / times) : 720,
      auto: false,
      env: {
        HUNT_SPEC: file,
        HUNT_TERM: get("term"),
        HUNT_PAGES: String(pages),
        HUNT_MAX_AGE_DAYS: get("max_age_days"),
        HUNT_MIN_PRICE: get("min_price"),
        HUNT_MAX_PRICE: get("max_price"),
      },
      limits: { perRun: 200, timeoutMs: Math.max(180_000, 60_000 + pages * 20_000), maxBytes: 20_000_000 },
      about: "",
      hunt: get("hunt"),
      category: get("category"),
      scoring: {
        title: { want, avoid: list(get("exclude")) },
        price: { cap: num("max_price"), floor: num("min_price") },
        freshDays: num("max_age_days") || 7,
      },
      enabled: true,
    },
  };
}

export function convertDealSpecs(from: string, out: string, write: boolean): string[] {
  const collectors = join(dirname(from), "collectors");
  const done: string[] = [];
  for (const f of readdirSync(from).filter((n) => n.endsWith(".md"))) {
    const file = join(from, f);
    const made = dealSpecFromV1(readFileSync(file, "utf8"), file, collectors);
    if (!made) continue;
    const target = join(out, `${made.id}.json`);
    const there = existsSync(target);
    if (write) {
      mkdirSync(out, { recursive: true });
      writeFileSync(target, `${JSON.stringify(made.spec, null, 2)}\n`);
    }
    const { floor, cap } = made.spec.scoring.price;
    done.push(
      `${made.id}: ${made.spec.name}, "${made.spec.env.HUNT_TERM}", $${floor}–$${cap}${there && !write ? " (replaces the file there)" : ""}`,
    );
  }
  return done;
}

export function convertSpecs(from: string, out: string): string[] {
  const old = new DatabaseSync(from, { readOnly: true });
  const rows = old.prepare("SELECT id, doc FROM job_hunts").all() as { id: string; doc: string }[];
  old.close();
  mkdirSync(out, { recursive: true });
  const written: string[] = [];
  for (const r of rows) {
    if ((JSON.parse(r.doc) as OldHunt).archived) continue;
    const h = JSON.parse(r.doc) as OldHunt;
    const spec = {
      name: h.name ?? r.id,
      kind: "jobs",
      collector: "collectors/point-me-at-a-script.mjs",
      env: {},
      everyMinutes: 360,
      enabled: false,
      scoring: {
        title: {
          want: (h.titles ?? [])
            .flatMap((x) => String(x).split(/[;,]/))
            .map((x) => x.trim().toLowerCase())
            .filter(Boolean),
          avoid: (Array.isArray(h.dealBreakers) ? h.dealBreakers : [h.dealBreakers ?? ""])
            .flatMap((x) => String(x).split(/[;,]/))
            .map((x) => x.trim())
            .filter(Boolean),
        },
        skills: skills(h.mustHave, h.niceToHave),
        level: { want: [], avoid: [] },
        ...(h.minSalary ? { pay: { floor: h.minSalary } } : {}),
        ...(h.area
          ? {
              places: {
                words: String(h.area)
                  .split(/[;,]/)
                  .map((x) => x.trim())
                  .filter(Boolean),
              },
            }
          : {}),
        ...(h.level ? { level: { want: [h.level] } } : {}),
        freshDays: 7,
      },
    };
    const file = join(out, `${r.id}.json`);
    writeFileSync(file, `${JSON.stringify(spec, null, 2)}\n`);
    written.push(file);
  }
  return written;
}

if (process.argv[1]?.endsWith("convert-v1-specs.ts")) {
  const { values } = parseArgs({
    options: {
      from: { type: "string" },
      deals: { type: "string" },
      out: { type: "string" },
      write: { type: "boolean", default: false },
    },
  });
  if ((!values.from && !values.deals) || !values.out) {
    console.error(
      "convert-v1-specs: --from <old hunts.db> | --deals <old specs folder>, then --out <searches dir> [--write]",
    );
    process.exit(2);
  }
  if (values.deals) {
    const done = convertDealSpecs(values.deals, values.out, values.write);
    console.log(values.write ? `wrote ${done.length} deal searches:` : `dry run, would write ${done.length}:`);
    for (const d of done) console.log(`  ${d}`);
  } else if (values.from) {
    if (!values.write) console.log("dry run: add --write to land the job skeletons");
    else
      for (const f of convertSpecs(values.from, values.out))
        console.log(`wrote ${f} (enabled: false — point its collector at a script)`);
  }
}
