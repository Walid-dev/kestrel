// Live, the old setup's: Now is what runs this minute, step by step — a search, a deep check, a model writing, an
// agent applying, an application waiting for me — each with its timer and steps; the last thing that finished opens
// its work. Activity is the week: everything that ran and every mark I made (a lesson graded, a task done, a stage
// set, an application sent), by day, each opening the work itself — the listing, the lesson, the task list, the note.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useEvents } from "./events.ts";
import { ListingSheet } from "./search/sheet.tsx";

type Item = {
  id: string;
  kind: string;
  title: string;
  link: string;
  started: string;
  steps: { at: string; text: string }[];
  ended: string | null;
  outcome: string | null;
  note: string;
};
type App = {
  id: string;
  listing: string | null;
  link: string;
  title: string;
  org: string;
  state: string;
  reason: string;
  updated: string;
};
type Live = { at: string; now: Item[]; apps: App[]; recent: Item[] };

const KIND: Record<string, [string, string]> = {
  search: ["Search", "tone-purple"],
  deep: ["Deep check", "tone-accent"],
  model: ["Model", "tone-yellow"],
  mirror: ["Mirror", "tone-muted"],
  backup: ["Copy", "tone-muted"],
  lesson: ["Lesson", "tone-green"],
  task: ["Task", "tone-pink"],
  apply: ["Application", "tone-orange"],
  notes: ["Notes", "tone-accent"],
  listing: ["Listing", "tone-purple"],
};
const FILTERS: [string, string][] = [
  ["", "Everything"],
  ["apply", "Applications"],
  ["listing", "Listings"],
  ["deep", "Deep checks"],
  ["lesson", "Lessons"],
  ["task", "Tasks"],
  ["notes", "Notes"],
  ["search", "Searches"],
  ["model", "Models"],
];
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const dayName = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
};
const length = (from: string, to: string | number) => {
  const s = Math.max(0, Math.round(((typeof to === "number" ? to : Date.parse(to)) - Date.parse(from)) / 1000));
  return s < 60
    ? `${s}s`
    : s < 3600
      ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`
      : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
};

function Steps({ steps }: { steps: { at: string; text: string }[] }) {
  return (
    <ol className="m-0 grid list-none gap-1.5 p-0">
      {steps.map((s) => (
        <li
          key={`${s.at}|${s.text}`}
          className="grid grid-cols-[64px_minmax(0,1fr)] items-baseline gap-2 text-[14.5px]"
        >
          <span className="font-mono text-[11px]" style={{ color: "var(--muted)" }}>
            {clock(s.at)}
          </span>
          <span>{s.text}</span>
        </li>
      ))}
    </ol>
  );
}

function Row({ a, go }: { a: Item; go: (link: string) => void }) {
  return (
    <button
      type="button"
      className="card card-link flex w-full items-center gap-3 !py-3 text-left"
      onClick={() => go(a.link)}
      style={{ cursor: a.link ? "pointer" : "default" }}
    >
      <span className={`chip chip-caps ${KIND[a.kind]?.[1] ?? "tone-muted"}`}>{KIND[a.kind]?.[0] ?? a.kind}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate" style={{ color: "var(--strong)" }}>
          {a.title}
        </span>
        {a.note && (
          <span
            className="block truncate text-[12.5px]"
            style={{ color: a.outcome === "failed" ? "var(--red)" : "var(--muted)" }}
          >
            {a.note}
          </span>
        )}
      </span>
      <span className="dot" style={{ background: a.outcome === "failed" ? "var(--red)" : "var(--green)" }} />
      <span className="font-mono shrink-0 text-[12px]" style={{ color: "var(--muted)" }}>
        {clock(a.ended ?? a.started)}
        {a.ended && a.ended !== a.started && ` · ${length(a.started, a.ended)}`}
      </span>
      {a.link && <span style={{ color: "var(--accent)" }}>→</span>}
    </button>
  );
}

export function LivePage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [view, setView] = useState<"now" | "activity">(location.hash === "#activity" ? "activity" : "now");
  const [kind, setKind] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [, tick] = useState(0);
  const live = useQuery({
    queryKey: ["live"],
    queryFn: async () => {
      const res = await fetch("/api/live");
      if (!res.ok) throw new Error(`Live didn't load (${res.status})`);
      return (await res.json()) as Live;
    },
    refetchInterval: (q) => ((q.state.data?.now.length ?? 0) > 0 ? 3000 : 15000),
  });
  const log = useQuery({
    queryKey: ["live-activity", kind],
    queryFn: async () => {
      const res = await fetch(`/api/live/activity?days=7${kind ? `&kind=${kind}` : ""}`);
      if (!res.ok) throw new Error(`The activity didn't load (${res.status})`);
      return (await res.json()) as { activity: Item[] };
    },
    enabled: view === "activity",
  });
  useEvents((p) => {
    if (p.kind === "live" || p.kind === "apply") {
      queryClient.invalidateQueries({ queryKey: ["live"] });
      queryClient.invalidateQueries({ queryKey: ["live-activity"] });
    }
  });
  useEffect(() => {
    if (!live.data?.now.length) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [live.data?.now.length]);
  // the address keeps the view, so Back and a shared link land where I was
  useEffect(() => {
    const want = view === "activity" ? "#activity" : "";
    if (location.hash !== want) window.history.replaceState(null, "", `${location.pathname}${location.search}${want}`);
  }, [view]);

  // a tap opens the work: a listing in place, anything else on its own page
  const go = (link: string) => {
    if (!link) return;
    const id = new URLSearchParams(link.split("?")[1] ?? "").get("open");
    if (id && link.startsWith("/searches")) setOpen(id);
    else navigate(link);
  };

  const d = live.data;
  const busy = (d?.now.length ?? 0) + (d?.apps.filter((a) => a.state !== "queued").length ?? 0);
  const last = d?.recent[0];
  const days: [string, Item[]][] = [];
  for (const a of log.data?.activity ?? []) {
    const name = dayName(a.ended ?? a.started);
    const at = days.find(([n]) => n === name);
    if (at) at[1].push(a);
    else days.push([name, [a]]);
  }

  return (
    <main className="mx-auto grid w-full max-w-4xl gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="pill" aria-pressed={view === "now"} onClick={() => setView("now")}>
          {busy > 0 && <span className="dot tone-green pulse" />} Now
        </button>
        <button type="button" className="pill" aria-pressed={view === "activity"} onClick={() => setView("activity")}>
          Activity
        </button>
        <span className="ml-auto text-xs" style={{ color: "var(--muted)" }}>
          {d ? `Updated ${clock(d.at)}` : ""}
        </span>
      </div>
      {[live, log].map((x) =>
        x.isError ? (
          <p key={String(x.error)} className="m-0 text-sm" style={{ color: "var(--red)" }}>
            {String((x.error as Error).message)}
          </p>
        ) : null,
      )}

      {view === "now" && d && (
        <>
          {busy === 0 && d.apps.length === 0 && (
            <section className="grid justify-items-center gap-2 py-10 text-center">
              <h2 className="font-cond m-0 text-[26px] font-bold">Nothing is running right now</h2>
              <p className="m-0 text-sm" style={{ color: "var(--muted)" }}>
                A search, a deep check, a model writing or an agent applying shows here while it works, step by step.
              </p>
            </section>
          )}
          {d.now.map((a) => (
            <section
              key={a.id}
              className="card grid gap-3"
              style={{ borderColor: "color-mix(in srgb, var(--green) 45%, var(--line))" }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`chip chip-caps ${KIND[a.kind]?.[1] ?? "tone-muted"}`}>
                  {KIND[a.kind]?.[0] ?? a.kind}
                </span>
                <h3 className="font-cond m-0 min-w-0 flex-1 truncate text-lg font-bold">{a.title}</h3>
              </div>
              <div className="flex items-center gap-2 text-[13px]">
                <span className="dot tone-green pulse" />
                <b style={{ color: "var(--green)" }}>Working</b>
                <span className="font-mono" style={{ color: "var(--muted)" }}>
                  {length(a.started, Date.now())}
                </span>
                {a.link && (
                  <button type="button" className="btn btn-quiet ml-auto" onClick={() => go(a.link)}>
                    Open
                  </button>
                )}
              </div>
              <Steps steps={a.steps} />
            </section>
          ))}
          {d.apps.map((a) => (
            <section
              key={a.id}
              className="card grid gap-2"
              style={a.state === "needs-me" ? { borderColor: "var(--pink)" } : undefined}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`chip chip-caps ${a.state === "needs-me" ? "tone-pink" : a.state === "applying" ? "tone-purple" : "tone-muted"}`}
                >
                  {a.state === "needs-me" ? "Needs me" : a.state === "applying" ? "Applying" : "Queued"}
                </span>
                <h3 className="font-cond m-0 min-w-0 flex-1 truncate text-lg font-bold">{a.title || a.link}</h3>
                <span className="font-mono text-[12px]" style={{ color: "var(--muted)" }}>
                  {length(a.updated, Date.now())}
                </span>
              </div>
              {a.org && <p className="m-0 text-sm">{a.org}</p>}
              {a.reason && (
                <p className="m-0 rounded-lg px-3 py-2 text-[14px]" style={{ background: "var(--pink-soft)" }}>
                  {a.reason}
                </p>
              )}
              <div className="flex gap-2">
                {a.listing && (
                  <button type="button" className="btn" onClick={() => setOpen(a.listing)}>
                    The listing
                  </button>
                )}
                <a
                  href={a.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn"
                  style={{ color: "var(--accent)" }}
                >
                  The page ↗
                </a>
              </div>
            </section>
          ))}
          {busy === 0 && last && (
            <section className="grid gap-2">
              <span className="eyebrow">Last finished</span>
              <Row a={last} go={go} />
              <button
                type="button"
                className="justify-self-center text-sm underline"
                style={{ color: "var(--accent)" }}
                onClick={() => setView("activity")}
              >
                See the whole week
              </button>
            </section>
          )}
        </>
      )}

      {view === "activity" && (
        <section className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map(([k, label]) => (
              <button
                key={k || "all"}
                type="button"
                className="pill"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
              >
                {k && <span className={`dot ${KIND[k]?.[1] ?? "tone-muted"}`} />} {label}
              </button>
            ))}
          </div>
          {days.map(([name, items]) => (
            <div key={name} className="grid gap-2">
              <h3 className="font-cond m-0 mt-2 text-lg font-bold">
                {name}{" "}
                <span className="font-mono text-sm" style={{ color: "var(--muted)" }}>
                  {items.length}
                </span>
              </h3>
              {items.map((a) => (
                <Row key={a.id} a={a} go={go} />
              ))}
            </div>
          ))}
          {log.data && log.data.activity.length === 0 && (
            <p className="m-0 text-sm" style={{ color: "var(--muted)" }}>
              Nothing in the last week{kind ? " of this kind" : ""}.
            </p>
          )}
        </section>
      )}
      {open && <ListingSheet id={open} onClose={() => setOpen(null)} />}
    </main>
  );
}
