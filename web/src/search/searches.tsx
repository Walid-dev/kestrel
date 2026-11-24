// Searches, the old hunt pages' layout: the head with the hunt's name (a button: it opens the other hunts and a new
// one), New search, its switch, Search now and its settings; one filter panel — the search box on top with the round Reset, then
// the stage, the match, the role or model, the source and the order as pills, each part folding on its own and the
// whole panel too; then the cards. The page opens on To review, best first. A card swipes right for Interested and left for Not for me, has the
// same buttons under it, starts a deep check, and opens the whole listing on a tap.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Ask } from "../ask.tsx";
import { cx } from "../ui/cx.ts";
import { Dialog } from "../ui/dialog.tsx";
import { EmptyState } from "../ui/empty.tsx";
import { Field } from "../ui/field.tsx";
import { Page } from "../ui/page.tsx";
import { Pills, type Tone } from "../ui/pills.tsx";
import { ago, DEAL, DealCard, JobCard, type Listing, MATCH, Swipe, sourceName, stageTone } from "./cards.tsx";
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

// a problem as a chip's word: what a warning is, in one word; its sentence opens on a tap
const flagOf = (problem: string) => (/\b429\b|throttl/i.test(problem) ? "Throttled" : "Problem");
const sentence = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}${/[.!?]$/.test(s) ? "" : "."}`;

// the line under the title: a few facts, values bold (what searches now, the last search and what it found, the next
// one), each warning as a small orange chip, and About, which opens the hunt's own words. A chip or About opens one
// short block under the facts: the warnings in full, what the hunt looks for, the best of the last search
function StatusLine({ hunt, mirror, about }: { hunt: Hunt; mirror?: Run; about: string }) {
  const [more, setMore] = useState(false);
  const l = hunt.last;
  const noun = (n: number) => (hunt.kind === "jobs" ? (n === 1 ? "job" : "jobs") : n === 1 ? "ad" : "ads");
  const warnings: { flag: string; text: string }[] = [];
  if (l?.problem) warnings.push({ flag: flagOf(l.problem), text: sentence(l.problem) });
  else if (!l && mirror?.problem) warnings.push({ flag: flagOf(mirror.problem), text: sentence(mirror.problem) });
  if (l && hunt.mode && hunt.mode !== "paused" && Date.now() - Date.parse(l.at) > 26 * 3600_000)
    warnings.push({
      flag: "Late",
      text: `No search since ${when(l.at)}: it searches only while the Mac is awake and plugged in.`,
    });
  const best = l?.best && `${l.best.title}${l.best.org ? ` at ${l.best.org}` : ""}`;
  const open = (
    <span className="search-facts">
      {hunt.running > 0 && (
        <span className="inline-flex items-center gap-2 text-green">
          <span className="dot tone-green pulse" aria-hidden="true" />
          <b>Searching now{hunt.running > 1 ? `, ${hunt.running} to go` : ""}</b>
        </span>
      )}
      {l ? (
        <span title={best ? `Best: ${best}` : undefined}>
          Last <b className="text-ink">{when(l.at)}</b>: <b className="text-ink">{l.kept}</b> new {noun(l.kept)}
          {l.leftOut > 0 && (
            <>
              , <b className="text-ink">{l.leftOut}</b> left out
            </>
          )}
        </span>
      ) : hunt.mirrored ? (
        <span title="Mirrored nightly from the old setup">
          Mirrored{mirror ? <b className="text-ink"> {ago(mirror.started)}</b> : " nightly"}
        </span>
      ) : (
        <span>No search yet</span>
      )}
      {hunt.mode === "paused" ? (
        <span>
          Next <b className="text-ink">on Search now</b>
        </span>
      ) : (
        hunt.next && (
          <span title="If the Mac is awake and plugged in">
            Next <b className="text-ink">{when(hunt.next)}</b>
          </span>
        )
      )}
      {warnings.map((w) => (
        <button
          key={w.flag}
          type="button"
          className="search-flag chip chip-caps tone-orange"
          aria-expanded={more}
          title={w.text}
          onClick={() => setMore(!more)}
        >
          {w.flag}
        </button>
      ))}
      {(about || best) && (
        <button type="button" className="search-more" aria-expanded={more} onClick={() => setMore(!more)}>
          About
          <span className={cx("text-label transition-transform", more && "rotate-90")} aria-hidden="true">
            ▶
          </span>
        </button>
      )}
    </span>
  );
  return (
    <>
      {open}
      {more && (
        <span className="search-about">
          {warnings.map((w) => (
            <span key={w.flag} className="flex items-start gap-2 text-ink">
              <span className="dot tone-orange" aria-hidden="true" />
              {w.text}
            </span>
          ))}
          {about && <span className="line-clamp-4">{about}</span>}
          {best && (
            <span>
              Best of the last search: <b className="text-ink">{best}</b>
            </span>
          )}
        </span>
      )}
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
    // under a mouse one row: the legend in its own column, the pills beside it; on touch the legend over its pills
    // (styles.css, .search-part)
    <div className={cx("search-part", !open && "search-part-folded")}>
      <button type="button" className="search-part-toggle" onClick={() => toggle(name)} aria-expanded={open}>
        <span className={cx("text-label text-muted transition-transform", open && "rotate-90")} aria-hidden="true">
          ▶
        </span>
        <span className="eyebrow">{label}</span>
        {!open && <span className="text-small text-ink">{value}</span>}
      </button>
      {open && <div className="flex min-w-0 flex-wrap items-start gap-2">{children}</div>}
    </div>
  );
}

const toneClass = (t: Tone | undefined) => (t ? `tone-${t}` : "");
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
const TODO = "kestrel-search-todo";
const SWIPED = "kestrel-search-swiped";
// the listing opened last, kept in this browser (a private window keeps nothing: the mark lasts the visit)
const remember = (id: string) => {
  try {
    localStorage.setItem(LAST, id);
  } catch {
    // storage off
  }
};

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
  // not applied yet (on unless I turn it off): the review views hide a job with an application or applied already
  const [todo, setTodo] = useState(() => {
    try {
      return localStorage.getItem(TODO) !== "off";
    } catch {
      return true;
    }
  });
  const flipTodo = () => {
    setTodo(!todo);
    try {
      localStorage.setItem(TODO, todo ? "off" : "on");
    } catch {
      // a private window keeps nothing: the switch lasts this visit
    }
  };
  // the listing I opened last: its card says so when I come back to the list (kept in this browser)
  const [last, setLast] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST);
    } catch {
      return null;
    }
  });
  const mark = (id: string) => {
    setLast(id);
    remember(id);
  };
  useEffect(() => {
    if (!open) return;
    setLast(open);
    remember(open);
  }, [open]);
  // a card swiped once on this device: the swipe's hint then shows only with the filters open
  const [swiped, setSwiped] = useState(() => {
    try {
      return localStorage.getItem(SWIPED) === "yes";
    } catch {
      return false;
    }
  });
  const [limit, setLimit] = useState(PAGE);
  const [moreGroups, setMoreGroups] = useState(false);
  const [switching, setSwitching] = useState(false);
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
  // the panel as I left it; the first time, open under a mouse and folded on touch, where the cards come first
  const [shown, setShown] = useState(() => {
    let kept: string | null = null;
    try {
      kept = localStorage.getItem(FOLD);
    } catch {
      // storage off: the pointer decides each visit
    }
    return kept ? kept !== "folded" : !matchMedia("(pointer: coarse)").matches;
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
  if (kind === "jobs" && todo) base.set("todo", "1");
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
  const swipe = (l: Listing, s: string) => {
    status(l, s);
    if (swiped) return;
    setSwiped(true);
    try {
      localStorage.setItem(SWIPED, "yes");
    } catch {
      // storage off: the hint shows again next visit
    }
  };

  const matchOf = (m: string) => (kind === "jobs" ? MATCH[m] : DEAL[m]);
  const sortName = SORTS[kind].find(([k]) => k === sort)?.[1] ?? sort;
  const none = hunts.data !== undefined && all.length === 0;

  // nothing until the hunts are known, as before: a stand-in head would jump to the hunt's name, eyebrow and line
  if (hunts.isPending) return null;
  return (
    <Page
      eyebrow={
        hunt && (
          <span className={cx("text-tone", kind === "jobs" ? "tone-accent" : "tone-orange")}>
            {kind === "jobs" ? "Jobs" : "Used deals"}
          </span>
        )
      }
      // the title is the hunt switcher: the hunt's name, a button that opens the other hunts and a new one
      title={
        hunt ? (
          <button type="button" className="hunt-switch" aria-haspopup="dialog" onClick={() => setSwitching(true)}>
            <span>
              {hunt.name}
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path
                  d="m7 10 5 5 5-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
        ) : (
          "Searches"
        )
      }
      line={
        hunt && (
          <StatusLine
            key={`${hunt.kind}:${hunt.key}`}
            hunt={hunt}
            mirror={hunts.data?.mirror}
            about={
              hunt.about ||
              (kind === "deals" && groups.length > 0
                ? `${groups.length} models: ${groups.map(([g]) => g).join(", ")}.`
                : "")
            }
          />
        )
      }
      // New search, then the hunt's controls: its switch, Search now and its settings, one row of 36 on a phone. On a
      // phone that row is full, so New search goes round, top right of the head (styles.css, .hunt-add)
      actions={
        hunt && (
          <>
            <Link
              to={`/searches/settings?new=${kind}`}
              className="btn hunt-add"
              aria-label="New search"
              title="New search: a job hunt or a deal hunt"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span className="hunt-add-words">New search</span>
            </Link>
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
              // its words stay while it searches, a spinner over them, so the row never changes width; the line
              // under the title says Searching now and how many are left
              <button
                type="button"
                className="btn"
                disabled={runNow.isPending || hunt.running > 0}
                aria-busy={runNow.isPending || hunt.running > 0}
                onClick={() => runNow.mutate(hunt)}
              >
                <span className={cx((runNow.isPending || hunt.running > 0) && "opacity-0")}>Search now</span>
                {(runNow.isPending || hunt.running > 0) && <span className="spin absolute inset-0 m-auto" />}
              </button>
            )}
            <Link
              to={
                hunt.specs[0]
                  ? `/searches/settings?spec=${encodeURIComponent(hunt.specs[0].id)}`
                  : `/searches/settings?new=${kind}`
              }
              className="btn btn-icon"
              aria-label="Settings"
              title={hunt.specs[0] ? "Settings" : "Settings: this hunt runs in the old setup, so this makes its search"}
            >
              <svg
                viewBox="0 0 24 24"
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
          </>
        )
      }
    >
      {/* the hunts, from the title: each as a pill, then a new one */}
      {hunt && (
        <Dialog
          open={switching}
          onClose={() => setSwitching(false)}
          title="The hunts"
          actions={
            <>
              <Link to="/searches/settings?new=deals" className="btn">
                + New deal search
              </Link>
              <Link to="/searches/settings?new=jobs" className="btn">
                + New job search
              </Link>
            </>
          }
        >
          <Pills
            label="The hunts"
            options={all.map((h) => ({
              value: `${h.kind}:${h.key}`,
              label: h.name,
              count: h.count,
              tone: h.kind === "jobs" ? "accent" : "orange",
            }))}
            value={`${hunt.kind}:${hunt.key}`}
            onChange={(v) => {
              if (v !== `${hunt.kind}:${hunt.key}`) set("hunt", v);
              setSwitching(false);
            }}
          />
        </Dialog>
      )}
      {/* the same Ask as every page, under the title: closed until I open it from its own head */}
      {hunt && (
        <Ask
          app="searches"
          defaultOpen={false}
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

      {none && (
        <EmptyState
          title="No search yet."
          line="A search looks for jobs or deals on its own, and its finds show here."
          action={
            <Link to="/searches/settings?new=jobs" className="btn btn-primary">
              New search
            </Link>
          }
        />
      )}

      {!none && (
        <section className="card search-filters relative grid gap-3 overflow-hidden">
          {refilling && <div className="loading-bar absolute inset-x-0 bottom-0 !rounded-none" aria-hidden="true" />}
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <Field
                label={kind === "jobs" ? "Search title, company, location or note" : "Search title, area or note"}
                value={q}
                // the whole sentence is its name, read out; the box shows one word, which fits a phone's row
                placeholder="Search"
                onChange={(v) => set("q", v)}
              />
            </div>
            {/* the round Reset: always there, lit when a filter differs from how the page opens */}
            <button
              type="button"
              className="btn btn-icon search-reset shrink-0"
              disabled={!changed}
              onClick={reset}
              aria-label="Reset the filters"
              title="Reset the filters"
            >
              <svg
                viewBox="0 0 24 24"
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
            <div className="search-parts">
              <Part
                name="stage"
                label="Stage"
                value={`${stageName} ${c?.stages[stage] ?? ""}`}
                open={!closed.has("stage")}
                toggle={toggle}
              >
                {/* Not applied yet wraps in line after the stage pills, not on a row of its own (styles.css) */}
                <div className="pills-inline flex flex-wrap items-center gap-2">
                  <Pills
                    label="Stage"
                    options={STAGE_LIST[kind].map(([s, label]) => ({
                      value: s,
                      label,
                      tone: stageTone(kind, s),
                      count: c?.stages[s] ?? 0,
                    }))}
                    value={stage}
                    onChange={(s) => set("stage", s)}
                  />
                  {kind === "jobs" && (
                    <button
                      type="button"
                      className="pill tone-green"
                      aria-pressed={todo}
                      title="Hide the jobs that have an application (queued, sent or not sent) or that I applied to"
                      onClick={flipTodo}
                    >
                      <span className="dot" /> Not applied yet
                    </button>
                  )}
                </div>
              </Part>
              <Part
                name="match"
                label={kind === "jobs" ? "Match" : "Price"}
                value={match ? (matchOf(match)?.label ?? match) : "any"}
                open={!closed.has("match")}
                toggle={toggle}
              >
                <Pills
                  label={kind === "jobs" ? "Match" : "Price"}
                  options={
                    kind === "jobs"
                      ? (["great", "good", "weak", "poor"] as const).map((m) => ({
                          value: m as string,
                          tone: MATCH[m].tone,
                          label: {
                            great: "Great 80+",
                            good: "Good 60–79",
                            weak: "Possible 40–59",
                            poor: "Weak under 40",
                          }[m],
                          count: c?.match[m] ?? 0,
                        }))
                      : (["great", "good", "fair", "over"] as const).map((m) => ({
                          value: m as string,
                          tone: DEAL[m].tone,
                          label: DEAL[m].label,
                          count: tiers[m] ?? 0,
                        }))
                  }
                  value={match || null}
                  onChange={(m) => set("match", match === m ? "" : m)}
                />
              </Part>
              {groups.length > 0 && (
                <Part
                  name="group"
                  label={kind === "jobs" ? "Role" : "Model"}
                  value={group || "every"}
                  open={!closed.has("group")}
                  toggle={toggle}
                >
                  <Pills
                    label={kind === "jobs" ? "Role" : "Model"}
                    options={(moreGroups ? groups : groups.filter(([g, n], i) => i < 12 && (n > 1 || g === group))).map(
                      ([g, n]) => ({ value: g, label: g, count: n }),
                    )}
                    value={group || null}
                    onChange={(g) => set("group", group === g ? "" : g)}
                  />
                  {!moreGroups && groups.length > 12 && (
                    <button type="button" className="btn btn-quiet" onClick={() => setMoreGroups(true)}>
                      +{groups.length - 12} more
                    </button>
                  )}
                </Part>
              )}
              <Part
                name="source"
                label="Source"
                value={source ? sourceName(source) : "all"}
                open={!closed.has("source")}
                toggle={toggle}
              >
                <Pills
                  label="Source"
                  options={sources.map(([s, n]) => ({ value: s, label: sourceName(s), count: n }))}
                  value={source || null}
                  onChange={(s) => set("source", source === s ? "" : s)}
                />
              </Part>
              <Part name="sort" label="Order" value={sortName} open={!closed.has("sort")} toggle={toggle}>
                <Pills
                  label="Order"
                  options={SORTS[kind].map(([k, label]) => ({ value: k, label }))}
                  value={sort}
                  onChange={(k) => set("sort", k)}
                />
              </Part>
            </div>
          )}
          {/* folded, the panel still says what is picked: each a pill that opens the filters again */}
          {!shown && (
            <div className="flex flex-wrap gap-2 pointer-coarse:gap-y-3">
              <button
                type="button"
                className={cx("pill", toneClass(stageTone(kind, stage)))}
                aria-pressed
                onClick={() => fold(true)}
              >
                {stageTone(kind, stage) && <span className="dot" />} {stageName} <b>{c?.stages[stage] ?? 0}</b>
              </button>
              {match && (
                <button
                  type="button"
                  className={cx("pill", toneClass(matchOf(match)?.tone))}
                  aria-pressed
                  onClick={() => fold(true)}
                >
                  <span className="dot" /> {matchOf(match)?.label ?? match}
                </button>
              )}
              {group && (
                <button type="button" className="pill" aria-pressed onClick={() => fold(true)}>
                  {group}
                </button>
              )}
              {source && (
                <button type="button" className="pill" aria-pressed onClick={() => fold(true)}>
                  {sourceName(source)}
                </button>
              )}
              {kind === "jobs" && todo && (
                <button type="button" className="pill tone-green" aria-pressed onClick={() => fold(true)}>
                  <span className="dot" /> Not applied yet
                </button>
              )}
              {/* the order only when it isn't the one the page opens with, as the Filters count reckons it */}
              {sort !== "best" && (
                <button type="button" className="pill" aria-pressed onClick={() => fold(true)}>
                  {sortName}
                </button>
              )}
            </div>
          )}
          {/* the swipe is a touch screen's: under a mouse the card's buttons say it. It shows until the first swipe on
              this device, then only with the filters open, so a folded panel keeps to two rows */}
          <p
            className={cx(
              "m-0 text-small text-muted",
              stage !== "leftout" && "hidden",
              stage !== "leftout" && (shown || !swiped) && "pointer-coarse:block",
            )}
          >
            {stage === "leftout"
              ? "The rules set these aside: a weak match, pay far below the floor, a removed search, an old ad."
              : `Swipe a card right for Interested, left for ${kind === "jobs" ? "Not for me" : "Not interested"}.`}
          </p>
        </section>
      )}

      {failed && <p className="m-0 text-detail text-red">{String((failed.error as Error).message)}</p>}
      {(hunts.data?.problems ?? []).map((p) => (
        <p key={p} className="m-0 rounded-xl bg-warn-soft px-4 py-3 text-detail">
          a search file can't be read — {p}
        </p>
      ))}

      <section
        className={cx("grid gap-3 md:grid-cols-2 lg:grid-cols-3", refilling && "busy")}
        aria-busy={refilling || listings.isLoading}
      >
        {/* the first load: the shape of the cards to come */}
        {listings.isLoading &&
          ["a", "b", "c", "d", "e", "f"].map((k) => <div key={k} className="card skeleton min-h-65" />)}
        {rows.map((raw) => {
          const l = marked[raw.id] ? { ...raw, status: marked[raw.id] } : raw;
          return (
            <Swipe
              key={l.id}
              onRight={() => swipe(l, "interested")}
              onLeft={() => swipe(l, "passed")}
              leftLabel={kind === "jobs" ? "Not for me" : "Not interested"}
            >
              <div
                className={l.id === last ? "last-opened" : "grid"}
                // the posting opened from the card (its title, its link) makes it the last opened too
                onClickCapture={(e) => {
                  if ((e.target as HTMLElement).closest("a[href^='http']")) mark(l.id);
                }}
              >
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
        <EmptyState
          title={`Nothing here${q || source || group || match ? " with these filters" : ""}.`}
          line={
            changed ? "Reset the filters to see the listings to review again." : "New finds show here after a search."
          }
          action={
            changed ? (
              <button type="button" className="btn" onClick={reset}>
                Reset the filters
              </button>
            ) : undefined
          }
        />
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
    </Page>
  );
}
