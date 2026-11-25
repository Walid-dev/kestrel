// Ask on Searches: what a hunt's page shows the model (the hunt, its counts, its best open listings, each with its id)
// and what the model may do there. Find is a reading action: it looks through every listing of the hunt (words, a
// place, pay, price, a stage, a match) and its lines go back to the model, which answers from them. A stage, a delete,
// a deep check and an application are changes: the model proposes each as a card, and only my tap runs it, through the
// same functions as the page's own buttons. A change to many listings at once is one rule (find's fields), never ids
// the model typed: kestrel resolves it when the card is proposed and keeps the exact listings, so my tap changes those
// and no other; a stage or a delete can be undone from its card.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { AskPage } from "../../ai/ask/prompt.ts";
import type { Settings } from "../../platform/config.ts";
import { queueApplication } from "../apply/apply.ts";
import type { Card, Proposal } from "../ask/ask.ts";
import { Refused } from "../notes/documents.ts";
import { startDeepCheck } from "./deep.ts";
import {
  deleteListings,
  getListing,
  type ListingRow,
  listHunts,
  listingCounts,
  listListings,
  putStageBack,
  restoreListings,
  setListingStatus,
  statusWord,
  within,
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

// a job's pay as the card says it, and its top in a year (an hourly wage is a year of hours), for a pay filter
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
const noun = (kind: Kind, n: number) => (kind === "jobs" ? (n === 1 ? "job" : "jobs") : n === 1 ? "deal" : "deals");

// one listing as the model reads it: its id first, so a link or a change can name it exactly
export function listingLine(l: ListingRow): string {
  const d = l.data;
  const place = [str(d.location), str(d.workMode)].filter(Boolean).join(", ") || "place not stated";
  const money = l.kind === "deals" ? (num(d.price) !== null ? `$${num(d.price)}` : "no price") : pay(d).words;
  const left = str(d.leftOut) ? ` · set aside: ${str(d.leftOut)}` : "";
  return `- ${l.id}: ${named(l)} · ${place} · ${money} · ${l.match || "unscored"} ${l.score ?? ""} · ${l.status === "new" ? "to review" : statusWord(l.status, l.kind)}${l.starred === 1 ? " · starred" : ""}${left}`;
}

// what the model may do on a hunt's page, in its words
function tools(kind: Kind): string {
  const jobs = kind === "jobs";
  return [
    "WHAT YOU CAN DO HERE",
    "- When the answer needs listings the page doesn't show (it shows only the best open ones), write one find block",
    "  and stop; the matches come back to you, then you answer from them. A question about the work itself, or one the",
    "  page answers, needs no block:",
    "```find",
    jobs
      ? '{"words": "react", "remote": true, "payAtLeast": 150000, "stage": "all", "limit": 20}'
      : '{"words": "remastered", "priceAtMost": 600, "stage": "all", "limit": 20}',
    "```",
    "  Every field is optional. words: all of them must appear. remote: true for remote ones, false for the others.",
    "  payAtLeast, payBelow: a job's top pay in a year (an hourly wage counts as a year of hours); a job with no stated",
    "  pay never matches either. priceAtMost, priceAtLeast: a deal's price. stage: review, possible, priority, leftout",
    "  (set aside), all (every one but the set-aside), or a status (interested, maybe, applied, passed…). match: a list",
    "  of great, good, weak, poor.",
    "- You can't change anything yourself. To change something, propose it: kestrel shows a card, and I make it with a",
    '  tap. Write one short line that says what the card does ("Tap to mark it as not for me."), then the block. Never',
    "  say a change is made or that you will make it, never say how many it covers (the card counts them), and never",
    "  explain the block.",
    "  For one listing, one block per change:",
    "```action",
    '{"do": "stage", "listing": "<its id>", "to": "passed"}',
    "```",
    `  do: "stage" (to: ${STATUSES.join(", ")}), "delete" (gone from every view; I can undo it), "deep" (a deeper look by the model)${jobs ? ', "apply" (queue an application)' : ""}.`,
    `- For many listings at once ("${jobs ? "delete all postings under 130k" : "delete the deals over $600"}", "mark every … as …"): ONE rule block, with`,
    "  no find first and never a list of ids. kestrel finds what the rule covers, shows how many, and leaves out the ones",
    "  I starred, applied to or that the rules set aside:",
    "```action",
    jobs ? '{"do": "delete", "where": {"payBelow": 130000}}' : '{"do": "delete", "where": {"priceAtLeast": 600}}',
    "```",
    "```action",
    jobs
      ? '{"do": "stage", "to": "passed", "where": {"remote": true, "payBelow": 100000}}'
      : '{"do": "stage", "to": "passed", "where": {"words": "broken"}}',
    "```",
    "  where takes find's fields with the same meanings, and no limit: a listing it covers matches all of them.",
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

// ---- what find and a rule read: one meaning for each field ----

type Look = {
  words?: string;
  remote?: boolean;
  payAtLeast?: number;
  payBelow?: number;
  priceAtMost?: number;
  priceAtLeast?: number;
  match?: string[];
};
// the money a look reads: a job's top pay in a year, a deal's price; null when the listing states none
const moneyOf = (l: ListingRow): number | null => (l.kind === "jobs" ? pay(l.data).top : num(l.data.price));
const asksMoney = (q: Look) =>
  q.payAtLeast !== undefined || q.payBelow !== undefined || q.priceAtMost !== undefined || q.priceAtLeast !== undefined;
// the fields but money: every word in its words, remote or not, one of its matches
function fits(l: ListingRow, q: Look): boolean {
  const d = l.data;
  const hay =
    `${str(d.title)} ${str(d.org)} ${str(d.company)} ${str(d.location)} ${str(d.workMode)} ${str(d.excerpt)}`.toLowerCase();
  const words = (q.words ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (words.some((w) => !hay.includes(w))) return false;
  if (q.remote !== undefined && `${str(d.location)} ${str(d.workMode)}`.toLowerCase().includes("remote") !== q.remote)
    return false;
  return !q.match?.length || q.match.includes(l.match);
}
// the money fields, for a listing that states its money: pay from payAtLeast up to under payBelow, a price between
// priceAtLeast and priceAtMost
const moneyFits = (m: number, q: Look) =>
  (q.payAtLeast === undefined || m >= q.payAtLeast) &&
  (q.payBelow === undefined || m < q.payBelow) &&
  (q.priceAtMost === undefined || m <= q.priceAtMost) &&
  (q.priceAtLeast === undefined || m >= q.priceAtLeast);

const Find = z.object({
  words: z.string().max(200).catch(""),
  remote: z.boolean().optional().catch(undefined),
  payAtLeast: z.number().optional().catch(undefined),
  payBelow: z.number().optional().catch(undefined),
  priceAtMost: z.number().optional().catch(undefined),
  priceAtLeast: z.number().optional().catch(undefined),
  stage: z.string().max(40).optional().catch(undefined),
  match: z.array(z.string()).optional().catch(undefined),
  limit: z.number().int().min(1).max(40).catch(25),
});

// find: the hunt's listings that match, best first, as lines for the model
export function findListings(db: DatabaseSync, ref: string, query: unknown): string {
  const r = refOf(ref);
  if (!r) return "This page has no hunt to look through.";
  const read = Find.safeParse(typeof query === "object" && query ? query : {});
  if (!read.success) return "That look wasn't readable: write it as one JSON object.";
  const q = read.data;
  const stage = q.stage || "all";
  const rows = listListings(db, { kind: r.kind, hunt: r.key, stage, sort: "best" }, 5000).filter((l) => {
    // the page's All holds the set-aside ones too; a find asks for them on purpose (leftout), never by default
    if (stage === "all" && l.leftOut) return false;
    if (!fits(l, q)) return false;
    if (!asksMoney(q)) return true;
    const m = moneyOf(l);
    return m !== null && moneyFits(m, q);
  });
  if (!rows.length) return "No listing matches.";
  const shown = rows.slice(0, q.limit);
  return [
    `${rows.length} match${rows.length === 1 ? "" : "es"}${rows.length > shown.length ? `, the best ${shown.length}` : ""}:`,
    ...shown.map(listingLine),
  ].join("\n");
}

// ---- a change to many: one rule, resolved by kestrel ----

export const CAP = 500; // the listings one card covers at most; it says so when its rule finds more
const MATCHES = ["great", "good", "weak", "poor"] as const;
// read strictly, unlike find: a field kestrel doesn't know, or a value it can't read, would widen a change, so the
// card says it can't read the rule instead
const Where = z.strictObject({
  words: z.string().trim().min(1).max(200).optional(),
  remote: z.boolean().optional(),
  payAtLeast: z.number().positive().optional(),
  payBelow: z.number().positive().optional(),
  priceAtMost: z.number().nonnegative().optional(),
  priceAtLeast: z.number().nonnegative().optional(),
  stage: z.enum(["review", "possible", "priority", "leftout", "all", ...STATUSES]).optional(),
  match: z.array(z.enum(MATCHES)).min(1).optional(),
});
type Where = z.infer<typeof Where>;
const Many = z.discriminatedUnion("do", [
  z.object({ do: z.literal("stage"), to: z.enum(STATUSES), where: Where }),
  z.object({ do: z.literal("delete"), where: Where }),
]);
type Many = z.infer<typeof Many>;
// the stages of an application: a rule leaves those listings out unless its stage names one
const APPLIED = new Set(["applied", "interviewing", "offer"]);

// a listing as a card's tap finds it: changed since (a stage, a star, a mark of mine), it is left as it is
const stateOf = (l: ListingRow) => `${l.status}|${l.starred ?? ""}|${JSON.stringify(l.mine)}`;

export type Resolved = {
  covered: ListingRow[]; // what the card covers, the best first, CAP at most
  total: number; // what the rule covers before the cap
  left: { noMoney: number; setAside: number; applied: number; starred: number; already: number };
};

// what a rule covers on a hunt, and what it leaves out and why. Each listing counts once, under the first reason that
// holds: no stated money (when the rule asks about money; not counted among the set-aside), set aside by the rules
// (unless the rule's stage is leftout), already at the stage it would set, an application of mine (applied or later,
// or one queued, at work or sent: unless the rule's stage names applied, interviewing or offer), starred (unless the
// rule's stage is priority)
export function resolveRule(db: DatabaseSync, hunt: { kind: Kind; key: string }, where: Where, to: string | null) {
  const stage = where.stage ?? "all";
  const rows = listListings(db, { kind: hunt.kind, hunt: hunt.key, stage, sort: "best" }, 100_000);
  const mine = new Set(
    (
      db
        .prepare("SELECT listing, link FROM applications WHERE state IN ('queued', 'applying', 'needs-me', 'sent')")
        .all() as { listing: string | null; link: string }[]
    ).flatMap((a) => [a.listing ?? "", a.link]),
  );
  const left: Resolved["left"] = { noMoney: 0, setAside: 0, applied: 0, starred: 0, already: 0 };
  const covered: ListingRow[] = [];
  for (const l of rows) {
    if (!fits(l, where)) continue;
    const aside = stage === "all" && l.leftOut !== null;
    if (asksMoney(where)) {
      const m = moneyOf(l);
      if (m === null) {
        if (!aside) left.noMoney++;
        continue;
      }
      if (!moneyFits(m, where)) continue;
    }
    if (aside) left.setAside++;
    else if (to !== null && l.status === to) left.already++;
    else if (!APPLIED.has(stage) && (APPLIED.has(l.status) || mine.has(l.id) || mine.has(l.link))) left.applied++;
    else if (l.starred === 1 && stage !== "priority") left.starred++;
    else covered.push(l);
  }
  return { covered: covered.slice(0, CAP), total: covered.length, left } satisfies Resolved;
}

// money as a card says it: a job's pay in thousands ($130k), a deal's price in dollars ($1,250)
const dollars = (kind: Kind, n: number) =>
  kind === "jobs" && n >= 1000 ? `$${Number((n / 1000).toFixed(1))}k` : `$${n.toLocaleString("en-US")}`;
const MATCH_WORD: Record<string, string> = { great: "great", good: "good", weak: "possible", poor: "weak" };

// the rule in words, after its count: "remote jobs whose top pay is under $130k a year"
function ruleWords(kind: Kind, w: Where, n: number): string {
  const say = (v: number) => dollars(kind, v);
  const parts = [`${w.remote === true ? "remote " : ""}${noun(kind, n)}`];
  if (w.remote === false) parts.push(n === 1 ? "that isn't remote" : "that aren't remote");
  if (w.words) parts.push(`mentioning “${w.words}”`);
  const stage = w.stage ?? "all";
  if (stage === "review") parts.push("to review");
  else if (stage === "possible") parts.push("among the possible ones");
  else if (stage === "priority") parts.push("in Priority");
  else if (stage === "leftout") parts.push("set aside by the rules");
  else if (stage === "new") parts.push("not marked yet");
  else if (stage !== "all") parts.push(`marked ${statusWord(stage, kind)}`);
  if (w.match) parts.push(`with a ${w.match.map((m) => MATCH_WORD[m]).join(" or ")} match`);
  const { payAtLeast: lo, payBelow: hi, priceAtLeast: from, priceAtMost: to } = w;
  if (lo !== undefined && hi !== undefined) parts.push(`whose top pay is between ${say(lo)} and ${say(hi)} a year`);
  else if (hi !== undefined) parts.push(`whose top pay is under ${say(hi)} a year`);
  else if (lo !== undefined) parts.push(`whose top pay is ${say(lo)} a year or more`);
  if (from !== undefined && to !== undefined) parts.push(`priced ${say(from)} to ${say(to)}`);
  else if (from !== undefined) parts.push(`priced ${say(from)} or more`);
  else if (to !== undefined) parts.push(`priced ${say(to)} or less`);
  return parts.join(" ");
}

const changeWords = (kind: Kind, a: Many, n: number | null) => {
  const what = n === null ? ruleWords(kind, a.where, 2) : `${n} ${ruleWords(kind, a.where, n)}`;
  return a.do === "delete" ? `Delete ${what}` : `Mark ${what} as ${statusWord(a.to, kind)}`;
};

// what a card leaves out, and the cap when its rule finds more
function leftWords(kind: Kind, to: string | null, r: Resolved): string {
  const { noMoney, setAside, applied, starred, already } = r.left;
  const out = [
    already && to ? `${already} already ${statusWord(to, kind)}` : "",
    noMoney
      ? `${noMoney} ${kind === "jobs" ? "state" : "show"}${noMoney === 1 ? "s" : ""} no ${kind === "jobs" ? "pay" : "price"}`
      : "",
    setAside ? `${setAside} set aside by the rules` : "",
    applied ? `${applied} ${kind === "jobs" ? "applied to or in the queue" : "contacted"}` : "",
    starred ? `${starred} starred` : "",
  ].filter(Boolean);
  return [
    out.length ? `${out.join(" · ")}: not included.` : "",
    r.total > CAP ? `The rule finds ${r.total}: this card covers the best ${CAP}. Ask again for the rest.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

// why a rule can't be read, for its card
function unreadable(e: z.ZodError): string {
  const i = e.issues[0];
  if (i?.code === "unrecognized_keys") return `kestrel can't read its rule: it doesn't know ${i.keys.join(", ")}`;
  const field = (i?.path ?? []).filter((p) => p !== "where").join(".");
  return `kestrel can't read its rule${field ? `: ${field} isn't what it reads there` : ""}`;
}

// a change to many, as its card: the rule resolved now, its listings kept (each with its state, so a tap skips one
// that changed since), what it leaves out; a rule that covers none, or can't be read, says so
function proposeRule(db: DatabaseSync, hunt: { kind: Kind; key: string }, action: object): Proposal {
  const a = Many.safeParse(action);
  if (!a.success) {
    const verb = (action as { do?: unknown }).do === "stage" ? "Change the stage of" : "Delete";
    return { label: `${verb} ${noun(hunt.kind, 2)} by a rule`, failed: `${unreadable(a.error)}. Ask again.` };
  }
  const to = a.data.do === "stage" ? a.data.to : null;
  const r = resolveRule(db, hunt, a.data.where, to);
  const detail = leftWords(hunt.kind, to, r);
  if (!r.covered.length)
    return { label: changeWords(hunt.kind, a.data, null), failed: "Nothing to change.", ...(detail ? { detail } : {}) };
  return {
    label: changeWords(hunt.kind, a.data, r.covered.length),
    ...(detail ? { detail } : {}),
    items: r.covered.map((l) => ({ id: l.id, title: named(l).slice(0, 160), was: stateOf(l) })),
  };
}

const Id = z.string().min(1).max(80);
const One = z.discriminatedUnion("do", [
  z.object({ do: z.literal("stage"), listing: Id, to: z.enum(STATUSES) }),
  z.object({ do: z.literal("delete"), listing: Id }),
  z.object({ do: z.literal("deep"), listing: Id }),
  z.object({ do: z.literal("apply"), listing: Id }),
]);
const isRule = (action: unknown): action is object =>
  typeof action === "object" && action !== null && "where" in action;

// a change, as its card says it; null when it isn't one this page can make (no such listing, another hunt's, a deal
// to apply to). A rule is resolved here, when the card is proposed
export function describeAction(db: DatabaseSync, ref: string, action: unknown): string | Proposal | null {
  const r = refOf(ref);
  if (!r) return null;
  if (isRule(action)) return proposeRule(db, r, action);
  const a = One.safeParse(action);
  if (!a.success) return null;
  const l = getListing(db, a.data.listing);
  if (!l || l.kind !== r.kind) return null;
  const what = `“${named(l)}”`;
  if (a.data.do === "stage") return `Mark ${what} as ${statusWord(a.data.to, l.kind)}`;
  if (a.data.do === "delete") return `Delete ${what}`;
  if (a.data.do === "deep") return `Run a deep check on ${what}`;
  return l.kind === "jobs" ? `Apply to ${what}` : null;
}

// what Undo needs: the listings deleted, or each one's stage and mark before
const Undo = z.union([
  z.object({ deleted: z.array(z.string()) }),
  z.object({
    staged: z.array(z.object({ id: z.string(), status: z.string(), mark: z.string().nullable() })),
    to: z.string(),
  }),
]);
type Undo = z.infer<typeof Undo>;

// my tap on a rule's card: exactly the listings it covered when proposed, skipping one that changed since; all of it
// or none
function runRule(db: DatabaseSync, kind: Kind, action: object, card?: Card): { result: string; undo: Undo } {
  const a = Many.safeParse(action);
  const items = card?.items ?? [];
  if (!a.success || !items.length) throw new Refused("that change can't be made here any more");
  return within(db, () => {
    const now: ListingRow[] = [];
    for (const it of items) {
      const l = getListing(db, it.id);
      if (l && stateOf(l) === it.was) now.push(l);
    }
    const since = items.length - now.length;
    if (!now.length) throw new Refused("each one changed since it was proposed: ask again");
    const after = since ? ` ${since} changed since: left as ${since === 1 ? "it is" : "they are"}.` : "";
    if (a.data.do === "delete") {
      const gone = deleteListings(
        db,
        now.map((l) => l.id),
        "me",
      );
      return { result: `Deleted ${gone.length} ${noun(kind, gone.length)}.${after}`, undo: { deleted: gone } };
    }
    const to = a.data.to;
    const staged = now.map((l) => ({ id: l.id, status: l.status, mark: l.mine.status ?? null }));
    for (const l of now) setListingStatus(db, l.id, to);
    return {
      result: `Marked ${now.length} ${noun(kind, now.length)} as ${statusWord(to, kind)}.${after}`,
      undo: { staged, to },
    };
  });
}

// my tap: the change runs, through the page's own functions; the answer is what happened, in words, and for a stage
// or a delete what Undo needs
export function runAction(
  db: DatabaseSync,
  settings: Settings,
  ref: string,
  action: unknown,
  card?: Card,
): string | { result: string; undo?: Undo } {
  const r = refOf(ref);
  if (r && isRule(action)) return runRule(db, r.kind, action, card);
  const a = One.safeParse(action);
  const l = a.success ? getListing(db, a.data.listing) : null;
  if (!a.success || !l || !describeAction(db, ref, action))
    throw new Refused("that change can't be made here any more");
  if (a.data.do === "stage") {
    const back = { id: l.id, status: l.status, mark: l.mine.status ?? null };
    setListingStatus(db, l.id, a.data.to);
    return { result: `Marked ${statusWord(a.data.to, l.kind)}.`, undo: { staged: [back], to: a.data.to } };
  }
  if (a.data.do === "delete") {
    deleteListings(db, [l.id], "me");
    return { result: "Deleted.", undo: { deleted: [l.id] } };
  }
  if (a.data.do === "deep") {
    startDeepCheck(db, settings, l.id);
    return "The deep check started: its report lands on the listing.";
  }
  queueApplication(db, { listing: l.id });
  return "Queued: it starts by itself once nothing else is at work.";
}

// Undo: each listing deleted comes back as it was; each stage goes back, with its mark, unless it moved since
export function undoAction(db: DatabaseSync, _ref: string, card: Card): string {
  const u = Undo.safeParse(card.undo);
  if (!u.success) throw new Refused("that change can't be undone");
  const undo = u.data;
  return within(db, () => {
    if ("deleted" in undo) {
      // one restored since from its sheet is back already; one whose place a listing took stays out
      const { stayed } = restoreListings(db, undo.deleted);
      const out = stayed.filter((id) => !getListing(db, id)).length;
      const back = undo.deleted.length - out;
      if (undo.deleted.length === 1) return back ? "Undone: it's back." : "It couldn't come back.";
      return `Undone: ${back} back.${out ? ` ${out} couldn't come back.` : ""}`;
    }
    let back = 0;
    for (const s of undo.staged) if (putStageBack(db, s.id, undo.to, s)) back++;
    const moved = undo.staged.length - back;
    if (undo.staged.length === 1) return back ? "Undone: back to its stage." : "It moved since: left as it is.";
    return `Undone: ${back} back to ${back === 1 ? "its" : "their"} stage.${moved ? ` ${moved} moved since: left as ${moved === 1 ? "it is" : "they are"}.` : ""}`;
  });
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
  act: { describe: describeAction, run: runAction, undo: undoAction },
  tidy: tidyAnswer,
};
