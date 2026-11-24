// The import from the old setup, idempotent: the old database stays the authority for statuses, stars and notes until
// the cutover, so re-running refreshes and never double-lists. It carries the jobs with my own marks (the owner
// column: stars, notes, application attempts), the deals with their hunt, model and price history, and every deep
// check already written. The nightly mirror runs this during the side-by-side weeks; scripts/import-v1.ts is the
// by-hand door.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { outsideOf, type ScoredJob } from "./score.ts";

type OldRow = {
  id: string;
  hunt: string;
  link: string;
  dedupe_key: string;
  status: string;
  found: string;
  data: string;
  owner: string | null;
};
type Landed = { new: number; updated: number; unchanged: number };

export type ImportCounts = {
  source: Record<string, number>; // the old database's job rows by status
  sourceStarred: number;
  sourceScored: number;
  landed: Landed;
  deals: { source: Record<string, number>; landed: Landed };
  applications: { sent: number; notSent: number };
  deepChecks: number;
  kestrel: Record<string, number>; // kestrel's rows by status after (or as-if, on a dry run)
  kestrelStarred: number;
  kestrelScored: number;
};

export type ImportOptions = {
  specsDir?: string; // the old deal specs, whose head names each one's hunt and model
  jobScoring?: (search: string) => unknown; // kestrel's own scoring for a job search: its places rule applies here too
};

const json = (s: string | null | undefined): Record<string, unknown> => {
  try {
    const v = JSON.parse(s ?? "{}");
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};
const text = (v: unknown): string => (typeof v === "string" ? v : "");

// the old deal vocabulary onto the one status set: an outreach is applied, a no is passed, gone is closed
const DEAL_STATUS: Record<string, string> = {
  new: "new",
  interested: "interested",
  maybe: "maybe",
  contacted: "applied",
  not: "passed",
  sold: "closed",
};

type Head = { hunt: string; category: string; min?: number; max?: number; maxAge?: number };
// an old spec's head: `hunt: Office chair`, `category: Aeron`, its price limits and how old an ad may be
function specHeads(dir: string | undefined): Map<string, Head> {
  const out = new Map<string, Head>();
  if (!dir || !existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".md"))) {
    const head = readFileSync(join(dir, f), "utf8").slice(0, 2000);
    const get = (k: string) => head.match(new RegExp(`^${k}:\\s*(.+)$`, "m"))?.[1]?.trim() ?? "";
    const num = (k: string) => (get(k) && Number.isFinite(Number(get(k))) ? Number(get(k)) : undefined);
    if (get("hunt") || get("category"))
      out.set(basename(f, ".md"), {
        hunt: get("hunt"),
        category: get("category"),
        min: num("min_price"),
        max: num("max_price"),
        maxAge: num("max_age_days"),
      });
  }
  return out;
}

function importApplications(db: DatabaseSync, rows: OldRow[], write: boolean): ImportCounts["applications"] {
  const counts = { sent: 0, notSent: 0 };
  const put = db.prepare(
    `INSERT INTO applications (id, listing, link, title, org, state, reason, agent, started, updated)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'the old setup', ?, ?)
     ON CONFLICT (id) DO UPDATE SET state = excluded.state, reason = excluded.reason, updated = excluded.updated`,
  );
  for (const r of rows) {
    const apply = json(r.owner).apply as Record<string, unknown> | undefined;
    const state = text(apply?.state);
    if (!apply || !["sent", "unfinished", "failed", "started"].includes(state)) continue;
    const report = (apply.report ?? {}) as Record<string, unknown>;
    const data = json(r.data);
    const sent = state === "sent";
    sent ? counts.sent++ : counts.notSent++;
    if (!write) continue;
    const reason = sent
      ? ""
      : text(report.blocker) ||
        text(report.outcome) ||
        (state === "started"
          ? "started in the old setup and never finished"
          : "stopped before sending in the old setup");
    const at = text(apply.at) || r.found;
    put.run(
      `v1:${r.id}`,
      r.id,
      r.link,
      text(data.title),
      text(data.company) || text(data.org),
      sent ? "sent" : "not-sent",
      reason.slice(0, 300),
      at,
      text(apply.endedAt) || at,
    );
  }
  return counts;
}

function importDeepChecks(db: DatabaseSync, old: DatabaseSync, write: boolean): number {
  let rows: {
    key: string;
    state: string;
    started: string | null;
    finished: string | null;
    report: string | null;
    error: string | null;
  }[];
  try {
    rows = old.prepare("SELECT key, state, started, finished, report, error FROM deep_checks").all() as typeof rows;
  } catch {
    return 0; // an old database without deep checks has none to carry
  }
  const put = db.prepare(
    `INSERT INTO deep_checks (id, listing, state, step, started, finished, report, error) VALUES (?, ?, ?, '', ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET state = excluded.state, finished = excluded.finished, report = excluded.report,
       error = excluded.error`,
  );
  let n = 0;
  for (const r of rows) {
    const [kind, id] = [r.key.slice(0, r.key.indexOf(":")), r.key.slice(r.key.indexOf(":") + 1)];
    if (!["job", "deal"].includes(kind) || !id) continue;
    n++;
    if (write)
      put.run(
        `v1:${r.key}`,
        id,
        r.state === "done" && r.report ? "done" : "failed",
        r.started ?? new Date().toISOString(),
        r.finished,
        r.report,
        r.error ?? "",
      );
  }
  return n;
}

type OldDeal = {
  id: string;
  spec: string;
  source: string;
  url: string;
  title: string;
  org: string | null;
  price: number | null;
  location: string | null;
  posted: string | null;
  first_seen: string;
  last_seen: string | null;
  score: number | null;
  status: string | null;
  my_note: string | null;
  fit: number | null;
  fit_reason: string | null;
  twin_of: string | null;
};

// The old deals live in items, each tied through its run to the spec that found it. Scores there run 0–10.
function importDeals(db: DatabaseSync, old: DatabaseSync, write: boolean, opts: ImportOptions): ImportCounts["deals"] {
  const counts: ImportCounts["deals"] = { source: {}, landed: { new: 0, updated: 0, unchanged: 0 } };
  let rows: OldDeal[];
  try {
    rows = old
      .prepare(
        `SELECT i.id, r.spec, i.source, i.url, i.title, i.org, i.price, i.location, i.posted, i.first_seen,
                i.last_seen, i.score, i.status, i.my_note, i.fit, i.fit_reason, i.twin_of
         FROM items i JOIN runs r ON r.run_id = i.run_id`,
      )
      .all() as OldDeal[];
  } catch {
    return counts; // an old database without deal tables simply has none to carry
  }
  // each deal's prices over time, a change kept only when the price moved
  const prices = new Map<string, { at: string; price: number }[]>();
  try {
    for (const h of old.prepare("SELECT item_id, seen_at, price FROM history ORDER BY seen_at").all() as {
      item_id: string;
      seen_at: string;
      price: number | null;
    }[]) {
      if (h.price == null) continue;
      const list = prices.get(String(h.item_id)) ?? [];
      if (list.at(-1)?.price !== h.price) list.push({ at: h.seen_at, price: h.price });
      prices.set(String(h.item_id), list);
    }
  } catch {
    // no history table: each deal shows its one price
  }
  const heads = specHeads(opts.specsDir);
  // each search's last good run: an undated ad it no longer found then is no longer listed (the old page's rule)
  const lastOk = new Map<string, string>();
  try {
    for (const r of old
      .prepare("SELECT spec, MAX(started) AS at FROM runs WHERE status = 'ok' GROUP BY spec")
      .all() as {
      spec: string;
      at: string;
    }[])
      lastOk.set(r.spec, r.at);
  } catch {
    // no runs table: no listing is judged gone
  }
  // a spec whose file is gone (an old model no longer hunted) joins the only deal hunt there is, when there is one;
  // its model is its name before the site ("embody-kijiji" → Embody)
  const onlyHunt = new Set([...heads.values()].map((h) => h.hunt).filter(Boolean));
  const orphanHead = (spec: string) => {
    const model = spec.replace(/-[^-]+$/, "");
    return {
      hunt: onlyHunt.size === 1 ? [...onlyHunt][0] : "",
      category: model ? model[0].toUpperCase() + model.slice(1).replaceAll("-", " ") : "",
    };
  };
  const get = db.prepare("SELECT id, status, score, data FROM listings WHERE id = ? OR (search = ? AND link = ?)");
  const insert = db.prepare(
    `INSERT INTO listings (id, search, source, link, dedupe, status, starred, found, updated, score, match, data, kind)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'deals')`,
  );
  const update = db.prepare(
    "UPDATE listings SET status = ?, score = ?, match = ?, data = ?, updated = ?, kind = 'deals' WHERE id = ?",
  );
  for (const r of rows) {
    const status = DEAL_STATUS[r.status ?? "new"] ?? "new";
    counts.source[status] = (counts.source[status] ?? 0) + 1;
    const score = r.score === null ? null : Math.round(r.score * 10); // the old 0–10 onto the 0–100 card
    const match = score === null ? "" : score >= 80 ? "great" : score >= 60 ? "good" : score >= 40 ? "weak" : "poor";
    const known = heads.get(r.spec);
    const head = known ?? orphanHead(r.spec);
    // the old page's hiding rules: a removed search, a price outside the search's limits, an ad older than it allows
    const age = r.posted ? (Date.now() - Date.parse(r.posted)) / 86_400_000 : 0;
    const leftOut = !known
      ? "from a search you removed"
      : r.price != null && ((known.min != null && r.price < known.min) || (known.max != null && r.price > known.max))
        ? "outside your price limits"
        : known.maxAge != null && r.posted && age > known.maxAge
          ? `posted more than ${known.maxAge} days ago`
          : known.maxAge != null &&
              !r.posted &&
              lastOk.has(r.spec) &&
              String(r.last_seen ?? "") < String(lastOk.get(r.spec))
            ? "no longer listed"
            : null;
    const data = JSON.stringify({
      kind: "deals",
      source: r.source,
      title: r.title,
      org: r.org ?? "",
      location: r.location ?? "",
      posted: r.posted ?? "",
      price: r.price,
      prices: prices.get(String(r.id)) ?? [],
      hunt: head?.hunt ?? "",
      category: head?.category ?? "",
      fit: r.fit,
      fitWhy: r.fit_reason ?? "",
      leftOut,
      why: "",
      note: r.my_note ?? "",
      twin: r.twin_of ?? "",
    });
    const updatedAt = r.last_seen ?? r.first_seen;
    const have = get.get(String(r.id), r.spec, r.url) as
      | { id: string; status: string; score: number | null; data: string }
      | undefined;
    if (!have) {
      counts.landed.new++;
      if (write)
        insert.run(String(r.id), r.spec, r.source, r.url, r.url, status, r.first_seen, updatedAt, score, match, data);
      continue;
    }
    if (have.status === status && have.score === score && have.data === data) {
      counts.landed.unchanged++;
      continue;
    }
    counts.landed.updated++; // the old setup stays the authority until the cutover
    if (write) update.run(status, score, match, data, updatedAt, have.id);
  }
  // every search the old runs name is a deal search: a row the old setup has since dropped still reads as a deal
  if (write) {
    const specs = [...new Set(rows.map((r) => r.spec))];
    const mark = db.prepare(
      `UPDATE listings SET kind = 'deals', data = json_set(data, '$.hunt', ?, '$.category', ?)
       WHERE search = ? AND (kind != 'deals' OR COALESCE(json_extract(data, '$.hunt'), '') = '')`,
    );
    for (const s of specs) {
      const head = heads.get(s) ?? orphanHead(s);
      mark.run(head.hunt, head.category, s);
    }
  }
  return counts;
}

export function importV1(db: DatabaseSync, from: string, write: boolean, opts: ImportOptions = {}): ImportCounts {
  const old = new DatabaseSync(from, { readOnly: true });
  // closed however it ends: a failed import is retried each night, and each try would leave one more file open
  try {
    const cols = (old.prepare("PRAGMA table_info(job_listings)").all() as { name: string }[]).map((c) => c.name);
    const rows = old
      .prepare(
        `SELECT id, hunt, link, dedupe_key, status, found, data, ${cols.includes("owner") ? "owner" : "NULL AS owner"} FROM job_listings`,
      )
      .all() as OldRow[];
    const source: Record<string, number> = {};
    let sourceStarred = 0;
    let sourceScored = 0;
    const landed: Landed = { new: 0, updated: 0, unchanged: 0 };
    // a link match stays inside its own search: another hunt's row with the same link is its own (the sweep's finding)
    const get = db.prepare(
      "SELECT id, status, starred, score, match, data FROM listings WHERE id = ? OR (search = ? AND (dedupe = ? OR link = ?))",
    );
    const insert = db.prepare(
      `INSERT INTO listings (id, search, source, link, dedupe, status, starred, found, updated, score, match, data, kind)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'jobs')`,
    );
    const update = db.prepare(
      "UPDATE listings SET status = ?, starred = ?, score = ?, match = ?, data = ?, updated = ? WHERE id = ?",
    );
    const kept: OldRow[] = [];
    for (const r of rows) {
      const data = json(r.data);
      const own = json(r.owner);
      if (own.deleted) continue; // a job I removed in the old setup stays removed
      kept.push(r);
      source[r.status] = (source[r.status] ?? 0) + 1;
      // my star lives in the owner column; an old row may still carry it in its data
      const star = own.star ?? data.star;
      const starred = star === true ? 1 : star === false ? 0 : null;
      if (starred === 1) sourceStarred++;
      const score = typeof data.score === "number" ? Math.round(data.score) : null;
      if (score !== null) sourceScored++;
      // the old setup's "fair" is kestrel's possible tier
      const match = String(data.match ?? "") === "fair" ? "weak" : String(data.match ?? "");
      const updatedAt = String(data.lastSeen ?? r.found);
      // a job open only where I can't work is set aside here too, each night, as kestrel's own finds are
      const outside = data.leftOut ? null : outsideOf(opts.jobScoring?.(r.hunt), data as unknown as ScoredJob);
      const carried = JSON.stringify({
        ...data,
        ...(outside ? { leftOut: outside } : {}),
        kind: "jobs",
        org: text(data.company) || text(data.org),
        why: data.matchWhy ?? "",
        note: text(own.myNote),
        appliedAt: own.appliedAt ?? null,
        followUpAt: own.followUpAt ?? null,
        interviewAt: own.interviewAt ?? null,
      });
      const have = get.get(r.id, r.hunt, r.dedupe_key, r.link) as
        | { id: string; status: string; starred: number | null; score: number | null; match: string; data: string }
        | undefined;
      if (!have) {
        landed.new++;
        if (write)
          insert.run(
            r.id,
            r.hunt,
            String(data.source ?? "unknown"),
            r.link,
            r.dedupe_key,
            r.status,
            starred,
            r.found,
            updatedAt,
            score,
            match,
            carried,
          );
        continue;
      }
      if (
        have.status === r.status &&
        have.starred === starred &&
        have.score === score &&
        have.match === match &&
        have.data === carried
      ) {
        landed.unchanged++;
        continue;
      }
      landed.updated++; // the old setup stays the authority for status, star and note until the cutover
      if (write) update.run(r.status, starred, score, match, carried, updatedAt, have.id);
    }
    const applications = importApplications(db, kept, write);
    const deals = importDeals(db, old, write, opts);
    const deepChecks = importDeepChecks(db, old, write);
    const kestrel: Record<string, number> = {};
    const after = db.prepare("SELECT status, COUNT(*) AS n FROM listings GROUP BY status").all() as {
      status: string;
      n: number;
    }[];
    for (const row of after) kestrel[row.status] = row.n;
    const starredRow = db.prepare("SELECT COUNT(*) AS n FROM listings WHERE starred = 1").get() as { n: number };
    const scoredRow = db.prepare("SELECT COUNT(*) AS n FROM listings WHERE score IS NOT NULL").get() as { n: number };
    return {
      source,
      sourceStarred,
      sourceScored,
      landed,
      deals,
      applications,
      deepChecks,
      kestrel,
      kestrelStarred: starredRow.n,
      kestrelScored: scoredRow.n,
    };
  } finally {
    old.close();
  }
}
