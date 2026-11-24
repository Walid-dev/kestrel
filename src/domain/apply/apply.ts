// The applications: queued → applying → sent, not-sent (its reason, Retry) or needs-me (what it waits for).
// One open application per link — no job ever gets two. The agent's starter (the old setup's runner, one task at a
// time) claims the oldest queued as soon as nothing else is at work, and reports how it ended.
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { Refused } from "../notes/documents.ts";

export type ApplyState = "queued" | "applying" | "needs-me" | "sent" | "not-sent";
const MOVES: Record<ApplyState, ApplyState[]> = {
  queued: ["applying"],
  applying: ["sent", "not-sent", "needs-me"],
  "needs-me": ["applying", "sent", "not-sent"],
  "not-sent": ["queued", "applying"], // Retry, or its chat picked up again (I wrote to it and it went on)
  sent: [],
};

export type Application = {
  id: string;
  listing: string | null;
  link: string;
  title: string;
  org: string;
  state: ApplyState;
  reason: string;
  agent: string;
  started: string;
  updated: string;
};

const row = (r: Record<string, unknown>): Application => ({
  id: String(r.id),
  listing: r.listing === null ? null : String(r.listing),
  link: String(r.link),
  title: String(r.title),
  org: String(r.org),
  state: r.state as ApplyState,
  reason: String(r.reason),
  agent: String(r.agent),
  started: String(r.started),
  updated: String(r.updated),
});

const OPEN: ApplyState[] = ["queued", "applying", "needs-me"];

// one open application per link: another one still open for it (not this one) is refused
function refuseSecond(db: DatabaseSync, link: string, self: string): void {
  const open = db
    .prepare(
      "SELECT id, state FROM applications WHERE link = ? AND id != ? AND state IN ('queued', 'applying', 'needs-me')",
    )
    .get(link, self) as { id: string; state: string } | undefined;
  if (open) throw new Refused(`this job already has an application ${open.state}: no job gets two`);
}

// queue a listing (by id) or a bare link; an application still open for that link is refused
export function queueApplication(db: DatabaseSync, input: { listing?: string; link?: string }): Application {
  let listing: { id: string; link: string; title: string; org: string } | null = null;
  if (input.listing) {
    const r = db.prepare("SELECT id, link, data FROM listings WHERE id = ?").get(input.listing) as
      | { id: string; link: string; data: string }
      | undefined;
    if (!r) throw new Refused("no such listing");
    const data = JSON.parse(r.data) as { title?: string; company?: string; org?: string };
    listing = { id: r.id, link: r.link, title: String(data.title ?? ""), org: String(data.company ?? data.org ?? "") };
  }
  const link = listing?.link ?? input.link ?? "";
  if (!link) throw new Refused("queue takes a listing or a link");
  refuseSecond(db, link, "");
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO applications (id, listing, link, title, org, state, reason, agent, started, updated) VALUES (?, ?, ?, ?, ?, 'queued', '', '', ?, ?)",
  ).run(id, listing?.id ?? null, link, listing?.title ?? "", listing?.org ?? "", now, now);
  return getApplication(db, id) as Application;
}

// the agent takes the oldest queued job; it comes back as applying, with the agent's name on it
export function claimNext(db: DatabaseSync, agent: string): Application | null {
  const next = db.prepare("SELECT id FROM applications WHERE state = 'queued' ORDER BY started LIMIT 1").get() as
    | { id: string }
    | undefined;
  if (!next) return null;
  db.prepare("UPDATE applications SET state = 'applying', agent = ?, updated = ? WHERE id = ?").run(
    agent,
    new Date().toISOString(),
    next.id,
  );
  return getApplication(db, next.id);
}

export function reportApplication(db: DatabaseSync, id: string, state: ApplyState, reason = ""): Application {
  const current = getApplication(db, id);
  if (!current) throw new Refused("no such application");
  if (!MOVES[current.state].includes(state))
    throw new Refused(`an application ${current.state} cannot become ${state}`);
  if ((state === "not-sent" || state === "needs-me") && reason.trim() === "")
    throw new Refused(`${state} always says why`);
  // a stopped one opening again (Retry, or its chat picked up) while I queued the job anew would make two
  if (!OPEN.includes(current.state) && OPEN.includes(state)) refuseSecond(db, current.link, id);
  db.prepare("UPDATE applications SET state = ?, reason = ?, updated = ? WHERE id = ?").run(
    state,
    state === "sent" ? "" : reason.trim(),
    new Date().toISOString(),
    id,
  );
  // a sent application marks its listing applied, so the lists agree without a second hand
  if (state === "sent" && current.listing)
    db.prepare("UPDATE listings SET status = 'applied', updated = ? WHERE id = ?").run(
      new Date().toISOString(),
      current.listing,
    );
  return getApplication(db, id) as Application;
}

export function retryApplication(db: DatabaseSync, id: string): Application {
  return reportApplication(db, id, "queued");
}

export function getApplication(db: DatabaseSync, id: string): Application | null {
  const r = db.prepare("SELECT * FROM applications WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? row(r) : null;
}

export function listApplications(db: DatabaseSync): {
  byState: Record<ApplyState, Application[]>;
  counts: Record<ApplyState, number>;
} {
  const rows = (db.prepare("SELECT * FROM applications ORDER BY updated DESC").all() as Record<string, unknown>[]).map(
    row,
  );
  const byState = { queued: [], applying: [], "needs-me": [], sent: [], "not-sent": [] } as Record<
    ApplyState,
    Application[]
  >;
  for (const r of rows) byState[r.state].push(r);
  const counts = Object.fromEntries(Object.entries(byState).map(([k, v]) => [k, v.length])) as Record<
    ApplyState,
    number
  >;
  return { byState, counts };
}
