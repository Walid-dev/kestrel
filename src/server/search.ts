// The Searches routes: the hunts (job specs, deal hunts across sites and models) with their runs and problems, a
// hunt's counts for its toolbar, the listings with combining filters and a deal's usual price, one listing with its
// deep check, status, star and note, Run now, and Deep check.
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { z } from "zod";
import { Refused } from "../domain/notes/documents.ts";
import { latestDeepCheck, startDeepCheck } from "../domain/search/deep.ts";
import {
  getListing,
  type ListingFilters,
  type ListingRow,
  listHunts,
  listingCounts,
  listListings,
  setListingNote,
  setListingStar,
  setListingStatus,
  usualPrices,
} from "../domain/search/listings.ts";
import { lastRun, runSearch } from "../domain/search/runs.ts";
import { loadSpecs } from "../domain/search/specs.ts";
import type { Settings } from "../platform/config.ts";
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

const filtersOf = (q: Record<string, string>): ListingFilters => ({
  kind: q.kind === "deals" ? "deals" : q.kind === "jobs" ? "jobs" : undefined,
  hunt: q.hunt || undefined,
  status: q.status || undefined,
  match: q.match || undefined,
  source: q.source || undefined,
  search: q.search || undefined,
  group: q.group || undefined,
  priority: q.priority === "1",
  q: q.q || undefined,
  sort: q.sort === "newest" || q.sort === "money" || q.sort === "best" ? q.sort : undefined,
});

// a deal's place against the usual asking price for its model: the bar on its card
type Usual = { median: number; p25: number; p75: number; n: number };
function dealOf(r: ListingRow, usual: Map<string, Usual>) {
  const price = typeof r.data.price === "number" ? r.data.price : null;
  const cat = (typeof r.data.category === "string" && r.data.category) || r.search;
  const u = usual.get(cat);
  if (price == null || !u) return null;
  const pct = Math.round((price / u.median) * 100);
  const tier = pct <= 65 ? "great" : pct <= 85 ? "good" : pct <= 105 ? "fair" : "over";
  return { ...u, pct, tier, under: Math.round(u.median - price) };
}

export function mountSearch(app: Hono, db: DatabaseSync, settings: Settings) {
  const specsDir = () => join(dataDir(), "searches");
  app.get("/api/search", (c) => {
    const { specs, problems } = loadSpecs(specsDir());
    const byId = new Map(specs.map((s) => [s.id, s]));
    type Hunt = {
      key: string;
      kind: "jobs" | "deals";
      name: string;
      about: string;
      count: number;
      searches: string[];
      specs: { id: string; name: string; enabled: boolean; everyMinutes: number }[];
      lastRun: ReturnType<typeof lastRun>;
      mirrored: boolean;
    };
    const hunts: Hunt[] = listHunts(db).map((h): Hunt => {
      // a hunt's specs: its searches that have a spec file (Run now needs one), or a spec named after the hunt
      const own = specs.filter((s) => h.searches.includes(s.id) || (s.hunt && s.hunt === h.key));
      const first = own[0] ?? byId.get(h.key);
      const runs = own.map((s) => lastRun(db, s.id)).filter((r) => r !== null);
      return {
        key: h.key,
        kind: h.kind,
        name: first?.hunt || first?.name || h.key,
        about: first?.about ?? "",
        count: h.count,
        searches: h.searches,
        specs: own.map((s) => ({ id: s.id, name: s.name, enabled: s.enabled, everyMinutes: s.everyMinutes })),
        lastRun: runs.sort((a, b) => b.started.localeCompare(a.started))[0] ?? null,
        mirrored: own.length === 0,
      };
    });
    // a spec with no listings yet still gets its tab
    for (const s of specs)
      if (!hunts.some((h) => h.specs.some((x) => x.id === s.id)))
        hunts.push({
          key: s.hunt || s.id,
          kind: s.kind,
          name: s.hunt || s.name,
          about: s.about,
          count: 0,
          searches: [s.id],
          specs: [{ id: s.id, name: s.name, enabled: s.enabled, everyMinutes: s.everyMinutes }],
          lastRun: lastRun(db, s.id),
          mirrored: false,
        });
    return c.json({ hunts, problems, mirror: lastRun(db, "mirror:v1") });
  });
  app.get("/api/search/counts", (c) => c.json(listingCounts(db, filtersOf(c.req.query()))));
  app.get("/api/search/listings", (c) => {
    const filters = filtersOf(c.req.query());
    const limit = Math.min(2000, Math.max(1, Number(c.req.query("limit") ?? "120") || 120));
    const usual = usualPrices(db, filters.hunt);
    // each listing's latest application attempt, for the card's chip (sent, not sent, needs me)
    const apps = new Map(
      (
        db
          .prepare("SELECT listing, state, reason FROM applications WHERE listing IS NOT NULL ORDER BY updated")
          .all() as {
          listing: string;
          state: string;
          reason: string;
        }[]
      ).map((a) => [a.listing, { state: a.state, reason: a.reason }]),
    );
    const rows = listListings(db, filters, limit).map((r) => ({
      ...r,
      deal: r.kind === "deals" ? dealOf(r, usual) : null,
      app: apps.get(r.id) ?? null,
      deepVerdict:
        (
          db
            .prepare(
              "SELECT report FROM deep_checks WHERE listing = ? AND state = 'done' ORDER BY started DESC LIMIT 1",
            )
            .get(r.id) as { report: string } | undefined
        )?.report ?? null,
    }));
    return c.json({ listings: rows });
  });
  app.get("/api/search/listings/:id", (c) => {
    const r = getListing(db, c.req.param("id"));
    if (!r) return c.json({ error: "no such listing" }, 404);
    const usual = usualPrices(db);
    return c.json({
      ...r,
      deal: r.kind === "deals" ? dealOf(r, usual) : null,
      deep: latestDeepCheck(db, r.id),
      applications: db
        .prepare(
          "SELECT id, state, reason, started, updated FROM applications WHERE listing = ? OR link = ? ORDER BY started DESC",
        )
        .all(r.id, r.link),
    });
  });
  app.post(
    "/api/search/listings/:id",
    zValidator(
      "json",
      z.object({
        status: z.enum(STATUSES).optional(),
        starred: z.union([z.literal(1), z.literal(0), z.null()]).optional(),
        note: z.string().max(2000).optional(),
      }),
    ),
    (c) => {
      try {
        const body = c.req.valid("json");
        if (body.status) setListingStatus(db, c.req.param("id"), body.status);
        if ("starred" in body) setListingStar(db, c.req.param("id"), body.starred ?? null);
        if (body.note !== undefined) setListingNote(db, c.req.param("id"), body.note);
        return c.json({ ok: true });
      } catch (e) {
        if (e instanceof Refused) return c.json({ error: e.message }, 400);
        throw e;
      }
    },
  );
  app.post("/api/search/listings/:id/deep", (c) => {
    try {
      return c.json({ id: startDeepCheck(db, settings, c.req.param("id")) }, 202);
    } catch (e) {
      if (e instanceof Refused) return c.json({ error: e.message }, 400);
      throw e;
    }
  });
  app.post("/api/search/run/:id", async (c) => {
    const spec = loadSpecs(specsDir()).specs.find((s) => s.id === c.req.param("id"));
    if (!spec) return c.json({ error: "no such search" }, 404);
    if (!spec.enabled) return c.json({ error: "this search is switched off until the cutover" }, 400);
    return c.json(await runSearch(db, spec, new Date()));
  });
}
