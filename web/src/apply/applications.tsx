// Applications: the numbers first — sent, not sent, waiting on me, being applied, queued — then what happened after
// sending (the job stages: interviewing, offers, rejections), this week's count, and the attempts of the state I pick,
// newest first. An attempt opens its listing whole. Live through the events stream; the phone can ask to be told.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { useEvents } from "../events.ts";
import { ago, day } from "../search/cards.tsx";
import { ListingSheet } from "../search/sheet.tsx";

type Application = {
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
type Lists = { byState: Record<string, Application[]>; counts: Record<string, number> };

const STATES: { state: string; title: string; tone: string; what: string }[] = [
  { state: "needs-me", title: "Needs me", tone: "tone-pink", what: "a step only I can do" },
  { state: "applying", title: "Applying now", tone: "tone-purple", what: "an agent is on the form" },
  { state: "queued", title: "Queued", tone: "tone-muted", what: "waiting for an agent" },
  { state: "not-sent", title: "Not sent", tone: "tone-orange", what: "stopped before sending, with why" },
  { state: "sent", title: "Sent", tone: "tone-accent", what: "the form went through" },
];
const PAGE = 60;

export function Applications() {
  const queryClient = useQueryClient();
  const [told, setTold] = useState(typeof Notification !== "undefined" && Notification.permission === "granted");
  const [pick, setPick] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const lists = useQuery({
    queryKey: ["apply"],
    queryFn: async () => {
      const res = await fetch("/api/apply");
      if (!res.ok) throw new Error(`the applications didn't load (${res.status})`);
      return (await res.json()) as Lists;
    },
  });
  // what happened after sending lives on the jobs: their stages
  const after = useQuery({
    queryKey: ["search-counts", "kind=jobs"],
    queryFn: async () => {
      const res = await fetch("/api/search/counts?kind=jobs");
      if (!res.ok) throw new Error(`${res.status}`);
      return (await res.json()) as { status: Record<string, number> };
    },
  });
  useEvents((p) => {
    if (p.kind === "apply") queryClient.invalidateQueries({ queryKey: ["apply"] });
  });
  const retry = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/apply/retry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `${res.status}`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["apply"] }),
  });

  const counts = lists.data?.counts ?? {};
  const state =
    pick ?? ((counts["needs-me"] ?? 0) > 0 ? "needs-me" : (counts["not-sent"] ?? 0) > 0 ? "not-sent" : "sent");
  const rows = lists.data?.byState[state] ?? [];
  const week = Date.now() - 7 * 86_400_000;
  const all = Object.values(lists.data?.byState ?? {}).flat();
  const sentWeek = all.filter((a) => a.state === "sent" && Date.parse(a.updated) >= week).length;
  const stoppedWeek = all.filter((a) => a.state === "not-sent" && Date.parse(a.updated) >= week).length;
  const s = after.data?.status ?? {};
  const failed = [lists, retry].find((x) => x.isError);

  return (
    <main className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-cond m-0 text-[34px] font-bold uppercase leading-none tracking-tight">Applications</h2>
        <Link to="/searches" className="btn btn-quiet">
          Find jobs to queue →
        </Link>
        {!told && typeof Notification !== "undefined" && (
          <button
            type="button"
            className="btn ml-auto"
            onClick={async () => setTold((await Notification.requestPermission()) === "granted")}
          >
            Tell me on this phone
          </button>
        )}
      </div>

      <section className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {STATES.map((x) => (
          <button
            key={x.state}
            type="button"
            className={`card ${x.tone} grid gap-1 text-left`}
            style={
              state === x.state
                ? { borderColor: "var(--tone)", boxShadow: "0 0 0 1px var(--tone)" }
                : { cursor: "pointer" }
            }
            onClick={() => {
              setPick(x.state);
              setLimit(PAGE);
            }}
          >
            <span className="flex items-center gap-2 text-[13px]" style={{ color: "var(--muted)" }}>
              <span className="dot" /> {x.title}
            </span>
            <span className="font-cond text-[34px] font-bold leading-none" style={{ color: "var(--strong)" }}>
              {counts[x.state] ?? 0}
            </span>
            <span className="text-[12px]" style={{ color: "var(--muted)" }}>
              {x.what}
            </span>
          </button>
        ))}
      </section>

      <section className="card flex flex-wrap items-center gap-x-6 gap-y-2 text-[14.5px]">
        <span className="eyebrow">After sending</span>
        <span>
          <b className="font-mono" style={{ color: "var(--orange)" }}>
            {s.interviewing ?? 0}
          </b>{" "}
          interviewing
        </span>
        <span>
          <b className="font-mono" style={{ color: "var(--green)" }}>
            {s.offer ?? 0}
          </b>{" "}
          offers
        </span>
        <span>
          <b className="font-mono" style={{ color: "var(--red)" }}>
            {s.rejected ?? 0}
          </b>{" "}
          rejected
        </span>
        <span>
          <b className="font-mono" style={{ color: "var(--accent)" }}>
            {s.applied ?? 0}
          </b>{" "}
          waiting for an answer
        </span>
        <span className="ml-auto" style={{ color: "var(--muted)" }}>
          This week: <b style={{ color: "var(--text)" }}>{sentWeek}</b> sent,{" "}
          <b style={{ color: "var(--text)" }}>{stoppedWeek}</b> stopped
        </span>
      </section>

      {failed && (
        <p className="m-0 text-sm" style={{ color: "var(--red)" }}>
          {String((failed.error as Error).message)}
        </p>
      )}

      <section className="grid gap-3">
        <h3 className="font-cond m-0 text-xl font-bold">
          {STATES.find((x) => x.state === state)?.title}{" "}
          <span className="font-mono text-sm" style={{ color: "var(--muted)" }}>
            {rows.length}
          </span>
        </h3>
        {lists.data && rows.length === 0 && (
          <p className="m-0 text-sm" style={{ color: "var(--muted)" }}>
            Nothing here right now.
          </p>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {rows.slice(0, limit).map((a) => (
            <article
              key={a.id}
              className={`card grid content-start gap-2 ${a.listing ? "card-link cursor-pointer" : ""}`}
              onClick={() => a.listing && setOpen(a.listing)}
              onKeyDown={(e) => e.key === "Enter" && a.listing && setOpen(a.listing)}
            >
              <div className="flex items-center gap-2">
                <span className={`chip chip-caps ${STATES.find((x) => x.state === a.state)?.tone ?? "tone-muted"}`}>
                  {STATES.find((x) => x.state === a.state)?.title ?? a.state}
                </span>
                <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
                  {ago(a.updated)} · {day(a.updated)}
                </span>
                <span className="eyebrow ml-auto truncate">{a.agent}</span>
              </div>
              <h4 className="font-cond m-0 text-[19px] font-bold leading-tight">
                <a
                  href={a.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                  style={{ color: "var(--strong)", textUnderlineOffset: 3 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {a.title || a.link}
                </a>
              </h4>
              {a.org && (
                <p className="m-0 text-[14px]" style={{ color: "var(--text)" }}>
                  {a.org}
                </p>
              )}
              {a.reason && (
                <p
                  className="m-0 rounded-lg px-3 py-2 text-[13.5px]"
                  style={{ background: a.state === "needs-me" ? "var(--pink-soft)" : "var(--warn-soft)" }}
                >
                  {a.reason}
                </p>
              )}
              {/* biome-ignore lint/a11y/noStaticElementInteractions: the wrapper only stops the card's own tap */}
              <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()} onKeyDown={undefined}>
                <a
                  href={a.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn"
                  style={{ color: "var(--accent)" }}
                >
                  The posting ↗
                </a>
                {a.state === "not-sent" && (
                  <button type="button" className="btn" disabled={retry.isPending} onClick={() => retry.mutate(a.id)}>
                    Retry
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
        {rows.length > limit && (
          <button type="button" className="btn justify-self-center" onClick={() => setLimit((n) => n + PAGE)}>
            Show more
          </button>
        )}
      </section>
      {open && <ListingSheet id={open} onClose={() => setOpen(null)} />}
    </main>
  );
}
