// Ask on Searches: what a hunt's page shows the model (the hunt, its counts, its best open listings, each with its id)
// and what the model may do there. Find is a reading action: it looks through every listing of the hunt (words, a
// place, pay, price, a stage, a match) and its lines go back to the model, which answers from them. A stage, a deep
// check and an application are changes: the model proposes each as a card, and only my tap runs it, through the same
// functions as the page's own buttons.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { AskPage } from "../../ai/ask/prompt.ts";
import type { Settings } from "../../platform/config.ts";
import { queueApplication } from "../apply/apply.ts";
import { Refused } from "../notes/documents.ts";
import { startDeepCheck } from "./deep.ts";
import {
  getListing,
  type ListingRow,
  listHunts,
  listingCounts,
  listListings,
  setListingStatus,
  statusWord,
} from "./listings.ts";
import { loadSpecs } from "./specs.ts";

const STATUSES = [
  "new",
  "interested",
  "maybe",
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "passed",
  "fake",
  "closed",
] as const;
type Kind = "jobs" | "deals";

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const short = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));

// a job's pay as the card says it, and its top in a year (an hourly wage is a year of hours), for "at least"
function pay(d: Record<string, unknown>): { words: string; top: number | null } {
  const min = num(d.salaryMin);
  const max = num(d.salaryMax);
  if (min === null && max === null) return { words: "pay not stated", top: null };
  const period = str(d.salaryPeriod).toLowerCase();
  const year = period.includes("hour")
    ? 2080
    : period.includes("day")
      ? 260
      : period.includes("week")
        ? 52
        : period.includes("month")
          ? 12
          : 1;
  const range =
    min !== null && max !== null && min !== max ? `${short(min)}–${short(max)}` : short((max ?? min) as number);
  const cur = str(d.salaryCurrency);
  return { words: `${range}${cur ? ` ${cur}` : ""}${period ? `/${period}` : ""}`, top: (max ?? min ?? 0) * year };
}

const named = (l: ListingRow) =>
  `${str(l.data.title) || "a listing"}${str(l.data.org) || str(l.data.company) ? ` at ${str(l.data.org) || str(l.data.company)}` : ""}`;

// one listing as the model reads it: its id first, so a link or a change can name it exactly
export function listingLine(l: ListingRow): string {
  const d = l.data;
  const place = [str(d.location), str(d.workMode)].filter(Boolean).join(", ") || "place not stated";
  const money = l.kind === "deals" ? (num(d.price) !== null ? `$${num(d.price)}` : "no price") : pay(d).words;
  const left = str(d.leftOut) ? ` · set aside: ${str(d.leftOut)}` : "";
  return `- ${l.id}: ${named(l)} · ${place} · ${money} · ${l.match || "unscored"} ${l.score ?? ""} · ${statusWord(l.status, l.kind)}${l.starred === 1 ? " · starred" : ""}${left}`;
}

// what the model may do on a hunt's page, in its words
function tools(kind: Kind): string {
  return [
    "WHAT YOU CAN DO HERE",
    "- When the answer needs listings the page doesn't show (it shows only the best open ones), write one find block",
    "  and stop; the matches come back to you, then you answer from them. A question about the work itself, or one the",
    "  page answers, needs no block:",
    "```find",
    kind === "jobs"
      ? '{"words": "react", "remote": true, "payAtLeast": 150000, "stage": "all", "limit": 20}'
      : '{"words": "remastered", "priceAtMost": 600, "stage": "all", "limit": 20}',
    "```",
    "  Every field is optional. words: all of them must appear. remote: true for remote ones. payAtLeast: a job's top",
    "  pay in a year. priceAtMost: a deal's price. stage: review, possible, priority, leftout (set aside), all, or a",
    "  status (interested, maybe, applied, passed…). match: a list of great, good, weak, poor.",
    "- You can't change anything yourself. To change something, propose it: kestrel shows a card, and I make it with a",
    '  tap. Write one short line that says what the card does ("Tap to mark it as not for me."), then one block per',
    "  change. Never say a change is made or that you will make it, and never explain the block:",
    "```action",
    '{"do": "stage", "listing": "<its id>", "to": "passed"}',
    "```",
    `  do: "stage" (to: ${STATUSES.join(", ")}), "deep" (a deeper look by the model)${kind === "jobs" ? ', "apply" (queue an application)' : ""}.`,
    "- Each time you name a listing, link it: [its title](listing:<its id>). Its id is the text that starts its line,",
    "  before the colon: copy it exactly, in links and blocks alike, and never make one up.",
  ].join("\n");
}

const refOf = (ref: string): { kind: Kind; key: string } | null => {
  const at = ref.indexOf(":");
  const kind = ref.slice(0, at);
  const key = ref.slice(at + 1);
  return at > 0 && key && (kind === "jobs" || kind === "deals") ? { kind, key } : null;
};

// the page, from made-up rows or the database's: the hunt, what it holds by stage, and its best open listings
export function searchAskPage(
  hunt: { kind: Kind; key: string; name: string; count: number },
  stages: Record<string, number>,
  inView: ListingRow[],
): AskPage {
  const counts = ["priority", "review", "possible", "interested", "maybe", "applied", "leftout"]
    .filter((s) => stages[s])
    .map((s) => `${s === "leftout" ? "set aside" : s} ${stages[s]}`)
    .join(", ");
  return {
    app: "Searches",
    what: `a ${hunt.kind === "jobs" ? "job" : "deal"} hunt's listings, scored by its rules, that I review, mark and act on`,
    title: hunt.name,
    link: "/searches",
    context: [
      `THE HUNT: ${hunt.name} (${hunt.kind === "jobs" ? "jobs" : "deals"}), ${hunt.count} listings in all${counts ? `: ${counts}` : ""}.`,
      `IN VIEW, THE BEST OPEN ONES FIRST (${inView.length}):`,
      ...inView.map(listingLine),
    ].join("\n"),
    tools: tools(hunt.kind),
  };
}

export function searchPage(db: DatabaseSync, ref: string): AskPage | null {
  const r = refOf(ref);
  if (!r) return null;
  const hunt = listHunts(db).find((h) => h.kind === r.kind && h.key === r.key);
  if (!hunt) return null;
  const spec = loadSpecs().specs.find((s) => s.id === r.key || s.hunt === r.key);
  const filters = { kind: r.kind, hunt: r.key };
  return searchAskPage(
    { kind: r.kind, key: r.key, name: spec?.hunt || spec?.name || r.key, count: hunt.count },
    listingCounts(db, filters).stages,
    listListings(db, { ...filters, stage: "review", sort: "best" }, 40),
  );
}

const Find = z.object({
  words: z.string().max(200).catch(""),
  remote: z.boolean().optional().catch(undefined),
  payAtLeast: z.number().optional().catch(undefined),
  priceAtMost: z.number().optional().catch(undefined),
  stage: z.string().max(40).optional().catch(undefined),
  match: z.array(z.string()).optional().catch(undefined),
  limit: z.number().int().min(1).max(40).catch(25),
});

// find: the hunt's listings that match, best first, as lines for the model
export function findListings(db: DatabaseSync, ref: string, query: unknown): string {
  const r = refOf(ref);
  if (!r) return "This page has no hunt to look through.";
  const q = Find.parse(typeof query === "object" && query ? query : {});
  const words = q.words.toLowerCase().split(/\s+/).filter(Boolean);
  const rows = listListings(db, { kind: r.kind, hunt: r.key, stage: q.stage || "all", sort: "best" }, 5000).filter(
    (l) => {
      const d = l.data;
      const hay =
        `${str(d.title)} ${str(d.org)} ${str(d.company)} ${str(d.location)} ${str(d.workMode)} ${str(d.excerpt)}`.toLowerCase();
      if (words.some((w) => !hay.includes(w))) return false;
      if (q.remote && !`${str(d.location)} ${str(d.workMode)}`.toLowerCase().includes("remote")) return false;
      if (q.payAtLeast !== undefined && (pay(d).top ?? 0) < q.payAtLeast) return false;
      if (q.priceAtMost !== undefined && (num(d.price) ?? Number.POSITIVE_INFINITY) > q.priceAtMost) return false;
      if (q.match?.length && !q.match.includes(l.match)) return false;
      return true;
    },
  );
  if (!rows.length) return "No listing matches.";
  const shown = rows.slice(0, q.limit);
  return [
    `${rows.length} match${rows.length === 1 ? "" : "es"}${rows.length > shown.length ? `, the best ${shown.length}` : ""}:`,
    ...shown.map(listingLine),
  ].join("\n");
}

const Action = z.discriminatedUnion("do", [
  z.object({ do: z.literal("stage"), listing: z.string().min(1).max(80), to: z.enum(STATUSES) }),
  z.object({ do: z.literal("deep"), listing: z.string().min(1).max(80) }),
  z.object({ do: z.literal("apply"), listing: z.string().min(1).max(80) }),
]);

// a change, as its card says it; null when it isn't one this page can make (no such listing, another hunt's, a deal
// to apply to)
export function describeAction(db: DatabaseSync, ref: string, action: unknown): string | null {
  const a = Action.safeParse(action);
  const r = refOf(ref);
  if (!a.success || !r) return null;
  const l = getListing(db, a.data.listing);
  if (!l || l.kind !== r.kind) return null;
  const what = `“${named(l)}”`;
  if (a.data.do === "stage") return `Mark ${what} as ${statusWord(a.data.to, l.kind)}`;
  if (a.data.do === "deep") return `Run a deep check on ${what}`;
  return l.kind === "jobs" ? `Apply to ${what}` : null;
}

// my tap: the change runs, through the page's own functions; the answer is what happened, in words
export function runAction(db: DatabaseSync, settings: Settings, ref: string, action: unknown): string {
  if (!describeAction(db, ref, action)) throw new Refused("that change can't be made here any more");
  const a = Action.parse(action);
  if (a.do === "stage") {
    setListingStatus(db, a.listing, a.to);
    return `Marked ${statusWord(a.to, getListing(db, a.listing)?.kind ?? "jobs")}.`;
  }
  if (a.do === "deep") {
    startDeepCheck(db, settings, a.listing);
    return "The deep check started: its report lands on the listing.";
  }
  queueApplication(db, { listing: a.listing });
  return "Queued: it starts by itself once nothing else is at work.";
}

// the answer's words as kept: a link to a listing that isn't there becomes its plain words, never a dead link
export function tidyAnswer(db: DatabaseSync, _ref: string, words: string): string {
  return words.replace(/\[([^\]\n]+)\]\(listing:([^)\s]+)\)/g, (link: string, text: string, id: string) =>
    getListing(db, id) ? link : text,
  );
}

export const searchesHelper = {
  page: searchPage,
  find: findListings,
  act: { describe: describeAction, run: runAction },
  tidy: tidyAnswer,
};
