// Live: what runs now, step by step, and the Activity log. Running work comes from the activity list (searches, deep
// checks, model asks, the mirror, the nightly copy); applications in flight come from the database. Every piece of
// work that ends, and every mark I make (a lesson graded, a task done, a stage set, an application sent), lands in
// the activity table with where to open it. Every change rings the live stream.
import type { DatabaseSync } from "node:sqlite";
import type { Hono } from "hono";
import { type Activity, activity, running } from "../platform/activity.ts";
import { bus } from "./events.ts";

const DAY = 86_400_000;

export function mountLive(app: Hono, db: DatabaseSync) {
  const waiting = () =>
    (
      db.prepare("SELECT COUNT(*) AS n FROM applications WHERE state IN ('applying', 'needs-me')").get() as {
        n: number;
      }
    ).n;
  const keep = db.prepare(
    `INSERT OR IGNORE INTO activity (id, kind, title, link, started, ended, outcome, note, steps)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  activity.on("ended", (a: Activity) => {
    try {
      keep.run(
        a.id,
        a.kind,
        a.title,
        a.link,
        a.started,
        a.ended ?? a.started,
        a.outcome ?? "done",
        a.note,
        JSON.stringify(a.steps),
      );
    } catch {
      // the log is a convenience: a failed write never stops the work it describes
    }
  });
  activity.on("change", () => bus.emit("change", { kind: "live", running: running().length + waiting() }));

  const log = (days: number, kind?: string) => {
    const since = new Date(Date.now() - days * DAY).toISOString();
    const rows = (
      db
        .prepare(
          `SELECT id, kind, title, link, started, ended, outcome, note, steps FROM activity
           WHERE ended >= ? ${kind ? "AND kind = ?" : ""} ORDER BY ended DESC LIMIT 400`,
        )
        .all(...[since, ...(kind ? [kind] : [])]) as Record<string, unknown>[]
    ).map((r) => ({
      id: String(r.id),
      kind: String(r.kind),
      title: String(r.title),
      link: String(r.link),
      started: String(r.started),
      ended: String(r.ended),
      outcome: String(r.outcome),
      note: String(r.note),
      steps: JSON.parse(String(r.steps)) as { at: string; text: string }[],
    }));
    // the old setup's application attempts: they happened before this log, and still belong to the week
    const older =
      !kind || kind === "apply"
        ? (
            db
              .prepare(
                `SELECT id, listing, title, org, state, reason, updated FROM applications
                 WHERE agent = 'the old setup' AND updated >= ? ORDER BY updated DESC`,
              )
              .all(since) as {
              id: string;
              listing: string | null;
              title: string;
              org: string;
              state: string;
              reason: string;
              updated: string;
            }[]
          ).map((a) => ({
            id: a.id,
            kind: "apply",
            title: `${a.state === "sent" ? "Applied" : "Not sent"}: ${a.title}${a.org ? ` · ${a.org}` : ""}`,
            link: a.listing ? `/searches?open=${encodeURIComponent(a.listing)}` : "/applications",
            started: a.updated,
            ended: a.updated,
            outcome: a.state === "sent" ? "done" : "failed",
            note: a.reason,
            steps: [],
          }))
        : [];
    return [...rows, ...older].sort((a, b) => String(b.ended).localeCompare(String(a.ended)));
  };

  app.get("/api/live", (c) => {
    const apps = db
      .prepare(
        `SELECT id, listing, link, title, org, state, reason, agent, started, updated FROM applications
         WHERE state IN ('applying', 'needs-me', 'queued') ORDER BY updated DESC`,
      )
      .all();
    return c.json({ at: new Date().toISOString(), now: running(), apps, recent: log(1).slice(0, 30) });
  });
  app.get("/api/live/activity", (c) => {
    const days = Math.min(30, Math.max(1, Number(c.req.query("days") ?? "7") || 7));
    const kind = c.req.query("kind") || undefined;
    return c.json({ activity: log(days, kind) });
  });
}
