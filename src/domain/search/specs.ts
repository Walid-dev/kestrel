// The search specs: files in the data folder (searches/*.json) — what I hunt and where is personal, so it never
// enters the repo. The file's name is the spec's id.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import { z } from "zod";
import { dataDir } from "../../platform/paths.ts";

export const Spec = z.object({
  name: z.string().min(1),
  kind: z.enum(["jobs", "deals"]).default("jobs"),
  collector: z.string().min(1), // a path, relative to the data folder unless absolute
  args: z.array(z.string()).default([]),
  everyMinutes: z.number().int().positive().default(360),
  auto: z.boolean().default(true), // false: it runs only when I ask (Search now), never on the clock
  // set times of the day on the computer's clock ("10:00", "20:00", as the old deal hunts ran); none: every everyMinutes
  times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).default([]),
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

// a spec's id is its file name: lowercase words and dashes, so it reads well in a path and a link
export const SPEC_ID = /^[a-z0-9][a-z0-9-]{0,59}$/;

export function readSpecFile(id: string, dir = join(dataDir(), "searches")): Record<string, unknown> | null {
  if (!SPEC_ID.test(id)) return null;
  const file = join(dir, `${id}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
}

// write a spec, checked first: a bad one is refused with the field named, never half-written
export function writeSpecFile(id: string, raw: unknown, dir = join(dataDir(), "searches")): Spec {
  if (!SPEC_ID.test(id)) throw new Error("a search's id is lowercase words and dashes, like full-stack-ai-engineer");
  const read = Spec.safeParse(raw);
  if (!read.success)
    throw new Error(
      `the search's settings miss: ${read.error.issues.map((i) => `${i.path.join(".") || "the file"} ${i.message}`).join("; ")}`,
    );
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${id}.json`);
  writeFileSync(`${file}.tmp`, `${JSON.stringify(raw, null, 2)}\n`);
  renameSync(`${file}.tmp`, file);
  return { ...read.data, id };
}

// the collectors in the data folder: the scripts a search can run
export function listCollectors(dir = join(dataDir(), "collectors")): string[] {
  try {
    return readdirSync(dir)
      .filter((n) => /\.(mjs|js|py|sh)$/.test(n))
      .map((n) => `collectors/${n}`)
      .sort();
  } catch {
    return [];
  }
}

// a spec is due when it never ran; with set times, when the latest of them passed after its last run (a computer that
// slept through one runs it on waking, once); else when everyMinutes passed since its last run
export function isDue(spec: Pick<Spec, "times" | "everyMinutes">, lastStarted: string | null, now: Date): boolean {
  if (!lastStarted) return true;
  const last = new Date(lastStarted).getTime();
  if (!spec.times.length) return now.getTime() - last >= spec.everyMinutes * 60_000;
  let latest = 0;
  for (const back of [0, 1])
    for (const t of spec.times) {
      const [h, m] = t.split(":").map(Number);
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back, h, m).getTime();
      if (at <= now.getTime()) latest = Math.max(latest, at);
    }
  return latest > last;
}
