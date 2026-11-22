// Live: what runs now, step by step, and the last day. Running work comes from the activity list (searches, deep
// checks, model asks, the mirror, the nightly copy); applications come from the database (an agent applying, one
// waiting for me, one queued). Every change rings the live stream, so the header's dot and the page keep up.
import type { DatabaseSync } from "node:sqlite";
import type { Hono } from "hono";
import { activity, finished, running } from "../platform/activity.ts";
import { bus } from "./events.ts";

const DAY = 86_400_000;
const boot = new Date().toISOString(); // before this, the history comes from the database's own records

export function mountLive(app: Hono, db: DatabaseSync) {
  const waiting = () =>
    (
      db.prepare("SELECT COUNT(*) AS n FROM applications WHERE state IN ('applying', 'needs-me')").get() as {
        n: number;
      }
    ).n;
  activity.on("change", () => bus.emit("change", { kind: "live", running: running().length + waiting() }));

  app.get("/api/live", (c) => {
    const since = new Date(Date.now() - DAY).toISOString();
    const apps = db
      .prepare(
        `SELECT id, listing, link, title, org, state, reason, agent, started, updated FROM applications
         WHERE state IN ('applying', 'needs-me', 'queued') ORDER BY updated DESC`,
      )
      .all();
    // the day's earlier work, from before this start: search runs and deep checks, as finished cards
    const runs = (
      db
        .prepare(
          "SELECT search, started, ms, found, kept, problem FROM search_runs WHERE started >= ? AND started < ? ORDER BY started DESC",
        )
        .all(since, boot) as {
        search: string;
        started: string;
        ms: number;
        found: number;
        kept: number;
        problem: string;
      }[]
    ).map((r) => ({
      id: `run:${r.search}:${r.started}`,
      kind: r.search === "mirror:v1" ? "mirror" : "search",
      title: r.search === "mirror:v1" ? "The nightly mirror from the old setup" : `Search: ${r.search}`,
      link: "/searches",
      started: r.started,
      ended: new Date(Date.parse(r.started) + r.ms).toISOString(),
      outcome: r.problem ? "failed" : "done",
      note: r.problem,
      steps: [{ at: r.started, text: `${r.found} found, ${r.kept} new` }],
    }));
    const deeps = (
      db
        .prepare(
          `SELECT d.listing, d.state, d.started, d.finished, d.error, json_extract(l.data, '$.title') AS title
           FROM deep_checks d LEFT JOIN listings l ON l.id = d.listing
           WHERE d.started >= ? AND d.started < ? AND d.state != 'running' ORDER BY d.started DESC`,
        )
        .all(since, boot) as {
        listing: string;
        state: string;
        started: string;
        finished: string | null;
        error: string;
        title: string | null;
      }[]
    ).map((d) => ({
      id: `deep:${d.listing}:${d.started}`,
      kind: "deep",
      title: `Deep check: ${d.title ?? "a listing"}`,
      link: `/searches?open=${encodeURIComponent(d.listing)}`,
      started: d.started,
      ended: d.finished,
      outcome: d.state === "done" ? "done" : "failed",
      note: d.error,
      steps: [],
    }));
    const ends = db
      .prepare(
        "SELECT id, listing, title, org, state, reason, updated FROM applications WHERE state IN ('sent', 'not-sent') AND updated >= ? ORDER BY updated DESC LIMIT 30",
      )
      .all(since);
    return c.json({
      at: new Date().toISOString(),
      now: running(),
      apps,
      recent: [...finished(), ...runs, ...deeps].sort((a, b) => String(b.started).localeCompare(String(a.started))),
      ends,
    });
  });
}
