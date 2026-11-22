// Live, the old setup's: what runs now, step by step — a search, a deep check, a model writing, an agent applying, an
// application waiting for me — each with its timer and its steps (the time small, before the text). Nothing running:
// it says so, with the last thing that finished. History is the last day, each item folded to what it did last.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useEvents } from "./events.ts";
import { ago } from "./search/cards.tsx";
import { ListingSheet } from "./search/sheet.tsx";

type Activity = {
  id: string;
  kind: string;
  title: string;
  link: string;
  started: string;
  steps: { at: string; text: string }[];
  ended: string | null;
  outcome: "done" | "failed" | null;
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
  agent: string;
  started: string;
  updated: string;
};
type Live = { at: string; now: Activity[]; apps: App[]; recent: Activity[]; ends: App[] };

const KIND: Record<string, [string, string]> = {
  search: ["Search", "tone-purple"],
  deep: ["Deep check", "tone-accent"],
  model: ["Model", "tone-yellow"],
  mirror: ["Mirror", "tone-muted"],
  backup: ["Copy", "tone-muted"],
};
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const length = (from: string, to: string | number) => {
  const s = Math.max(0, Math.round(((typeof to === "number" ? to : Date.parse(to)) - Date.parse(from)) / 1000));
  return s < 60
    ? `${s}s`
    : s < 3600
      ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`
      : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
};
// a link inside kestrel opens its listing in place when it names one
const opener = (link: string) => new URLSearchParams(link.split("?")[1] ?? "").get("open");

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

export function LivePage() {
  const queryClient = useQueryClient();
  const [showHistory, setHistory] = useState(location.hash === "#history");
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
  useEvents((p) => {
    if (p.kind === "live" || p.kind === "apply") queryClient.invalidateQueries({ queryKey: ["live"] });
  });
  // the timers move every second while something works
  useEffect(() => {
    if (!live.data?.now.length) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [live.data?.now.length]);
  // the address keeps the view, so Back and a shared link land where I was
  useEffect(() => {
    const want = showHistory ? "#history" : "";
    if (location.hash !== want) replaceHash(want);
  }, [showHistory]);

  const d = live.data;
  const busy = (d?.now.length ?? 0) + (d?.apps.filter((a) => a.state !== "queued").length ?? 0);
  const last = d?.recent[0];
  const openLink = (link: string) => {
    const id = opener(link);
    if (id) setOpen(id);
  };

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-4">
      <div className="flex items-center gap-2">
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {d ? `Updated ${clock(d.at)}` : ""}
        </span>
        <button type="button" className="btn ml-auto" aria-pressed={showHistory} onClick={() => setHistory((h) => !h)}>
          {showHistory ? "← Now" : "The last 24 hours"}
        </button>
      </div>
      {live.isError && (
        <p className="m-0 text-sm" style={{ color: "var(--red)" }}>
          {String((live.error as Error).message)}
        </p>
      )}

      {!showHistory && d && (
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
                {a.link &&
                  (opener(a.link) ? (
                    <button type="button" className="btn btn-quiet ml-auto" onClick={() => openLink(a.link)}>
                      Open
                    </button>
                  ) : (
                    <Link to={a.link} className="btn btn-quiet ml-auto">
                      Open
                    </Link>
                  ))}
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
              <div className="card flex items-center gap-3 !py-3">
                <span className="min-w-0 flex-1 truncate">{last.title}</span>
                <span className={`chip ${last.outcome === "failed" ? "tone-red" : "tone-muted"}`}>
                  {last.outcome === "failed" ? "Stopped" : "Done"}
                </span>
                <span className="font-mono text-[12px]" style={{ color: "var(--muted)" }}>
                  {last.ended ? clock(last.ended) : ""}
                </span>
              </div>
              <button
                type="button"
                className="justify-self-center text-sm underline"
                style={{ color: "var(--accent)" }}
                onClick={() => setHistory(true)}
              >
                See the last 24 hours
              </button>
            </section>
          )}
        </>
      )}

      {showHistory && d && (
        <section className="grid gap-2">
          <h2 className="font-cond m-0 text-[24px] font-bold">The last 24 hours</h2>
          {d.ends.map((a) => (
            <div key={a.id} className="card flex flex-wrap items-center gap-3 !py-3">
              <span className={`chip ${a.state === "sent" ? "tone-green" : "tone-orange"}`}>
                {a.state === "sent" ? "Applied" : "Not sent"}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {a.title} <span style={{ color: "var(--muted)" }}>· {a.org}</span>
              </span>
              <span className="font-mono text-[12px]" style={{ color: "var(--muted)" }}>
                {ago(a.updated)}
              </span>
            </div>
          ))}
          {d.recent.map((a) => (
            <details key={a.id} className="card !py-3">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3">
                <span className={`chip chip-caps ${KIND[a.kind]?.[1] ?? "tone-muted"}`}>
                  {KIND[a.kind]?.[0] ?? a.kind}
                </span>
                <span className="min-w-0 flex-1 truncate">{a.title}</span>
                <span className="dot" style={{ background: a.outcome === "failed" ? "var(--red)" : "var(--green)" }} />
                <span className="font-mono text-[12px]" style={{ color: "var(--muted)" }}>
                  {clock(a.started)}
                  {a.ended && ` · ${length(a.started, a.ended)}`}
                </span>
              </summary>
              <div className="grid gap-2 pt-3">
                {a.note && (
                  <p className="m-0 text-sm" style={{ color: "var(--red)" }}>
                    {a.note}
                  </p>
                )}
                <Steps steps={a.steps} />
              </div>
            </details>
          ))}
          {d.recent.length === 0 && d.ends.length === 0 && (
            <p className="m-0 text-sm" style={{ color: "var(--muted)" }}>
              Nothing ran in the last day.
            </p>
          )}
        </section>
      )}
      {open && <ListingSheet id={open} onClose={() => setOpen(null)} />}
    </main>
  );
}

const replaceHash = (hash: string) =>
  window.history.replaceState(null, "", `${location.pathname}${location.search}${hash}`);
