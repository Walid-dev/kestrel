// The Searches routes: the specs with their last runs and problems, the listings with combining filters, status and
// star, and Run now.

import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { z } from "zod";
import { listListings, setListingStar, setListingStatus } from "../domain/search/listings.ts";
import { lastRun, runSearch } from "../domain/search/runs.ts";
import { loadSpecs } from "../domain/search/specs.ts";
import { dataDir } from "../platform/paths.ts";

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

export function mountSearch(app: Hono, db: DatabaseSync) {
  const specsDir = () => join(dataDir(), "searches");
  app.get("/api/search", (c) => {
    const { specs, problems } = loadSpecs(specsDir());
    // searches that exist only as mirrored listings (no spec file yet) still get their card, quiet and runless
    const known = new Set(specs.map((s) => s.id));
    const mirrored = (
      db.prepare("SELECT search, COUNT(*) AS n FROM listings GROUP BY search ORDER BY search").all() as {
        search: string;
        n: number;
      }[]
    ).filter((r) => !known.has(r.search));
    return c.json({
      searches: specs.map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        enabled: s.enabled,
        everyMinutes: s.everyMinutes,
        lastRun: lastRun(db, s.id),
      })),
      mirrored: mirrored.map((r) => ({ id: r.search, listings: r.n })),
      problems,
      mirror: lastRun(db, "mirror:v1"), // the side-by-side's nightly import, with its problem when it failed
    });
  });
  app.get("/api/search/listings", (c) => {
    const q = c.req.query();
    return c.json({
      listings: listListings(db, {
        status: q.status || undefined,
        match: q.match || undefined,
        source: q.source || undefined,
        search: q.search || undefined,
        priority: q.priority === "1",
        q: q.q || undefined,
      }),
    });
  });
  app.post(
    "/api/search/listings/:id",
    zValidator(
      "json",
      z.object({
        status: z.enum(STATUSES).optional(),
        starred: z.union([z.literal(1), z.literal(0), z.null()]).optional(),
      }),
    ),
    (c) => {
      const body = c.req.valid("json");
      if (body.status) setListingStatus(db, c.req.param("id"), body.status);
      if ("starred" in body) setListingStar(db, c.req.param("id"), body.starred ?? null);
      return c.json({ ok: true });
    },
  );
  app.post("/api/search/run/:id", async (c) => {
    const spec = loadSpecs(specsDir()).specs.find((s) => s.id === c.req.param("id"));
    if (!spec) return c.json({ error: "no such search" }, 404);
    if (!spec.enabled) return c.json({ error: "this search is switched off until the cutover" }, 400);
    return c.json(await runSearch(db, spec, new Date()));
  });
}
