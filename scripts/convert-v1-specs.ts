// Turn the old setup's hunt specs (job_hunts rows, JSON documents) into searches/*.json skeletons in the data
// folder: name, title words, the pay floor, deal-breakers as avoid words. They land disabled, each waiting for its
// collector line — pointing at a real script is a decision, not a guess.
// Run: node scripts/convert-v1-specs.ts --from <old hunts.db> --out <searches dir>
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";

type OldHunt = {
  name?: string;
  titles?: string[];
  mustHave?: string[];
  niceToHave?: string[];
  minSalary?: number;
  dealBreakers?: string[] | string;
  area?: string;
  level?: string;
  archived?: boolean;
};

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
        skills: [...(h.mustHave ?? []), ...(h.niceToHave ?? [])],
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
  const { values } = parseArgs({ options: { from: { type: "string" }, out: { type: "string" } } });
  if (!values.from || !values.out) {
    console.error("convert-v1-specs: --from <old hunts.db> --out <searches dir>");
    process.exit(2);
  }
  for (const f of convertSpecs(values.from, values.out))
    console.log(`wrote ${f} (enabled: false — point its collector at a script)`);
}
