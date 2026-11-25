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

// a browser collector that couldn't reach the agent's browser (its DevTools door, CDP), each case named for what it is:
// a refused connection is a browser that isn't running; Playwright's "Browser context management is not supported" is
// the agent's Chrome open with no window; anything else at that door is a connection that failed. Null: not the
// browser's door
export function browserProblem(stderr: string): string | null {
  if (/Browser context management is not supported/i.test(stderr))
    return "the agent's browser has no window open: the next run tries again";
  if (!/connectOverCDP|browserType\.connect|ECONNREFUSED[\s\S]*9222/i.test(stderr)) return null;
  // a browser collector with no browser: its own problem kind, so the runs view never cries wolf at boot
  if (/ECONNREFUSED/i.test(stderr)) return "the agent's browser isn't running: the run will catch up once it is";
  // Playwright's own words after its call's name ("Timeout 30000ms exceeded."), short, when it gives them
  const why = /connect(?:OverCDP)?:\s*([^\n]{1,80})/i.exec(stderr)?.[1]?.trim().replace(/\.$/, "") ?? "";
  return `couldn't connect to the agent's browser${why ? ` (${why})` : ""}: the next run tries again`;
}

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
        const browser = error ? browserProblem(stderr || "") : null;
        if (browser) return resolve({ items: [], problem: browser });
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
        // a site that throttles this computer still exits clean: name it, whether some items came or none
        const throttled = /\b429\b|too many requests|blocked/i.test(stderr || "");
        resolve({
          items: read.data,
          problem: throttled
            ? read.data.length
              ? "the site throttled part of the search (429): the next run tries again"
              : "the site is throttling searches from this computer (429): the next run tries again"
            : "",
        });
      },
    );
  });
}
