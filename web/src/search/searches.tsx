// Searches, the old hunt pages' layout: the hunts as tabs (jobs and deals); the masthead with the hunt's name, Search
// now and what it looks for; one filter panel — the search box on top, then the stage, the match, the role or model,
// the source and the order as dropdowns with their counts, folding away when not wanted; then the cards. A card swipes
// right for Interested and left for Not for me, has the same buttons under it, and opens the whole listing on a tap.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { ago, DEAL, DealCard, JobCard, type Listing, MATCH, Swipe } from "./cards.tsx";
import { ListingSheet } from "./sheet.tsx";

type Run = { started: string; found: number; kept: number; problem: string } | null;
type Hunt = {
  key: string;
  kind: "jobs" | "deals";
  name: string;
  about: string;
  count: number;
  searches: string[];
  specs: { id: string; name: string; enabled: boolean; everyMinutes: number }[];
  lastRun: Run;
  mirrored: boolean;
};
type Counts = {
  stages: Record<string, number>;
  match: Record<string, number>;
  group: Record<string, number>;
  source: Record<string, number>;
};

// the stages the page offers, in the old page's order (offers and closed jobs stay under All)
const STAGE_LIST: Record<"jobs" | "deals", [string, string][]> = {
  jobs: [
    ["priority", "★ Priority"],
    ["review", "To review"],
    ["possible", "Possible"],
    ["interested", "Interested"],
    ["maybe", "Not sure"],
    ["applied", "Applied"],
    ["interviewing", "Interviewing"],
    ["rejected", "Rejected"],
    ["fake", "Not real"],
    ["passed", "Not for me"],
    ["all", "All"],
    ["leftout", "Left out by the rules"],
  ],
  deals: [
    ["new", "To review"],
    ["interested", "Interested"],
    ["maybe", "Not sure"],
    ["applied", "Contacted"],
    ["passed", "Not interested"],
    ["closed", "Sold"],
    ["all", "All"],
    ["leftout", "Hidden by the rules"],
  ],
};
const PAGE = 120;
const FOLD = "kestrel-search-filters";
const at = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

export function Searches() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  // ?open=<id> opens a listing straight away: Live and the activity links land on the listing itself
  const [open, setOpen] = useState<string | null>(() => new URLSearchParams(location.search).get("open"));
  const [limit, setLimit] = useState(PAGE);
  const [shown, setShown] = useState(() => {
    try {
      return localStorage.getItem(FOLD) !== "folded";
    } catch {
      return true;
    }
  });
  const fold = (v: boolean) => {
    setShown(v);
    try {
      localStorage.setItem(FOLD, v ? "open" : "folded");
    } catch {
      // storage off: the panel opens each visit
    }
  };
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k === "hunt") for (const x of ["stage", "match", "group", "source", "q"]) next.delete(x);
    next.delete("open");
    setParams(next, { replace: true });
    setLimit(PAGE);
  };

  const hunts = useQuery({
    queryKey: ["searches"],
    queryFn: async () => {
      const res = await fetch("/api/search");
      if (!res.ok) throw new Error(`the hunts didn't load (${res.status})`);
      return (await res.json()) as { hunts: Hunt[]; problems: string[]; mirror: Run };
    },
    refetchInterval: 60_000,
  });
  const all = hunts.data?.hunts ?? [];
  const hunt =
    all.find((h) => `${h.kind}:${h.key}` === params.get("hunt")) ?? all.find((h) => h.kind === "jobs") ?? all[0];
  const kind = hunt?.kind ?? "jobs";
  const stage = params.get("stage") ?? (kind === "jobs" ? "priority" : "new");
  const q = params.get("q") ?? "";
  const source = params.get("source") ?? "";
  const sort = params.get("sort") ?? "best";
  const match = params.get("match") ?? "";
  const group = params.get("group") ?? "";

  const base = new URLSearchParams({ kind, hunt: hunt?.key ?? "" });
  if (q) base.set("q", q);
  if (source) base.set("source", source);
  if (group) base.set("group", group);
  if (kind === "jobs" && match) base.set("match", match);
  const counted = new URLSearchParams(base);
  counted.set("stage", stage);
  const filtered = new URLSearchParams(counted);
  filtered.set("sort", sort);

  const counts = useQuery({
    queryKey: ["search-counts", counted.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/search/counts?${counted}`);
      if (!res.ok) throw new Error(`${res.status}`);
      return (await res.json()) as Counts;
    },
    enabled: Boolean(hunt),
  });
  const listings = useQuery({
    queryKey: ["listings", filtered.toString(), limit],
    queryFn: async () => {
      const res = await fetch(`/api/search/listings?${filtered}&limit=${limit}`);
      if (!res.ok) throw new Error(`the listings didn't load (${res.status})`);
      return (await res.json()) as { listings: Listing[] };
    },
    enabled: Boolean(hunt),
    refetchInterval: 60_000,
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["listings"] });
    queryClient.invalidateQueries({ queryKey: ["search-counts"] });
  };
  const act = useMutation({
    mutationFn: async (input: { id: string; body: Record<string, unknown> }) => {
      const res = await fetch(`/api/search/listings/${encodeURIComponent(input.id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input.body),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `${res.status}`);
    },
    onSettled: refresh,
  });
  const queue = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/apply/queue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listing: id }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `${res.status}`);
    },
    onSettled: refresh,
  });
  const runNow = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/search/run/${encodeURIComponent(id)}`, { method: "POST" });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `${res.status}`);
    },
    onSettled: () => {
      refresh();
      queryClient.invalidateQueries({ queryKey: ["searches"] });
    },
  });

  // a deal's tier is reckoned from the usual price, so its menu counts the loaded cards
  const rows = (listings.data?.listings ?? []).filter((l) => kind === "jobs" || !match || l.deal?.tier === match);
  const tiers: Record<string, number> = {};
  for (const l of listings.data?.listings ?? []) if (l.deal) tiers[l.deal.tier] = (tiers[l.deal.tier] ?? 0) + 1;
  const c = counts.data;
  const failed = [hunts, counts, listings, act, queue, runNow].find((x) => x.isError);
  const spec = hunt?.specs.find((s) => s.enabled);
  const sources = Object.entries(c?.source ?? {}).sort((a, b) => b[1] - a[1]);
  const groups = Object.entries(c?.group ?? {})
    .filter(([g]) => g)
    .sort((a, b) => b[1] - a[1]);
  const active = [match, group, source].filter(Boolean).length + (sort !== "best" ? 1 : 0);
  const stageName = STAGE_LIST[kind].find(([s]) => s === stage)?.[1] ?? stage;
  const status = (l: Listing, s: string) => act.mutate({ id: l.id, body: { status: s } });

  return (
    <main className="grid gap-5">
      {all.length > 1 && (
        <nav className="flex flex-wrap gap-2">
          {all.map((h) => (
            <button
              key={`${h.kind}:${h.key}`}
              type="button"
              className="pill"
              aria-pressed={h === hunt}
              onClick={() => set("hunt", `${h.kind}:${h.key}`)}
            >
              <span className={`dot ${h.kind === "jobs" ? "tone-accent" : "tone-orange"}`} />
              {h.name}
              <b>{h.count}</b>
            </button>
          ))}
        </nav>
      )}

      {hunt && (
        <header className="grid gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-cond m-0 text-[34px] font-bold uppercase leading-none tracking-tight md:text-[40px]">
              {hunt.name}
            </h2>
            {spec && (
              <button type="button" className="btn" disabled={runNow.isPending} onClick={() => runNow.mutate(spec.id)}>
                {runNow.isPending ? "Searching…" : "Search now"}
              </button>
            )}
          </div>
          {(hunt.about || kind === "deals") && (
            <p className="m-0 max-w-4xl text-[16px]" style={{ color: "var(--muted)" }}>
              {hunt.about || (groups.length ? `${groups.length} models: ${groups.map(([g]) => g).join(", ")}.` : "")}
            </p>
          )}
          <p className="font-mono m-0 text-[12.5px]" style={{ color: "var(--muted)" }}>
            <span className={`chip chip-caps ${kind === "jobs" ? "tone-accent" : "tone-orange"} mr-2`}>
              {kind === "jobs" ? "Jobs" : "Used deals"}
            </span>
            {hunt.lastRun ? (
              <>
                Last search <b style={{ color: "var(--text)" }}>{at(hunt.lastRun.started)}</b>: {hunt.lastRun.found}{" "}
                found, {hunt.lastRun.kept} new
                {hunt.lastRun.problem && <span style={{ color: "var(--warn)" }}> · {hunt.lastRun.problem}</span>}
                {spec && ` · every ${Math.round(spec.everyMinutes / 60)} h`}
              </>
            ) : hunt.mirrored ? (
              <>
                mirrored nightly from the old setup
                {hunts.data?.mirror && ` · last ${ago(hunts.data.mirror.started)}`}
                {hunts.data?.mirror?.problem && (
                  <span style={{ color: "var(--warn)" }}> · {hunts.data.mirror.problem}</span>
                )}
              </>
            ) : (
              "no search yet"
            )}
          </p>
        </header>
      )}

      <section className="card grid gap-3 !p-3">
        <div className="flex gap-2">
          <input
            type="search"
            className="btn min-w-0 flex-1"
            placeholder={kind === "jobs" ? "Search title, company, location or note" : "Search title, area or note"}
            value={q}
            onChange={(e) => set("q", e.target.value)}
          />
          <button type="button" className="btn shrink-0" aria-expanded={shown} onClick={() => fold(!shown)}>
            {shown ? "Hide filters" : `Filters${active ? ` · ${active}` : ""}`}
          </button>
        </div>
        {shown && (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
            <select className="btn" value={stage} onChange={(e) => set("stage", e.target.value)} aria-label="Stage">
              {STAGE_LIST[kind].map(([s, label]) => (
                <option key={s} value={s}>
                  {label} ({c?.stages[s] ?? 0})
                </option>
              ))}
            </select>
            <select className="btn" value={match} onChange={(e) => set("match", e.target.value)} aria-label="Match">
              {kind === "jobs" ? (
                <>
                  <option value="">Any match</option>
                  {(["great", "good", "weak", "poor"] as const).map((m) => (
                    <option key={m} value={m}>
                      {{ great: "Great 80+", good: "Good 60–79", weak: "Possible 40–59", poor: "Weak under 40" }[m]} (
                      {c?.match[m] ?? 0})
                    </option>
                  ))}
                </>
              ) : (
                <>
                  <option value="">Any price</option>
                  {(["great", "good", "fair", "over"] as const).map((m) => (
                    <option key={m} value={m}>
                      {DEAL[m].label} ({tiers[m] ?? 0})
                    </option>
                  ))}
                </>
              )}
            </select>
            <select className="btn" value={group} onChange={(e) => set("group", e.target.value)} aria-label="Group">
              <option value="">{kind === "jobs" ? "Every role" : "Every model"}</option>
              {groups.map(([g, n]) => (
                <option key={g} value={g}>
                  {g} ({n})
                </option>
              ))}
            </select>
            <select className="btn" value={source} onChange={(e) => set("source", e.target.value)} aria-label="Source">
              <option value="">All sources</option>
              {sources.map(([s, n]) => (
                <option key={s} value={s}>
                  {s.replaceAll("-", " ")} ({n})
                </option>
              ))}
            </select>
            <select className="btn" value={sort} onChange={(e) => set("sort", e.target.value)} aria-label="Sort">
              <option value="best">{kind === "jobs" ? "Best matches first" : "Best deals first"}</option>
              <option value="newest">Newest first</option>
              <option value="money">{kind === "jobs" ? "Highest pay first" : "Lowest price first"}</option>
            </select>
          </div>
        )}
        <p className="m-0 flex flex-wrap items-baseline gap-x-3 text-[13px]" style={{ color: "var(--muted)" }}>
          <span>
            <b style={{ color: "var(--strong)" }}>{stageName}</b> · {c?.stages[stage] ?? "…"}
            {match && kind === "jobs" ? ` · ${MATCH[match]?.label ?? match}` : ""}
            {match && kind === "deals" ? ` · ${DEAL[match]?.label ?? match}` : ""}
            {group ? ` · ${group}` : ""}
            {source ? ` · ${source.replaceAll("-", " ")}` : ""}
          </span>
          {stage === "leftout" ? (
            <span>The rules set these aside: a weak match, pay far below the floor, a removed search, an old ad.</span>
          ) : (
            <span>
              Swipe a card right for Interested, left for {kind === "jobs" ? "Not for me" : "Not interested"}.
            </span>
          )}
        </p>
      </section>

      {failed && (
        <p className="m-0 text-sm" style={{ color: "var(--red)" }}>
          {String((failed.error as Error).message)}
        </p>
      )}
      {(hunts.data?.problems ?? []).map((p) => (
        <p key={p} className="m-0 rounded-xl px-4 py-3 text-sm" style={{ background: "var(--warn-soft)" }}>
          a search file can't be read — {p}
        </p>
      ))}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {rows.map((l) => (
          <Swipe
            key={l.id}
            onRight={() => status(l, "interested")}
            onLeft={() => status(l, "passed")}
            leftLabel={kind === "jobs" ? "Not for me" : "Not interested"}
          >
            {l.kind === "deals" ? (
              <DealCard l={l} onOpen={() => setOpen(l.id)} onStatus={(s) => status(l, s)} />
            ) : (
              <JobCard
                l={l}
                onOpen={() => setOpen(l.id)}
                onStatus={(s) => status(l, s)}
                onQueue={() => queue.mutate(l.id)}
              />
            )}
          </Swipe>
        ))}
      </section>
      {listings.data && rows.length === 0 && (
        <p className="m-0 text-sm" style={{ color: "var(--muted)" }}>
          Nothing here{q || source || group || match ? " with these filters" : ""}.
        </p>
      )}
      {listings.data && listings.data.listings.length >= limit && (
        <button type="button" className="btn justify-self-center" onClick={() => setLimit((n) => n + PAGE)}>
          Show more
        </button>
      )}
      {open && <ListingSheet id={open} onClose={() => setOpen(null)} />}
    </main>
  );
}
