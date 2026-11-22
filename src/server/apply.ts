// The agent's doors: queue, claim, report, retry, and the lists by state. Every change rings the bus, so the phone
// hears it live.

import type { DatabaseSync } from "node:sqlite";
import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { z } from "zod";
import {
  claimNext,
  listApplications,
  queueApplication,
  reportApplication,
  retryApplication,
} from "../domain/apply/apply.ts";
import { Refused } from "../domain/notes/documents.ts";
import { record } from "../platform/activity.ts";
import { bus } from "./events.ts";

export function mountApply(app: Hono, db: DatabaseSync) {
  const ring = () => bus.emit("change", { kind: "apply", counts: listApplications(db).counts });
  const refusing = (c: { json: (o: unknown, s: 400) => Response }, e: unknown) => {
    if (e instanceof Refused) return c.json({ error: e.message }, 400);
    throw e;
  };
  app.get("/api/apply", (c) => c.json(listApplications(db)));
  app.post(
    "/api/apply/queue",
    zValidator("json", z.object({ listing: z.string().optional(), link: z.string().optional() })),
    (c) => {
      try {
        const made = queueApplication(db, c.req.valid("json"));
        ring();
        return c.json(made);
      } catch (e) {
        return refusing(c, e);
      }
    },
  );
  app.post("/api/apply/claim", zValidator("json", z.object({ agent: z.string().min(1).max(80) })), (c) => {
    const claimed = claimNext(db, c.req.valid("json").agent);
    if (claimed) ring();
    return c.json({ claimed });
  });
  app.post(
    "/api/apply/report",
    zValidator(
      "json",
      z.object({
        id: z.string().min(1),
        state: z.enum(["applying", "sent", "not-sent", "needs-me", "queued"]),
        reason: z.string().max(500).default(""),
      }),
    ),
    (c) => {
      try {
        const { id, state, reason } = c.req.valid("json");
        const r = reportApplication(db, id, state, reason);
        ring();
        const words: Record<string, string> = {
          sent: "Applied",
          "not-sent": "Not sent",
          "needs-me": "Needs me",
          applying: "Applying",
        };
        record(
          "apply",
          `${words[state] ?? state}: ${r.title || r.link}${r.org ? ` · ${r.org}` : ""}`,
          r.listing ? `/searches?open=${encodeURIComponent(r.listing)}` : "/applications",
          reason ?? "",
        );
        return c.json(r);
      } catch (e) {
        return refusing(c, e);
      }
    },
  );
  app.post("/api/apply/retry", zValidator("json", z.object({ id: z.string().min(1) })), (c) => {
    try {
      const r = retryApplication(db, c.req.valid("json").id);
      ring();
      return c.json(r);
    } catch (e) {
      return refusing(c, e);
    }
  });
}
