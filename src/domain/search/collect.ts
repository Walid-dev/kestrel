// The collector door: a collector is an executable in the data folder that prints its items as JSON. The engine runs
// it with a time limit and a size cap, reads the items, and turns every bad ending into a problem in plain words —
// exit code 3 means the site wants a login again (the old setup's convention, so existing scripts work unchanged).
import { execFile } from "node:child_process";
import { z } from "zod";

export const Item = z.object({
  source: z.string().min(1),
  url: z.string().min(1),
  title: z.string().min(1),
  org: z.string().default(""),
  location: z.string().default(""),
  posted: z.string().default(""),
  workMode: z.string().default(""),
  seniority: z.string().default(""),
  salaryMin: z.number().nullable().default(null),
  salaryMax: z.number().nullable().default(null),
  salaryCurrency: z.string().nullable().default(null),
  salaryPeriod: z.string().nullable().default(null), // yearly unless said; hourly pay is annualized for the floor
  usOnly: z.boolean().default(false),
  excerpt: z.string().default(""),
  price: z.number().nullable().default(null), // a deal's money; jobs leave it null
});
export type Item = z.infer<typeof Item>;

export type Collected = { items: Item[]; problem: string };

export function runCollector(
  script: string,
  args: string[],
  opts: { timeoutMs?: number; maxBytes?: number; cwd?: string; env?: Record<string, string> } = {},
): Promise<Collected> {
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const maxBytes = opts.maxBytes ?? 20_000_000;
  return new Promise((resolve) => {
    execFile(
      script,
      args,
      {
        timeout: timeoutMs,
        maxBuffer: maxBytes,
        encoding: "utf8",
        cwd: opts.cwd,
        env: { ...process.env, ...opts.env },
      },
      (error, stdout, stderr) => {
        const hint = (stderr || "").trim().split("\n")[0]?.slice(0, 120) ?? "";
        // a browser collector with no browser: its own problem kind, so the runs view never cries wolf at boot
        if (error && /ECONNREFUSED[\s\S]*9222|connectOverCDP|browserType\.connect/i.test(stderr || ""))
          return resolve({ items: [], problem: "the agent's browser isn't running: the run will catch up once it is" });
        if (error) {
          const e = error as { code?: number | string; killed?: boolean; signal?: string | null };
          if (e.code === 3)
            return resolve({ items: [], problem: `the site wants a login again${hint ? `: ${hint}` : ""}` });
          if (e.killed || e.signal === "SIGTERM")
            return resolve({
              items: [],
              problem: `the collector ran past ${Math.round(timeoutMs / 1000)}s and was stopped`,
            });
          if (e.code === "ENOENT") return resolve({ items: [], problem: "the collector script is not there" });
          return resolve({ items: [], problem: `the collector failed (exit ${e.code})${hint ? `: ${hint}` : ""}` });
        }
        let raw: unknown;
        try {
          raw = JSON.parse(stdout);
        } catch {
          return resolve({ items: [], problem: "the collector answered something that isn't JSON" });
        }
        const read = z.array(Item).safeParse(raw);
        if (!read.success)
          return resolve({
            items: [],
            problem: `the collector's items miss the shape: ${read.error.issues[0]?.message ?? ""}`,
          });
        resolve({ items: read.data, problem: "" });
      },
    );
  });
}
