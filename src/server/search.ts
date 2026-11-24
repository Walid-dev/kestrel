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
  rescoreSearch,
  setListingNote,
  setListingStar,
  setListingStatus,
  statusWord,
  usualPrices,
} from "../domain/search/listings.ts";
import { lastRun, pendingSearches, runSearch } from "../domain/search/runs.ts";
import {
  listCollectors,
  loadSpecs,
  readSpecFile,
  type Spec,
  SpecRefused,
  writeSpecFile,
} from "../domain/search/specs.ts";
import {
  type HuntMode,
  type LastSearch,
  lastSearch,
  modeOf,
  nextSearch,
  setHuntMode,
} from "../domain/search/status.ts";
import { record } from "../platform/activity.ts";
import type { Settings } from "../platform/config.ts";
import { dataDir } from "../platform/paths.ts";
import { alertRun } from "./alerts.ts";

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
  todo: q.todo === "1",
  stage: q.stage || undefined,
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
      specs: { id: string; name: string; enabled: boolean; everyMinutes: number; auto: boolean }[];
      lastRun: ReturnType<typeof lastRun>;
      mirrored: boolean;
      running: number;
      mode: HuntMode | null; // null: a hunt the old setup runs (no kestrel search of its own)
      next: string | null;
      last: LastSearch | null;
    };
    const now = new Date();
    const state = (own: Spec[], searches: string[]) => ({
      mode: own.length ? modeOf(own) : null,
      next: nextSearch(db, own, now),
      last: lastSearch(db, searches),
    });
    const brief = (s: (typeof specs)[number]) => ({
      id: s.id,
      name: s.name,
      enabled: s.enabled,
      everyMinutes: s.everyMinutes,
      auto: s.auto,
    });
    const busy = (ids: string[]) => ids.filter((id) => pendingSearches().has(id)).length;
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
        specs: own.map(brief),
        lastRun: runs.sort((a, b) => b.started.localeCompare(a.started))[0] ?? null,
        mirrored: own.length === 0,
        running: busy(own.map((s) => s.id)),
        ...state(own, h.searches),
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
          specs: [brief(s)],
          lastRun: lastRun(db, s.id),
          mirrored: false,
          running: busy([s.id]),
          ...state([s], [s.id]),
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
    const verdict = db.prepare(
      "SELECT report FROM deep_checks WHERE listing = ? AND state = 'done' ORDER BY started DESC LIMIT 1",
    );
    const latest = db.prepare("SELECT state FROM deep_checks WHERE listing = ? ORDER BY started DESC LIMIT 1");
    const rows = listListings(db, filters, limit).map((r) => ({
      ...r,
      deal: r.kind === "deals" ? dealOf(r, usual) : null,
      app: apps.get(r.id) ?? null,
      deepVerdict: (verdict.get(r.id) as { report: string } | undefined)?.report ?? null,
      // the card's button: running shows it busy, failed offers it again
      deepState: (latest.get(r.id) as { state: string } | undefined)?.state ?? null,
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
        if (body.status) {
          setListingStatus(db, c.req.param("id"), body.status);
          const l = getListing(db, c.req.param("id"));
          record(
            "listing",
            `${statusWord(body.status, l?.kind ?? "jobs")}: ${String(l?.data.title ?? "a listing")}`,
            `/searches?open=${encodeURIComponent(c.req.param("id"))}`,
          );
        }
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
  // a hunt's switch, On / Quiet / Paused, written to each of its searches
  app.post(
    "/api/search/hunts/mode",
    zValidator(
      "json",
      z.object({
        kind: z.enum(["jobs", "deals"]),
        key: z.string().min(1).max(200),
        mode: z.enum(["on", "quiet", "paused"]),
      }),
    ),
    (c) => {
      const { kind, key, mode } = c.req.valid("json");
      const own = loadSpecs(specsDir()).specs.filter((s) => s.kind === kind && (s.hunt === key || s.id === key));
      if (!own.length) return c.json({ error: "this hunt has no search of its own here" }, 400);
      setHuntMode(own, mode, specsDir());
      return c.json({ ok: true, mode });
    },
  );
  // the settings page: one search's file as written, the collectors there are, and a write (checked first)
  app.get("/api/search/specs/:id", (c) => {
    const spec = readSpecFile(c.req.param("id"), specsDir());
    return spec ? c.json({ spec, collectors: listCollectors() }) : c.json({ error: "no such search" }, 404);
  });
  app.get("/api/search/collectors", (c) => c.json({ collectors: listCollectors() }));
  app.put("/api/search/specs/:id", async (c) => {
    if (Number(c.req.header("content-length") ?? "0") > 100_000)
      return c.json({ error: "that is too big to be a search" }, 400);
    const raw: unknown = await c.req.json().catch(() => undefined);
    if (raw === undefined) return c.json({ error: "the request's body isn't JSON" }, 400);
    // only the check's refusal is a bad request; a disk or database failure is the computer's, a plain 500
    let spec: Spec;
    try {
      spec = writeSpecFile(c.req.param("id"), raw, specsDir());
    } catch (e) {
      if (e instanceof SpecRefused) return c.json({ error: e.message }, 400);
      throw e;
    }
    // new scoring rules apply to what this search already found, not only to what it finds next
    const rescored = rescoreSearch(db, spec.id, spec.scoring ?? {}, spec.kind, new Date());
    return c.json({ ok: true, id: spec.id, rescored });
  });
  // Search now for a whole hunt: each of its searches that is on joins the one line, in the background; the hunts list
  // counts them down
  app.post(
    "/api/search/hunts/run",
    zValidator("json", z.object({ kind: z.enum(["jobs", "deals"]), key: z.string().min(1) })),
    (c) => {
      const { kind, key } = c.req.valid("json");
      const hunt = listHunts(db).find((h) => h.kind === kind && h.key === key);
      const on = loadSpecs(specsDir()).specs.filter(
        (s) => s.enabled && s.kind === kind && ((hunt?.searches.includes(s.id) ?? false) || (s.hunt || s.id) === key),
      );
      if (!on.length) return c.json({ error: "this hunt has no kestrel search that is on" }, 400);
      // a failed run lands its own row; a run of a hunt that is On pings my phone for a great deal
      for (const s of on)
        runSearch(db, s, new Date())
          .then((run) => alertRun(db, settings, s, run))
          .catch(() => {});
      return c.json({ started: on.length }, 202);
    },
  );
  app.post("/api/search/run/:id", async (c) => {
    const spec = loadSpecs(specsDir()).specs.find((s) => s.id === c.req.param("id"));
    if (!spec) return c.json({ error: "no such search" }, 404);
    if (!spec.enabled) return c.json({ error: "this search is switched off until the cutover" }, 400);
    const run = await runSearch(db, spec, new Date());
    await alertRun(db, settings, spec, run);
    return c.json(run);
  });
}
