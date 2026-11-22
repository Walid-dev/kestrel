// Research: I ask, the local model searches the web through the model door's own tools and writes the answer as a
// lesson, kept. Quick: one search, three pages read. Deep: the model plans three or four more searches, six pages
// read. One at a time, like the model itself; Live follows each step, and a restart marks an unfinished one failed.
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { callModel } from "../ai/client.ts";
import { type Level, planPrompt, RESEARCH_VERSION, type Read, reportPrompt, SYSTEM } from "../ai/research/prompt.ts";
import { Plan, ResearchReport } from "../ai/research/shape.ts";
import { fetchPage, type Hit, searchWeb } from "../ai/web.ts";
import { begin } from "../platform/activity.ts";
import type { Settings } from "../platform/config.ts";
import { recordCall } from "./calls.ts";
import { modelFor } from "./models.ts";
import { Refused } from "./notes/documents.ts";

export const LEVELS: Record<Level, { pages: number; chars: number; perSearch: number; maxTokens: number }> = {
  quick: { pages: 3, chars: 5000, perSearch: 6, maxTokens: 2500 },
  deep: { pages: 6, chars: 4000, perSearch: 4, maxTokens: 5000 },
};

export type Ref = { n: number; title: string; url: string };
export type Kept = ResearchReport & { refs: Ref[]; read: number[]; model: string };
export type ResearchRow = {
  id: string;
  question: string;
  level: Level;
  state: "running" | "done" | "failed";
  step: string;
  started: string;
  finished: string | null;
  report: Kept | null;
  error: string;
};

let busy = false;

// the hits of every search, each link once, in the order found
export function mergeHits(lists: Hit[][], perSearch: number): Hit[] {
  const out: Hit[] = [];
  for (const list of lists)
    for (const h of list.slice(0, perSearch)) if (!out.some((x) => x.url === h.url)) out.push(h);
  return out;
}

export function startResearch(db: DatabaseSync, settings: Settings, input: { question: string; level: Level }): string {
  const question = input.question.trim();
  const level = input.level;
  if (!question) throw new Refused("ask something");
  if (question.length > 1000) throw new Refused("a question of 1,000 characters at most");
  if (busy) throw new Refused("a research is running: one at a time, like the model");
  const id = randomUUID();
  db.prepare("INSERT INTO research (id, question, level, state, step, started) VALUES (?, ?, ?, 'running', ?, ?)").run(
    id,
    question,
    level,
    "Starting",
    new Date().toISOString(),
  );
  busy = true;
  const live = begin("research", `Research: ${question}`.slice(0, 120), `/research?open=${id}`);
  const step = (s: string) => {
    db.prepare("UPDATE research SET step = ? WHERE id = ?").run(s, id);
    live.step(s);
  };
  const finish = (state: "done" | "failed", report: Kept | null, error = "") => {
    db.prepare("UPDATE research SET state = ?, step = '', finished = ?, report = ?, error = ? WHERE id = ?").run(
      state,
      new Date().toISOString(),
      report ? JSON.stringify(report) : null,
      error,
      id,
    );
    live.end(state, error);
  };
  void (async () => {
    try {
      const model = modelFor(db, settings, "research");
      const effective = { ...settings.models, careful: model, fast: model };
      const plan = LEVELS[level];
      let queries = [question];
      if (level === "deep") {
        step("Planning the searches");
        const got = await callModel(
          effective,
          { model, system: SYSTEM, prompt: planPrompt(question), maxTokens: 800, thinking: false },
          Plan,
        );
        recordCall(db, `research-plan:v${RESEARCH_VERSION}`, got);
        if (got.ok) queries = [question, ...got.value.queries.slice(0, 4)];
      }
      step(queries.length > 1 ? `Searching the web: ${queries.length} searches` : "Searching the web");
      const lists: Hit[][] = [];
      for (const q of queries) lists.push(await searchWeb(settings.models, q));
      const hits = mergeHits(lists, plan.perSearch);
      if (!hits.length)
        return finish("failed", null, "the web search found nothing: is the model door's web search up?");
      // a few more pages than needed are opened at once; the first that read well, in the order found, are kept
      step(`Reading ${plan.pages} pages`);
      const tries = hits.slice(0, plan.pages + 3);
      const opened = await Promise.allSettled(tries.map((h) => fetchPage(settings.models, h.url, plan.chars)));
      const pages: Read[] = [];
      opened.forEach((o, i) => {
        if (o.status === "fulfilled" && o.value.length > 300 && pages.length < plan.pages)
          pages.push({ n: i + 1, title: tries[i].title, url: tries[i].url, text: o.value });
      });
      step("Writing the answer");
      const got = await callModel(
        effective,
        {
          model,
          system: SYSTEM,
          prompt: reportPrompt(question, level, hits, pages),
          maxTokens: plan.maxTokens,
          thinking: true,
        },
        ResearchReport,
      );
      recordCall(db, `research:v${RESEARCH_VERSION}`, got);
      if (!got.ok) return finish("failed", null, `the model didn't answer well: ${got.why}`);
      finish("done", {
        ...got.value,
        refs: hits.map((h, i) => ({ n: i + 1, title: h.title, url: h.url })),
        read: pages.map((p) => p.n),
        model,
      });
    } catch (e) {
      finish("failed", null, `the research stopped: ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`);
    } finally {
      busy = false;
    }
  })();
  return id;
}

const row = (r: Record<string, unknown>): ResearchRow => ({
  id: String(r.id),
  question: String(r.question),
  level: r.level as Level,
  state: r.state as ResearchRow["state"],
  step: String(r.step),
  started: String(r.started),
  finished: r.finished == null ? null : String(r.finished),
  report: r.report ? (JSON.parse(String(r.report)) as Kept) : null,
  error: String(r.error),
});

export function listResearch(db: DatabaseSync, limit = 100) {
  return (
    db
      .prepare(
        `SELECT id, question, level, state, step, started, finished, error,
                json_extract(report, '$.title') AS title, json_extract(report, '$.short') AS short
         FROM research ORDER BY started DESC LIMIT ?`,
      )
      .all(limit) as Record<string, unknown>[]
  ).map((r) => ({ ...row({ ...r, report: null }), title: String(r.title ?? ""), short: String(r.short ?? "") }));
}

export function getResearch(db: DatabaseSync, id: string): ResearchRow | null {
  const r = db.prepare("SELECT * FROM research WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? row(r) : null;
}

export function deleteResearch(db: DatabaseSync, id: string): void {
  const r = getResearch(db, id);
  if (!r) throw new Refused("no such research");
  if (r.state === "running") throw new Refused("it is still running: wait for it to end");
  db.prepare("DELETE FROM research WHERE id = ?").run(id);
}

// kestrel restarted while one ran: it can't finish now, so it says so instead of spinning forever
export function sweepResearch(db: DatabaseSync): void {
  db.prepare(
    "UPDATE research SET state = 'failed', step = '', error = 'kestrel restarted while it ran: ask again' WHERE state = 'running'",
  ).run();
}
