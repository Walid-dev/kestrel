// The search specs: files in the data folder (searches/*.json) — what I hunt and where is personal, so it never
// enters the repo. The file's name is the spec's id.
import { readdirSync, readFileSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import { z } from "zod";
import { dataDir } from "../../platform/paths.ts";

export const Spec = z.object({
  name: z.string().min(1),
  kind: z.enum(["jobs", "deals"]).default("jobs"),
  collector: z.string().min(1), // a path, relative to the data folder unless absolute
  args: z.array(z.string()).default([]),
  everyMinutes: z.number().int().positive().default(360),
  env: z.record(z.string(), z.string()).default({}), // the old convention's knobs (terms, pages) travel here
  limits: z
    .object({
      perRun: z.number().int().positive().default(200),
      timeoutMs: z.number().int().positive().default(180_000),
      maxBytes: z.number().int().positive().default(20_000_000),
    })
    .default({ perRun: 200, timeoutMs: 180_000, maxBytes: 20_000_000 }),
  about: z.string().default(""), // one line of what it looks for, under the hunt's name
  hunt: z.string().default(""), // searches sharing a hunt show together (a deal hunt across sites and models)
  category: z.string().default(""), // the model or the group inside a hunt
  scoring: z.unknown(), // score.ts reads it; kept loose here so a spec file edit never bricks the list
  enabled: z.boolean().default(true),
});
export type Spec = z.infer<typeof Spec> & { id: string };

export function loadSpecs(dir = join(dataDir(), "searches")): { specs: Spec[]; problems: string[] } {
  const specs: Spec[] = [];
  const problems: string[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith(".json"));
  } catch {
    return { specs, problems }; // no searches folder yet: an empty, honest list
  }
  for (const n of names.sort()) {
    try {
      const read = Spec.parse(JSON.parse(readFileSync(join(dir, n), "utf8")));
      specs.push({ ...read, id: basename(n, ".json") });
    } catch (e) {
      problems.push(`${n}: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    }
  }
  return { specs, problems };
}

export const collectorPath = (spec: Spec): string =>
  isAbsolute(spec.collector) ? spec.collector : join(dataDir(), spec.collector);
