// Searches, the old hunt pages' layout: the hunts as tabs (jobs and deals); the masthead with the hunt's name, Search
// now and what it looks for; one filter panel — the search box on top with the round Reset, then the stage, the match,
// the role or model, the source and the order as pills, each part folding on its own and the whole panel too; then the
// cards. The page opens on To review, best first. A card swipes right for Interested and left for Not for me, has the
// same buttons under it, starts a deep check, and opens the whole listing on a tap.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Ask } from "../ask.tsx";
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
  specs: { id: string; name: string; enabled: boolean; everyMinutes: number; auto: boolean }[];
  lastRun: Run;
  mirrored: boolean;
  running: number; // its searches queued or running now
  mode: "on" | "quiet" | "paused" | null; // null: the old setup runs it
  next: string | null;
  last: {
    at: string;
    kept: number;
    leftOut: number;
    problem: string;
    best: { id: string; title: string; org: string } | null;
  } | null;
};
const MODES = {
  on: ["On", "Searches on its own and pings your phone for a great find"],
  quiet: ["Quiet", "Searches on its own, without pings"],
  paused: ["Paused", "Searches only when you press Search now"],
} as const;

// a time as the old hunt page said it: today 9:00 AM, tomorrow 10:00 AM, or its weekday
function when(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const days = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime()) /
      86_400_000,
  );
  const day =
    days === 0
      ? "today"
      : days === 1
        ? "tomorrow"
        : days === -1
          ? "yesterday"
          : d.toLocaleDateString(undefined, { weekday: "short" });
  return `${day} ${time}`;
}

// the line under the title: the last search, what it found and the best of it, and when it searches next
function StatusLine({ hunt, mirror }: { hunt: Hunt; mirror?: Run }) {
  const l = hunt.last;
  const bits: ReactNode[] = [];
  if (l)
    bits.push(
      <span key="last">
        Last search <b style={{ color: "var(--text)" }}>{when(l.at)}</b>: {l.kept} new{" "}
        {hunt.kind === "jobs" ? (l.kept === 1 ? "job" : "jobs") : l.kept === 1 ? "ad" : "ads"}
        {l.leftOut ? ` (${l.leftOut} left out)` : ""}.
        {l.best && ` Best: ${l.best.title}${l.best.org ? ` at ${l.best.org}` : ""}.`}
        {l.problem && <span style={{ color: "var(--warn)" }}> {l.problem}.</span>}
      </span>,
    );
  else if (hunt.mirrored)
    bits.push(
      <span key="mirror">
        Mirrored nightly from the old setup{mirror ? `, last ${ago(mirror.started)}` : ""}
        {mirror?.problem && <span style={{ color: "var(--warn)" }}> · {mirror.problem}</span>}
      </span>,
    );
  else bits.push(<span key="none">No search yet.</span>);
  if (hunt.running > 0)
    bits.push(
      <b key="now" style={{ color: "var(--green)" }}>
        Searching now
      </b>,
    );
  if (hunt.mode === "paused")
    bits.push(
      <span key="paused">
        <b style={{ color: "var(--text)" }}>Paused</b>: it searches when you press Search now
      </span>,
    );
  else if (hunt.next)
    bits.push(
      <span key="next">
        Next search <b style={{ color: "var(--text)" }}>{when(hunt.next)}</b>
        {hunt.mode === "quiet" ? " (no pings)" : ""}, if your Mac is awake and plugged in
      </span>,
    );
  if (l && hunt.mode && hunt.mode !== "paused" && Date.now() - Date.parse(l.at) > 26 * 3600_000)
    bits.push(
      <span key="stale" style={{ color: "var(--warn)" }}>
        No search since {when(l.at)}. Check the Mac.
      </span>,
    );
  return (
    <>
      {bits.map((b, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the line's parts keep their order
        <span key={i}>
          {i > 0 && " · "}
          {b}
        </span>
      ))}
    </>
  );
}
type Counts = {
  stages: Record<string, number>;
  match: Record<string, number>;
  group: Record<string, number>;
  source: Record<string, number>;
};

// the stages the page offers (offers and closed jobs stay under All). It opens on To review, best first: the new
// great and good matches, the ones worth a look now
const STAGE_LIST: Record<"jobs" | "deals", [string, string][]> = {
  jobs: [
    ["review", "To review"],
    ["priority", "★ Priority"],
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
const DEFAULT_STAGE = { jobs: "review", deals: "new" } as const;
const PAGE = 120;
const FOLD = "kestrel-search-filters";

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
const LAST = "kestrel-last-opened";

export function Searches() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  // ?open=<id> opens a listing straight away: Live and the activity links land on the listing itself
  const [open, setOpen] = useState<string | null>(() => new URLSearchParams(location.search).get("open"));
  // a link on the page itself (a listing in Ask's answer) opens that listing too
  useEffect(() => {
    const id = params.get("open");
    if (id) setOpen(id);
  }, [params]);
  const [asking, setAsking] = useState(false);
  // the listing I opened last: its card says so when I come back to the list (kept in this browser)
  const [last, setLast] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST);
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (!open) return;
    setLast(open);
    try {
      localStorage.setItem(LAST, open);
    } catch {
      // a private window keeps nothing: the mark lasts this visit
    }
  }, [open]);
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
    // while a hunt searches, its button counts down and its new cards come in
    refetchInterval: (query) => (query.state.data?.hunts.some((h) => h.running > 0) ? 5000 : 60_000),
  });
  const all = hunts.data?.hunts ?? [];
  const busy = all.some((h) => h.running > 0);
  const hunt =
    all.find((h) => `${h.kind}:${h.key}` === params.get("hunt")) ?? all.find((h) => h.kind === "jobs") ?? all[0];
  const kind = hunt?.kind ?? "jobs";
  const stage = params.get("stage") ?? DEFAULT_STAGE[kind];
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
    placeholderData: keepPreviousData,
  });
  const listings = useQuery({
    queryKey: ["listings", filtered.toString(), limit],
    queryFn: async () => {
      const res = await fetch(`/api/search/listings?${filtered}&limit=${limit}`);
      if (!res.ok) throw new Error(`the listings didn't load (${res.status})`);
      return (await res.json()) as { listings: Listing[] };
    },
    enabled: Boolean(hunt),
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      busy || query.state.data?.listings.some((l) => l.deepState === "running") ? 5000 : 60_000,
  });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["listings"] }),
      queryClient.invalidateQueries({ queryKey: ["search-counts"] }),
    ]);
  // a stage pressed shows at once; the list's own answer replaces it when it comes
  const [marked, setMarked] = useState<Record<string, string>>({});
  const act = useMutation({
    mutationFn: async (input: { id: string; body: Record<string, unknown> }) => {
      const res = await fetch(`/api/search/listings/${encodeURIComponent(input.id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input.body),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `${res.status}`);
    },
    onSettled: async (_data, _error, input) => {
      await refresh();
      setMarked((m) => {
        const next = { ...m };
        delete next[input.id];
        return next;
      });
    },
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
  // the hunt's switch: On, Quiet or Paused, for each of its searches
  const setMode = useMutation({
    mutationFn: async (input: { kind: string; key: string; mode: string }) => {
      const res = await fetch("/api/search/hunts/mode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `${res.status}`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["searches"] }),
  });
  // Search now: every search of the hunt, one after the other, in the background (the chair's run across two sites
  // and ten models takes a while); the button counts them down
  const runNow = useMutation({
    mutationFn: async (h: Hunt) => {
      const res = await fetch("/api/search/hunts/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: h.kind, key: h.key }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `${res.status}`);
    },
    onSettled: () => {
      refresh();
      queryClient.invalidateQueries({ queryKey: ["searches"] });
    },
  });
  const deep = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/search/listings/${encodeURIComponent(id)}/deep`, { method: "POST" });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `${res.status}`);
    },
    onSettled: refresh,
  });

  const busyOf = (id: string) =>
    act.isPending && act.variables?.id === id
      ? `status:${String(act.variables.body.status ?? "")}`
      : deep.isPending && deep.variables === id
        ? "deep"
        : queue.isPending && queue.variables === id
          ? "queue"
          : "";
  // new results on their way after a filter changed: the old cards dim under a sweeping bar until they land
  const refilling =
    (listings.isFetching && listings.isPlaceholderData) || (counts.isFetching && counts.isPlaceholderData);

  // a deal's tier is reckoned from the usual price, so its menu counts the loaded cards
  const rows = (listings.data?.listings ?? []).filter((l) => kind === "jobs" || !match || l.deal?.tier === match);
  const tiers: Record<string, number> = {};
  for (const l of listings.data?.listings ?? []) if (l.deal) tiers[l.deal.tier] = (tiers[l.deal.tier] ?? 0) + 1;
  const c = counts.data;
  const failed = [hunts, counts, listings, act, queue, runNow, deep, setMode].find((x) => x.isError);
  const spec = hunt?.specs.find((s) => s.enabled);
  const sources = Object.entries(c?.source ?? {}).sort((a, b) => b[1] - a[1]);
  const groups = Object.entries(c?.group ?? {})
    .filter(([g]) => g)
    .sort((a, b) => b[1] - a[1]);
  const active = [match, group, source].filter(Boolean).length + (sort !== "best" ? 1 : 0);
  const stageName = STAGE_LIST[kind].find(([s]) => s === stage)?.[1] ?? stage;
  const defaultStage = DEFAULT_STAGE[kind];
  const changed = active > 0 || Boolean(q) || stage !== defaultStage;
  // Reset: every filter back to the start, the hunt and the panel as they are
  const reset = () => {
    const next = new URLSearchParams();
    const h = params.get("hunt");
    if (h) next.set("hunt", h);
    setParams(next, { replace: true });
    setLimit(PAGE);
  };
  const status = (l: Listing, s: string) => {
    setMarked((m) => ({ ...m, [l.id]: s }));
    act.mutate({ id: l.id, body: { status: s } });
  };

  return (
    <main className="grid gap-5">
      {hunt && (
        <header className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-cond m-0 mr-1 text-[34px] font-bold uppercase leading-none tracking-tight md:text-[44px]">
              {hunt.name}
            </h2>
            {hunt.mode && (
              <fieldset className="seg seg-modes" aria-label="This hunt's switch">
                {(["on", "quiet", "paused"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    data-mode={m}
                    aria-pressed={hunt.mode === m}
                    title={MODES[m][1]}
                    disabled={setMode.isPending}
                    onClick={() => setMode.mutate({ kind: hunt.kind, key: hunt.key, mode: m })}
                  >
                    {MODES[m][0]}
                  </button>
                ))}
              </fieldset>
            )}
            {spec && (
              <button
                type="button"
                className="btn btn-head"
                disabled={runNow.isPending || hunt.running > 0}
                onClick={() => runNow.mutate(hunt)}
              >
                {hunt.running > 1
                  ? `Searching… ${hunt.running} to go`
                  : hunt.running === 1 || runNow.isPending
                    ? "Searching…"
                    : "Search now"}
              </button>
            )}
            <Link to={`/searches/settings?new=${kind}`} className="btn btn-head">
              + New hunt
            </Link>
            <Link
              to={
                hunt.specs[0]
                  ? `/searches/settings?spec=${encodeURIComponent(hunt.specs[0].id)}`
                  : `/searches/settings?new=${kind}`
              }
              className="btn btn-head inline-flex items-center gap-2"
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
              Settings
            </Link>
            <button
              type="button"
              className="btn btn-head inline-flex items-center gap-1.5"
              aria-pressed={asking}
              style={asking ? { borderColor: "var(--purple)", color: "var(--purple)" } : undefined}
              onClick={() => setAsking((x) => !x)}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                <path d="M12 2.5c.6 4.6 2.9 6.9 7.5 7.5-4.6.6-6.9 2.9-7.5 7.5-.6-4.6-2.9-6.9-7.5-7.5 4.6-.6 6.9-2.9 7.5-7.5Z" />
              </svg>
              Ask
            </button>
            {/* the other hunts: a menu in the corner, not a row of tabs over the title */}
            {all.length > 1 && (
              <select
                className="btn btn-head ml-auto max-w-full"
                aria-label="Switch hunt"
                value=""
                onChange={(e) => e.target.value && set("hunt", e.target.value)}
              >
                <option value="">Switch hunt</option>
                {all.map((h) => (
                  <option key={`${h.kind}:${h.key}`} value={`${h.kind}:${h.key}`} disabled={h === hunt}>
                    {h.name} · {h.count}
                  </option>
                ))}
              </select>
            )}
          </div>
          {asking && (
            <Ask
              app="searches"
              refId={`${hunt.kind}:${hunt.key}`}
              title={`Ask about ${hunt.name}`}
              placeholder={kind === "jobs" ? "Find, compare, mark or apply in words" : "Find, compare or mark in words"}
              starters={
                kind === "jobs"
                  ? [
                      "Which ones should I apply to first?",
                      "Find the remote ones that pay the most",
                      "What do the best ones have in common?",
                    ]
                  : [
                      "Which deal is the best value?",
                      "Find the cheapest ones in good condition",
                      "What is a fair price here?",
                    ]
              }
              onChange={refresh}
            />
          )}
          {(hunt.about || kind === "deals") && (
            <p className="m-0 max-w-4xl text-[16.5px] leading-relaxed" style={{ color: "var(--muted)" }}>
              {hunt.about || (groups.length ? `${groups.length} models: ${groups.map(([g]) => g).join(", ")}.` : "")}
            </p>
          )}
          <p className="font-mono m-0 max-w-4xl text-[13.5px] leading-relaxed" style={{ color: "var(--muted)" }}>
            <span className={`chip chip-caps ${kind === "jobs" ? "tone-accent" : "tone-orange"} mr-2`}>
              {kind === "jobs" ? "Jobs" : "Used deals"}
            </span>
            <StatusLine hunt={hunt} mirror={hunts.data?.mirror} />
          </p>
        </header>
      )}

      <section className="card relative grid gap-2.5 overflow-hidden !p-3">
        {refilling && <div className="loading-bar absolute inset-x-0 bottom-0 !rounded-none" aria-hidden="true" />}
        <div className="flex gap-2">
          <input
            type="search"
            className="btn min-w-0 flex-1"
            placeholder={kind === "jobs" ? "Search title, company, location or note" : "Search title, area or note"}
            value={q}
            onChange={(e) => set("q", e.target.value)}
          />
          {/* the round Reset: always there, lit when a filter differs from how the page opens */}
          <button
            type="button"
            className="btn grid shrink-0 place-items-center !rounded-full !p-0"
            style={{
              width: 38,
              height: 38,
              opacity: changed ? 1 : 0.45,
              color: changed ? "var(--accent)" : undefined,
            }}
            disabled={!changed}
            onClick={reset}
            aria-label="Reset the filters"
            title="Reset the filters"
          >
            <svg
              viewBox="0 0 24 24"
              width="17"
              height="17"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 1 0 3-6.7" />
              <path d="M3 4v5h5" />
            </svg>
          </button>
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
        {/* folded, the panel still says what is picked: each a pill that opens the filters again */}
        {!shown && (
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={`pill ${STAGE_TONE[stage] ?? ""}`} aria-pressed onClick={() => fold(true)}>
              {STAGE_TONE[stage] && <span className="dot" />} {stageName} <b>{c?.stages[stage] ?? 0}</b>
            </button>
            {match && (
              <button
                type="button"
                className={`pill ${(kind === "jobs" ? MATCH[match]?.tone : DEAL[match]?.tone) ?? ""}`}
                aria-pressed
                onClick={() => fold(true)}
              >
                <span className="dot" /> {(kind === "jobs" ? MATCH[match]?.label : DEAL[match]?.label) ?? match}
              </button>
            )}
            {group && (
              <button type="button" className="pill" aria-pressed onClick={() => fold(true)}>
                {group}
              </button>
            )}
            {source && (
              <button type="button" className="pill" aria-pressed onClick={() => fold(true)}>
                {source}
              </button>
            )}
            <button type="button" className="pill" aria-pressed onClick={() => fold(true)}>
              {SORTS[kind].find(([k]) => k === sort)?.[1] ?? sort}
            </button>
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

      <section
        className={`grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 ${refilling ? "busy" : ""}`}
        aria-busy={refilling || listings.isLoading}
      >
        {/* the first load: the shape of the cards to come */}
        {listings.isLoading &&
          ["a", "b", "c", "d", "e", "f"].map((k) => (
            <div key={k} className="card skeleton grid content-start gap-3" style={{ minHeight: 260 }} />
          ))}
        {rows.map((raw) => {
          const l = marked[raw.id] ? { ...raw, status: marked[raw.id] } : raw;
          return (
            <Swipe
              key={l.id}
              onRight={() => status(l, "interested")}
              onLeft={() => status(l, "passed")}
              leftLabel={kind === "jobs" ? "Not for me" : "Not interested"}
            >
              <div className={l.id === last ? "last-opened" : "grid"}>
                {l.id === last && <span className="last-badge">Last opened</span>}
                {l.kind === "deals" ? (
                  <DealCard
                    l={l}
                    onOpen={() => setOpen(l.id)}
                    onStatus={(s) => status(l, s)}
                    onDeep={() => deep.mutate(l.id)}
                    busy={busyOf(l.id)}
                  />
                ) : (
                  <JobCard
                    l={l}
                    onOpen={() => setOpen(l.id)}
                    onStatus={(s) => status(l, s)}
                    onQueue={() => queue.mutate(l.id)}
                    onDeep={() => deep.mutate(l.id)}
                    busy={busyOf(l.id)}
                  />
                )}
              </div>
            </Swipe>
          );
        })}
      </section>
      {listings.data && !refilling && rows.length === 0 && (
        <p className="m-0 text-sm" style={{ color: "var(--muted)" }}>
          Nothing here{q || source || group || match ? " with these filters" : ""}.
        </p>
      )}
      {listings.data && listings.data.listings.length >= limit && (
        <button type="button" className="btn justify-self-center" onClick={() => setLimit((n) => n + PAGE)}>
          Show more
        </button>
      )}
      {open && (
        <ListingSheet
          id={open}
          onClose={() => {
            setOpen(null);
            if (params.get("open")) {
              const next = new URLSearchParams(params);
              next.delete("open");
              setParams(next, { replace: true });
            }
          }}
        />
      )}
    </main>
  );
}
