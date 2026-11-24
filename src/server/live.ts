// Live: what runs now, step by step, and the Activity log. Running work comes from the activity list (searches, deep
// checks, model asks, the mirror, the nightly copy); applications in flight come from the database, and the agent's
// chats (an application's, step by step) from the old setup's Live. Every piece of
// work that ends, and every mark I make (a lesson graded, a task done, a stage set, an application sent), lands in
// the activity table with where to open it. Every change rings the live stream.
import type { DatabaseSync } from "node:sqlite";
import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { z } from "zod";
import { type Activity, activity, running } from "../platform/activity.ts";
import { bus } from "./events.ts";

const DAY = 86_400_000;

// an agent's chat as Live shows it: its state and its steps, one line each (the old setup's Live reads them from dsh).
// Its JSON is read leniently: a missing field takes its empty value, and a step or a chat that can't be read is
// left out alone, so one odd chat never hides the others.
const Step = z.object({
  at: z.string().catch(""),
  kind: z.string().catch(""),
  text: z.string().catch(""),
  why: z.string().optional().catch(undefined),
});
const Chat = z.object({
  id: z.string(),
  title: z.string().catch(""),
  applying: z.boolean().catch(false),
  working: z.boolean().catch(false),
  waiting: z.string().catch(""),
  help: z.string().catch(""),
  started: z.string().catch(""),
  updated: z.string().catch(""),
  steps: z
    .array(z.unknown())
    .catch([])
    .transform((steps) => steps.slice(-60).flatMap((step) => Step.safeParse(step).data ?? [])),
  job: z
    .object({ title: z.string().optional().catch(undefined), company: z.string().optional().catch(undefined) })
    .nullable()
    .catch(null),
});
type Chat = z.infer<typeof Chat>;
const OldLive = z.object({ chats: z.array(z.unknown()).catch([]), queuePaused: z.boolean().nullable().catch(null) });
const RECENT_MS = 2 * 3600_000; // an ended chat stays on Live this long

// the agent's chats at work, waiting on me or ended lately, and whether the queue is paused, from the old setup's Live;
// a second's reads of one address are shared
type Agents = { chats: Chat[]; paused: boolean | null };
let cache: { at: number; url: string } & Agents = { at: 0, url: "", chats: [], paused: null };
async function agentChats(url: string): Promise<Agents> {
  if (!url) return { chats: [], paused: null };
  if (cache.url === url && Date.now() - cache.at < 2000) return cache;
  // a failed read keeps this address's last read; another address's chats never stand in for it
  const last: Agents = cache.url === url ? cache : { chats: [], paused: null };
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const data = OldLive.safeParse(await res.json());
    if (!data.success) return last; // not the old Live's shape: the last read stands
    const now = Date.now();
    const chats = data.data.chats
      .flatMap((c) => Chat.safeParse(c).data ?? [])
      .filter((c) => c.working || c.waiting || now - Date.parse(c.updated) < RECENT_MS)
      .slice(0, 6);
    cache = { at: now, url, chats, paused: data.data.queuePaused };
    return cache;
  } catch {
    return last; // the old setup not answering: the last read stands until it does
  }
}

// Stop and Pause go to the old setup's server, which runs the applications (its queue claims kestrel's too): Stop
// ends the chat's running turn in dsh, Pause keeps the next queued application from starting until Play. A job hunt's
// Search now goes there too while the old setup runs the job search (search.ts). JSON, with no Origin header: the old
// server refuses a write that names another page's origin
export async function toOldSetup(
  oldLive: string,
  path: string,
  body: unknown,
): Promise<{ code: number; body: unknown }> {
  if (!oldLive) return { code: 503, body: { error: "the old setup's Live isn't set (settings.json: oldLive)" } };
  try {
    const res = await fetch(new URL(path, oldLive), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    cache.at = 0; // the next read shows the change
    return { code: res.status, body: await res.json().catch(() => ({})) };
  } catch {
    return { code: 502, body: { error: "the old setup's server didn't answer: is hunt serve running?" } };
  }
}
const CHAT_ID = /^session-[0-9a-f-]{36}$/;

export function mountLive(app: Hono, db: DatabaseSync, oldLive = "") {
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

  app.get("/api/live", async (c) => {
    const apps = db
      .prepare(
        `SELECT id, listing, link, title, org, state, reason, agent, started, updated FROM applications
         WHERE state IN ('applying', 'needs-me', 'queued') ORDER BY updated DESC`,
      )
      .all();
    return c.json({
      at: new Date().toISOString(),
      now: running(),
      apps,
      ...(({ chats, paused }) => ({ chats, paused }))(await agentChats(oldLive)),
      recent: log(1).slice(0, 30),
    });
  });
  // Stop on a running chat: {chat, all}; all also pauses the queue first, so nothing new starts after it
  const stopBody = z.object({ chat: z.string().regex(CHAT_ID), all: z.boolean().default(false) });
  app.post("/api/live/stop", async (c) => {
    const read = stopBody.safeParse(await c.req.json().catch(() => ({})));
    if (!read.success) return c.json({ error: 'which chat? {"chat": "session-…", "all": true | false}' }, 400);
    const { chat, all } = read.data;
    if (all) {
      const paused = await toOldSetup(oldLive, "/api/queue/pause", { paused: true });
      if (paused.code !== 200) return c.json(paused.body as object, paused.code as 502);
    }
    const got = await toOldSetup(oldLive, "/api/chat/stop", { chat });
    bus.emit("change", { kind: "live" });
    return c.json(got.body as object, got.code as 200);
  });
  // the queue's Pause and Play: {paused: true | false}
  app.post("/api/live/pause", zValidator("json", z.object({ paused: z.boolean() })), async (c) => {
    const got = await toOldSetup(oldLive, "/api/queue/pause", { paused: c.req.valid("json").paused });
    bus.emit("change", { kind: "live" });
    return c.json(got.body as object, got.code as 200);
  });
  const activityQuery = z.object({
    days: z.coerce.number().int().min(1).max(30).catch(7),
    kind: z.string().max(20).optional().catch(undefined),
  });
  app.get("/api/live/activity", zValidator("query", activityQuery), (c) => {
    const { days, kind } = c.req.valid("query");
    return c.json({ activity: log(days, kind || undefined) });
  });
}
