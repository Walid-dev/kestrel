// Searches, the old hunt pages' layout: the hunts as tabs (jobs and deals); the masthead with the hunt's name, Search
// now and what it looks for; one filter panel — the search box on top, then the stage, the match, the role or model,
// the source and the order as dropdowns with their counts, folding away when not wanted; then the cards. A card swipes
// right for Interested and left for Not for me, has the same buttons under it, and opens the whole listing on a tap.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
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

// each filter is its own part: a label with what is picked, its pills under it, folding on its own
function Part({
  name,
  label,
  value,
  open,
  toggle,
  children,
}: {
  name: string;
  label: string;
  value: string;
  open: boolean;
  toggle: (name: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <button
        type="button"
        className="flex items-center gap-2 text-left"
        onClick={() => toggle(name)}
        aria-expanded={open}
      >
        <span
          className="text-[10px]"
          style={{
            color: "var(--muted)",
            transform: open ? "rotate(90deg)" : undefined,
            transition: "transform 0.15s",
          }}
        >
          ▶
        </span>
        <span className="eyebrow">{label}</span>
        {!open && (
          <span className="text-[13px]" style={{ color: "var(--text)" }}>
            {value}
          </span>
        )}
      </button>
      {open && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

const STAGE_TONE: Record<string, string> = {
  review: "tone-accent",
  possible: "tone-yellow",
  interested: "tone-green",
  maybe: "tone-yellow",
  applied: "tone-accent",
  interviewing: "tone-orange",
  rejected: "tone-red",
  fake: "tone-red",
  passed: "tone-muted",
  new: "tone-accent",
  closed: "tone-muted",
  leftout: "tone-muted",
};
const SORTS: Record<"jobs" | "deals", [string, string][]> = {
  jobs: [
    ["best", "Best matches first"],
    ["newest", "Newest first"],
    ["money", "Highest pay first"],
  ],
  deals: [
    ["best", "Best deals first"],
    ["newest", "Newest first"],
    ["money", "Lowest price first"],
  ],
};
const PARTS = "kestrel-search-parts";

export function Searches() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  // ?open=<id> opens a listing straight away: Live and the activity links land on the listing itself
  const [open, setOpen] = useState<string | null>(() => new URLSearchParams(location.search).get("open"));
  const [limit, setLimit] = useState(PAGE);
  const [moreGroups, setMoreGroups] = useState(false);
  const [closed, setClosed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(PARTS) ?? "[]") as string[]);
    } catch {
      return new Set();
    }
  });
  const toggle = (name: string) =>
    setClosed((s) => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      try {
        localStorage.setItem(PARTS, JSON.stringify([...next]));
      } catch {
        // storage off: every part opens each visit
      }
      return next;
    });
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
  const defaultStage = kind === "jobs" ? "priority" : "new";
  // Reset: every filter back to the start, the hunt and the panel as they are
  const reset = () => {
    const next = new URLSearchParams();
    const h = params.get("hunt");
    if (h) next.set("hunt", h);
    setParams(next, { replace: true });
    setLimit(PAGE);
  };
  const status = (l: Listing, s: string) => act.mutate({ id: l.id, body: { status: s } });

  return (
    <main className="grid gap-5">
      {all.length > 0 && (
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
          <Link to="/searches/settings?new=jobs" className="pill">
            + New search
          </Link>
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
            <Link
              to={
                hunt.specs[0]
                  ? `/searches/settings?spec=${encodeURIComponent(hunt.specs[0].id)}`
                  : `/searches/settings?new=${kind}`
              }
              className="btn"
              aria-label="This search's settings"
              title={
                hunt.specs[0] ? "This search's settings" : "This hunt runs in the old setup: make its kestrel search"
              }
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </Link>
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

      <section className="card grid gap-2.5 !p-3">
        <div className="flex gap-2">
          <input
            type="search"
            className="btn min-w-0 flex-1"
            placeholder={kind === "jobs" ? "Search title, company, location or note" : "Search title, area or note"}
            value={q}
            onChange={(e) => set("q", e.target.value)}
          />
          {(active > 0 || q || stage !== defaultStage) && (
            <button type="button" className="btn shrink-0" onClick={reset}>
              Reset
            </button>
          )}
          <button type="button" className="btn shrink-0" aria-expanded={shown} onClick={() => fold(!shown)}>
            {shown ? "Hide filters" : `Filters${active ? ` · ${active}` : ""}`}
          </button>
        </div>
        {shown && (
          <div className="grid gap-2">
            <Part
              name="stage"
              label="Stage"
              value={`${stageName} ${c?.stages[stage] ?? ""}`}
              open={!closed.has("stage")}
              toggle={toggle}
            >
              {STAGE_LIST[kind].map(([s, label]) => (
                <button
                  key={s}
                  type="button"
                  className={`pill ${STAGE_TONE[s] ?? ""}`}
                  aria-pressed={stage === s}
                  onClick={() => set("stage", s)}
                >
                  {STAGE_TONE[s] && <span className="dot" />} {label} <b>{c?.stages[s] ?? 0}</b>
                </button>
              ))}
            </Part>
            <Part
              name="match"
              label={kind === "jobs" ? "Match" : "Price"}
              value={match ? ((kind === "jobs" ? MATCH[match]?.label : DEAL[match]?.label) ?? match) : "any"}
              open={!closed.has("match")}
              toggle={toggle}
            >
              {(kind === "jobs"
                ? (["great", "good", "weak", "poor"] as const).map((m) => ({
                    k: m,
                    tone: MATCH[m].tone,
                    label: { great: "Great 80+", good: "Good 60–79", weak: "Possible 40–59", poor: "Weak under 40" }[m],
                    n: c?.match[m] ?? 0,
                  }))
                : (["great", "good", "fair", "over"] as const).map((m) => ({
                    k: m,
                    tone: DEAL[m].tone,
                    label: DEAL[m].label,
                    n: tiers[m] ?? 0,
                  }))
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
            </Part>
            {groups.length > 0 && (
              <Part
                name="group"
                label={kind === "jobs" ? "Role" : "Model"}
                value={group || "every"}
                open={!closed.has("group")}
                toggle={toggle}
              >
                {(moreGroups ? groups : groups.filter(([g, n], i) => i < 12 && (n > 1 || g === group))).map(
                  ([g, n]) => (
                    <button
                      key={g}
                      type="button"
                      className="pill"
                      aria-pressed={group === g}
                      onClick={() => set("group", group === g ? "" : g)}
                    >
                      {g} <b>{n}</b>
                    </button>
                  ),
                )}
                {!moreGroups && groups.length > 12 && (
                  <button type="button" className="pill" onClick={() => setMoreGroups(true)}>
                    +{groups.length - 12} more
                  </button>
                )}
              </Part>
            )}
            <Part
              name="source"
              label="Source"
              value={source ? source.replaceAll("-", " ") : "all"}
              open={!closed.has("source")}
              toggle={toggle}
            >
              {sources.map(([s, n]) => (
                <button
                  key={s}
                  type="button"
                  className="pill"
                  aria-pressed={source === s}
                  onClick={() => set("source", source === s ? "" : s)}
                >
                  {s.replaceAll("-", " ")} <b>{n}</b>
                </button>
              ))}
            </Part>
            <Part
              name="sort"
              label="Order"
              value={SORTS[kind].find(([k]) => k === sort)?.[1] ?? sort}
              open={!closed.has("sort")}
              toggle={toggle}
            >
              {SORTS[kind].map(([k, label]) => (
                <button key={k} type="button" className="pill" aria-pressed={sort === k} onClick={() => set("sort", k)}>
                  {label}
                </button>
              ))}
            </Part>
          </div>
        )}
        <p className="m-0 text-[13px]" style={{ color: "var(--muted)" }}>
          {stage === "leftout"
            ? "The rules set these aside: a weak match, pay far below the floor, a removed search, an old ad."
            : `Swipe a card right for Interested, left for ${kind === "jobs" ? "Not for me" : "Not interested"}.`}
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
