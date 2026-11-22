// Searches: the specs with their last runs and problems on top, then the listings — All by default, filters combine,
// Priority holds what matters through every status, aside folds away.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

type Run = { started: string; found: number; kept: number; problem: string } | null;

// pay, read honestly: a range when both ends exist, the period named when it isn't a year
const payLine = (d: {
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: string | null;
}): string => {
  const lo = d.salaryMin ?? null;
  const hi = d.salaryMax ?? null;
  if (lo === null && hi === null) return "";
  const n = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v));
  const range = lo !== null && hi !== null && lo !== hi ? `${n(lo)}–${n(hi)}` : n(hi ?? lo ?? 0);
  const period = (d.salaryPeriod ?? "").toLowerCase();
  const per = period && !period.includes("year") ? `/${period.replace("ly", "")}` : "";
  return `${range} ${d.salaryCurrency ?? ""}${per}`.trim();
};
type Search = { id: string; name: string; enabled: boolean; everyMinutes: number; lastRun: Run };
type Listing = {
  id: string;
  source: string;
  link: string;
  status: string;
  starred: number | null;
  found: string;
  score: number | null;
  match: string;
  priority: boolean;
  data: {
    title?: string;
    org?: string;
    location?: string;
    salaryMin?: number | null;
    salaryMax?: number | null;
    salaryCurrency?: string | null;
    salaryPeriod?: string | null;
    price?: number | null;
    posted?: string;
    why?: string;
  };
};

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
];
const MATCH_COLOR: Record<string, string> = {
  great: "var(--green)",
  good: "var(--accent)",
  weak: "var(--orange)",
  poor: "var(--muted)",
};
const FOLDED = new Set(["passed", "fake", "closed"]);

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};

export function Searches() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("");
  const [match, setMatch] = useState("");
  const [priority, setPriority] = useState(false);
  const [q, setQ] = useState("");
  const [inSearch, setInSearch] = useState("");
  const [unfold, setUnfold] = useState(false);

  const searches = useQuery({
    queryKey: ["searches"],
    queryFn: async () => {
      const res = await fetch("/api/search");
      if (!res.ok) throw new Error(`the searches didn't load (${res.status})`);
      return (await res.json()) as {
        searches: Search[];
        mirrored: { id: string; listings: number }[];
        problems: string[];
        mirror: Run;
      };
    },
    refetchInterval: 60_000,
  });
  const listings = useQuery({
    queryKey: ["listings", status, match, priority, q, inSearch],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (status) p.set("status", status);
      if (match) p.set("match", match);
      if (priority) p.set("priority", "1");
      if (q) p.set("q", q);
      if (inSearch) p.set("search", inSearch);
      const res = await fetch(`/api/search/listings?${p}`);
      if (!res.ok) throw new Error(`the listings didn't load (${res.status})`);
      return (await res.json()) as { listings: Listing[] };
    },
    refetchInterval: 60_000,
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["searches"] });
    queryClient.invalidateQueries({ queryKey: ["listings"] });
  };
  const act = useMutation({
    mutationFn: async (input: { id: string; body: Record<string, unknown> }) => {
      const res = await fetch(`/api/search/listings/${input.id}`, {
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
      const res = await fetch(`/api/search/run/${id}`, { method: "POST" });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `${res.status}`);
    },
    onSettled: refresh,
  });

  const rows = listings.data?.listings ?? [];
  const folded = status || unfold ? [] : rows.filter((r) => FOLDED.has(r.status));
  const shown = status || unfold ? rows : rows.filter((r) => !FOLDED.has(r.status));

  return (
    <main className="grid gap-3.5">
      <h2 className="font-cond text-xl font-bold">Searches</h2>
      {(searches.data?.searches ?? []).map((s) => (
        <section key={s.id} className="card flex flex-wrap items-center gap-3 py-3">
          <span className="font-cond font-bold">{s.name}</span>
          {s.lastRun ? (
            <span className="font-mono text-xs" style={{ color: s.lastRun.problem ? "var(--warn)" : "var(--muted)" }}>
              {ago(s.lastRun.started)} · {s.lastRun.found} found · {s.lastRun.kept} new
              {s.lastRun.problem && ` · ${s.lastRun.problem}`}
            </span>
          ) : (
            <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
              never ran
            </span>
          )}
          <button type="button" className="btn ml-auto" disabled={runNow.isPending} onClick={() => runNow.mutate(s.id)}>
            {runNow.isPending ? "Running…" : "Run now"}
          </button>
        </section>
      ))}
      {(searches.data?.mirrored ?? []).length > 0 && (
        <section className="card flex flex-wrap items-baseline gap-3">
          <h3 className="font-cond text-lg font-bold">Mirrored from the old setup</h3>
          <span className="font-mono ml-auto text-[11px]" style={{ color: "var(--muted)" }}>
            {searches.data?.mirrored.length} searches · {searches.data?.mirrored.reduce((n, m) => n + m.listings, 0)}{" "}
            listings · no specs yet — the Search filter picks one
          </span>
        </section>
      )}
      {(() => {
        const failed = [searches, listings, act, runNow, queue].find((x) => x.isError);
        return failed ? (
          <p className="text-sm" style={{ color: "var(--red)" }}>
            {String((failed.error as Error).message)}
          </p>
        ) : null;
      })()}
      {searches.data?.mirror && (
        <p
          className="font-mono text-xs"
          style={{ color: searches.data.mirror.problem ? "var(--warn)" : "var(--muted)" }}
        >
          mirror from the old setup: {ago(searches.data.mirror.started)} · {searches.data.mirror.kept} refreshed
          {searches.data.mirror.problem && ` · ${searches.data.mirror.problem}`}
        </p>
      )}
      {(searches.data?.problems ?? []).map((p) => (
        <p key={p} className="rounded-xl px-3 py-2 text-sm" style={{ background: "var(--warn-soft)" }}>
          a search file can't be read — {p}
        </p>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn"
          style={
            priority
              ? { background: "var(--accent-soft)", borderColor: "var(--accent)", color: "var(--accent)" }
              : undefined
          }
          onClick={() => setPriority((v) => !v)}
        >
          ★ Priority
        </button>
        <select className="btn" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">every status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select className="btn" value={match} onChange={(e) => setMatch(e.target.value)} aria-label="Match">
          <option value="">any match</option>
          {["great", "good", "weak", "poor"].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select className="btn" value={inSearch} onChange={(e) => setInSearch(e.target.value)} aria-label="Search">
          <option value="">every search</option>
          {[
            ...new Set([
              ...(searches.data?.searches ?? []).map((s) => s.id),
              ...(searches.data?.mirrored ?? []).map((m) => m.id),
              ...(inSearch ? [inSearch] : []),
            ]),
          ].map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <input
          type="search"
          className="btn min-w-0 flex-1"
          placeholder="a word from the card"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {shown.map((r) => (
        <section key={r.id} className="card grid gap-1.5">
          <div className="flex items-start gap-2">
            <a
              href={r.link}
              target="_blank"
              rel="noopener noreferrer"
              className="font-cond min-w-0 flex-1 text-lg font-bold hover:underline"
            >
              {r.data.title ?? "(untitled)"}
            </a>
            <button
              type="button"
              aria-label={r.priority ? "Leave Priority" : "Star into Priority"}
              className="-m-2 shrink-0 cursor-pointer p-2 text-xl"
              style={{ color: r.priority ? "var(--yellow)" : "var(--muted)" }}
              onClick={() => act.mutate({ id: r.id, body: { starred: r.priority ? 0 : 1 } })}
            >
              {r.priority ? "★" : "☆"}
            </button>
          </div>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {[
              r.data.org,
              r.data.location,
              r.data.price != null ? `$${r.data.price}` : payLine(r.data),
              r.data.posted ? `posted ${r.data.posted}` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="font-mono text-xs" style={{ color: "var(--muted)" }}>
            <span style={{ color: MATCH_COLOR[r.match] ?? "var(--muted)" }}>
              {r.match || "unscored"}
              {r.score !== null && ` ${r.score}`}
            </span>
            {r.data.why && ` · ${r.data.why}`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="font-mono rounded-full px-2 py-0.5 text-[11px]"
              style={{ background: "var(--surface-2)", color: "var(--muted)" }}
            >
              {r.status}
            </span>
            <span className="font-mono text-[11px]" style={{ color: "var(--muted)" }}>
              {r.source} · found {ago(r.found)}
            </span>
            <select
              className="btn ml-auto"
              value={r.status}
              aria-label="Set the status"
              onChange={(e) => act.mutate({ id: r.id, body: { status: e.target.value } })}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => act.mutate({ id: r.id, body: { status: r.status === "passed" ? "new" : "passed" } })}
            >
              {r.status === "passed" ? "Back in" : "Aside"}
            </button>
            {!["applied", "interviewing", "offer", "passed", "fake", "closed"].includes(r.status) && (
              <button
                type="button"
                className="btn"
                title={queue.isError ? queue.error.message : "Queue this job for the apply agent"}
                onClick={() => queue.mutate(r.id)}
              >
                Queue to apply
              </button>
            )}
          </div>
        </section>
      ))}
      {rows.length === 0 && listings.data && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Nothing here yet{priority || status || match || q || inSearch ? " with these filters" : ""}.
        </p>
      )}
      {folded.length > 0 && (
        <button type="button" className="btn btn-quiet" onClick={() => setUnfold(true)}>
          {folded.length} set aside, fake or closed — show them
        </button>
      )}
      {unfold && !status && (
        <button type="button" className="btn btn-quiet" onClick={() => setUnfold(false)}>
          fold them away again
        </button>
      )}
    </main>
  );
}
