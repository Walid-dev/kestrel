// More apps' pages as Ask reads them: a research report (the question, the report, its numbered sources), a job's
// writing (the job, its latest try and what the check said of it) and the applications (by state, with why each
// stopped). Applications also proposes Retry for one that stopped, as a card I tap.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { AskPage } from "../../ai/ask/prompt.ts";
import { getApplication, listApplications, retryApplication } from "../apply/apply.ts";
import { LessonBody, lessonText } from "../learn/lessons.ts";
import { getLetter, listLetters } from "../letters.ts";
import { Refused } from "../notes/documents.ts";
import { getResearch } from "../research.ts";
import { getListing } from "../search/listings.ts";

const str = (v: unknown) => (typeof v === "string" ? v : "");
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function researchPage(db: DatabaseSync, ref: string): AskPage | null {
  const r = getResearch(db, ref);
  if (!r?.report) return null;
  const rep = r.report;
  const lines = lessonText(LessonBody.parse({ blocks: rep.blocks }));
  return {
    app: "Research",
    what: "a report the computer's model wrote from pages it read on the web, its sources numbered",
    title: rep.title,
    link: `/research?open=${encodeURIComponent(ref)}`,
    context: [
      `MY QUESTION: ${r.question}`,
      `THE REPORT: ${rep.title}`,
      rep.short,
      ...lines.slice(0, 240),
      ...(rep.words.length ? [`WORDS: ${rep.words.map((w) => `${w.w}: ${w.m}`).join("; ")}`] : []),
      ...(rep.unsure.length ? [`WHAT IT WASN'T SURE OF: ${rep.unsure.join("; ")}`] : []),
      "ITS SOURCES:",
      ...rep.refs.map((s) => `[${s.n}] ${s.title} (${s.url})`),
    ].join("\n"),
    // the report's own numbers: a page the conversation finds on the web takes the next one, so [2] stays the report's
    sources: rep.refs.map((s) => ({ n: s.n, title: s.title, url: s.url })),
  };
}

// a job's writing, by the job's listing: the job, then its latest try that finished and what the check said
export function writingPage(db: DatabaseSync, ref: string): AskPage | null {
  const job = getListing(db, ref);
  const tries = listLetters(db, ref);
  if (!job && !tries.length) return null;
  const d = job?.data ?? {};
  const title = str(d.title) || str(tries[0]?.title) || "a job";
  const org = str(d.org) || str(d.company);
  const done = tries.find((t) => t.state === "done");
  const last = done ? (getLetter(db, String(done.id)) as Record<string, unknown> | null) : null;
  const notes = (last?.notes ?? {}) as Record<string, unknown>;
  return {
    app: "Writing",
    what: "the writing lab: a cover letter or a form's answer for a job, written in my voice from my stories and checked as an application checks it",
    title: `${title}${org ? ` at ${org}` : ""}`,
    link: `/writing?job=${encodeURIComponent(ref)}`,
    context: [
      `THE JOB: ${title}${org ? ` at ${org}` : ""}${str(d.location) ? ` · ${str(d.location)}` : ""}`,
      ...(str(d.excerpt) ? [`FROM ITS POSTING: ${cut(str(d.excerpt), 1500)}`] : []),
      "",
      last
        ? `THE LATEST TRY (${str(last.kind) || "letter"}${str(last.ask) ? `: ${str(last.ask)}` : ""}):\n${cut(str(last.text), 8000)}`
        : "NO TRY HAS FINISHED YET.",
      ...(last && notes.check ? [`WHAT THE CHECK SAID: ${cut(JSON.stringify(notes.check), 1500)}`] : []),
      `TRIES SO FAR: ${tries.length}`,
    ].join("\n"),
  };
}

export function applicationsPage(db: DatabaseSync, ref: string): AskPage | null {
  if (ref !== "applications") return null;
  const { byState, counts } = listApplications(db);
  const line = (a: { id: string; title: string; org: string; reason: string; updated: string }) =>
    `- ${a.id}: ${a.title || "a job"}${a.org ? ` at ${a.org}` : ""} (${a.updated.slice(0, 10)})${a.reason ? ` — ${cut(a.reason, 200)}` : ""}`;
  return {
    app: "Applications",
    what: "my job applications by state: queued, applying, waiting for me, sent, and not sent with why",
    title: "Applications",
    link: "/applications",
    context: [
      `COUNTS: ${Object.entries(counts)
        .map(([k, n]) => `${k} ${n}`)
        .join(", ")}`,
      "WAITING FOR ME:",
      ...(byState["needs-me"].length ? byState["needs-me"].slice(0, 15).map(line) : ["none"]),
      "IN FLIGHT:",
      ...([...byState.applying, ...byState.queued].length
        ? [...byState.applying, ...byState.queued].slice(0, 15).map(line)
        : ["none"]),
      "NOT SENT, THE LATEST FIRST:",
      ...(byState["not-sent"].length ? byState["not-sent"].slice(0, 25).map(line) : ["none"]),
      "SENT LATELY:",
      ...(byState.sent.length ? byState.sent.slice(0, 15).map(line) : ["none"]),
    ].join("\n"),
    tools: [
      "WHAT YOU CAN DO HERE",
      "- You can't change anything yourself. To send an application that stopped back to the queue, propose it:",
      "  kestrel shows a card, and I make it with a tap. Write one short line that says what the card does, then:",
      "```action",
      '{"do": "retry", "id": "<its id>"}',
      "```",
      "  Only for one NOT SENT. Its id is the text that starts its line, before the colon: copy it exactly.",
    ].join("\n"),
  };
}

const Retry = z.object({ do: z.literal("retry"), id: z.string().min(1).max(80) });

export function describeRetry(db: DatabaseSync, _ref: string, action: unknown): string | null {
  const a = Retry.safeParse(action);
  if (!a.success) return null;
  const app = getApplication(db, a.data.id);
  if (app?.state !== "not-sent") return null;
  return `Retry “${app.title || app.link}${app.org ? ` at ${app.org}` : ""}”`;
}

export function runRetry(db: DatabaseSync, _settings: unknown, ref: string, action: unknown): string {
  if (!describeRetry(db, ref, action)) throw new Refused("that application can't be retried any more");
  retryApplication(db, Retry.parse(action).id);
  return "Queued again: it starts by itself once nothing else is at work.";
}

export const researchHelper = { page: researchPage };
export const writingHelper = { page: writingPage };
export const applicationsHelper = { page: applicationsPage, act: { describe: describeRetry, run: runRetry } };
