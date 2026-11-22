// Searches, the old hunt pages' layout: the hunts as tabs (jobs and deals); the masthead with the hunt's name, Search
// now and what it looks for; the stages with their counts; search, source and sort; the match pills and the groups;
// then the cards. A card opens the whole listing; a deal card's stages are one tap.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { ago, DEAL, DealCard, JobCard, type Listing, MATCH, STAGES } from "./cards.tsx";
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
  status: Record<string, number>;
  priority: number;
  all: number;
  match: Record<string, number>;
  group: Record<string, number>;
  source: Record<string, number>;
};

const PAGE = 120;
const at = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

export function Searches() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [moreGroups, setMoreGroups] = useState(false);
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k === "hunt") for (const x of ["stage", "match", "group", "source", "q"]) next.delete(x);
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
  const filtered = new URLSearchParams(base);
  if (stage === "priority") filtered.set("priority", "1");
  else if (stage !== "all") filtered.set("status", stage);
  filtered.set("sort", sort);

  const counted = new URLSearchParams(base);
  if (stage === "priority") counted.set("priority", "1");
  else if (stage !== "all") counted.set("status", stage);
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

  // a deal's tier is reckoned from the usual price, so its pills count the loaded cards
  const rows = (listings.data?.listings ?? []).filter((l) => kind === "jobs" || !match || l.deal?.tier === match);
  const tiers: Record<string, number> = {};
  for (const l of listings.data?.listings ?? []) if (l.deal) tiers[l.deal.tier] = (tiers[l.deal.tier] ?? 0) + 1;
  const c = counts.data;
  const failed = [hunts, counts, listings, act, runNow].find((x) => x.isError);
  const spec = hunt?.specs.find((s) => s.enabled);
  const sources = Object.entries(c?.source ?? {}).sort((a, b) => b[1] - a[1]);
  const groupsAll = Object.entries(c?.group ?? {})
    .filter(([g]) => g)
    .sort((a, b) => b[1] - a[1]);
  // the main groups only, as the old page showed them; the long tail waits behind "more"
  const groups = moreGroups ? groupsAll : groupsAll.filter(([g, n], i) => i < 10 && (n > 1 || g === group));

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
            <p className="m-0 max-w-3xl text-[16px]" style={{ color: "var(--muted)" }}>
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

      <div className="grid gap-3 pt-4" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="flex flex-wrap gap-2">
          {kind === "jobs" && (
            <button
              type="button"
              className="pill"
              aria-pressed={stage === "priority"}
              onClick={() => set("stage", "priority")}
            >
              <span style={{ color: "var(--yellow)" }}>★</span> Priority <b>{c?.priority ?? "·"}</b>
            </button>
          )}
          {STAGES[kind].map((s) => (
            <button
              key={s.status}
              type="button"
              className={`pill ${s.tone}`}
              aria-pressed={stage === s.status}
              onClick={() => set("stage", s.status)}
            >
              <span className="dot" /> {s.label} <b>{c?.status[s.status] ?? 0}</b>
            </button>
          ))}
          <button type="button" className="pill" aria-pressed={stage === "all"} onClick={() => set("stage", "all")}>
            All <b>{c?.all ?? "·"}</b>
          </button>
        </div>
        <div className="grid gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <input
            type="search"
            className="btn"
            placeholder={kind === "jobs" ? "Search title, company, location or note" : "Search title, area or note"}
            value={q}
            onChange={(e) => set("q", e.target.value)}
          />
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
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="pill" aria-pressed={!match} onClick={() => set("match", "")}>
            {kind === "jobs" ? "Match" : "Deal"}{" "}
            <b>
              {kind === "jobs"
                ? Object.values(c?.match ?? {}).reduce((a, b) => a + b, 0)
                : (listings.data?.listings.length ?? 0)}
            </b>
          </button>
          {(kind === "jobs"
            ? (["great", "good", "weak", "poor"] as const).map((m) => ({
                k: m,
                ...MATCH[m],
                n: c?.match[m] ?? 0,
                label: { great: "Great 80+", good: "Good 60–79", weak: "Possible 40–59", poor: "Weak under 40" }[m],
              }))
            : (["great", "good", "fair", "over"] as const).map((m) => ({ k: m, ...DEAL[m], n: tiers[m] ?? 0 }))
          ).map((m) => (
            <button
              key={m.k}
              type="button"
              className={`pill ${m.tone}`}
              aria-pressed={match === m.k}
              onClick={() => set("match", match === m.k ? "" : m.k)}
            >
              <span className="dot" /> {m.label} <b>{m.n}</b>
            </button>
          ))}
          {kind === "deals" && (
            <span className="text-[13px]" style={{ color: "var(--muted)" }}>
              The bar on each card shows where the price sits against the usual price.
            </span>
          )}
        </div>
        {groups.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="pill" aria-pressed={!group} onClick={() => set("group", "")}>
              {kind === "jobs" ? "Role" : "Model"} <b>{groupsAll.reduce((a, [, n]) => a + n, 0)}</b>
            </button>
            {groups.map(([g, n]) => (
              <button
                key={g}
                type="button"
                className="pill"
                aria-pressed={group === g}
                onClick={() => set("group", group === g ? "" : g)}
              >
                {g} <b>{n}</b>
              </button>
            ))}
            {groupsAll.length > groups.length && (
              <button type="button" className="pill" onClick={() => setMoreGroups(true)}>
                +{groupsAll.length - groups.length} more
              </button>
            )}
          </div>
        )}
      </div>

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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((l) =>
          l.kind === "deals" ? (
            <DealCard
              key={l.id}
              l={l}
              onOpen={() => setOpen(l.id)}
              onStatus={(s) => act.mutate({ id: l.id, body: { status: s } })}
            />
          ) : (
            <JobCard key={l.id} l={l} onOpen={() => setOpen(l.id)} />
          ),
        )}
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
