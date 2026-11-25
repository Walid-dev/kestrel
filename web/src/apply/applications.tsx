// Applications: what happened after sending (the job stages: interviewing, offers, rejections, waiting) and this
// week's sent and stopped, as one strip of figures under the title; then the filter card (the words, the states with
// their numbers — needs me, being applied, queued, not sent, sent — and the period) and the attempts of the state I
// pick, newest first, each a card on Searches' anatomy. An attempt opens its listing whole. Live through the events
// stream; the phone can ask to be told, from the page's foot.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { Ask } from "../ask.tsx";
import { useEvents } from "../events.ts";
import { ago, day, stageOf } from "../search/cards.tsx";
import { ListingSheet } from "../search/sheet.tsx";
import { Card } from "../ui/card.tsx";
import { EmptyState } from "../ui/empty.tsx";
import { Figure, Figures } from "../ui/figures.tsx";
import { FilterPanel, FilterRow } from "../ui/filters.tsx";
import { Page } from "../ui/page.tsx";
import { Pills, type Tone } from "../ui/pills.tsx";
import { SectionHead } from "../ui/section.tsx";
import { Seg } from "../ui/seg.tsx";

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

// each state in its one colour: needs me pink, at work green, as on every page
const STATES: { state: string; title: string; tone: Tone; what: string }[] = [
  { state: "needs-me", title: "Needs me", tone: "pink", what: "A step only I can do." },
  { state: "applying", title: "Applying now", tone: "green", what: "An agent is on the form." },
  { state: "queued", title: "Queued", tone: "muted", what: "Starts by itself once nothing else is at work." },
  { state: "not-sent", title: "Not sent", tone: "orange", what: "Stopped before sending, with why." },
  { state: "sent", title: "Sent", tone: "accent", what: "The form went through." },
];
const PERIODS = [
  ["7", "This week"],
  ["30", "30 days"],
  ["all", "All time"],
] as const;
const PAGE = 60;
// what happened after sending, from the jobs' own stages: each figure in its stage's colour (Searches' STAGES), the
// waiting ones being the jobs still at Applied
const AFTER: { status: string; label: string; hint: string }[] = [
  { status: "interviewing", label: "Interviewing", hint: "Jobs at the Interviewing stage" },
  { status: "offer", label: "Offers", hint: "Jobs at the Offer stage" },
  { status: "rejected", label: "Rejected", hint: "Jobs at the Rejected stage" },
  { status: "applied", label: "Waiting", hint: "Sent, still waiting for an answer" },
];

export function Applications() {
  const queryClient = useQueryClient();
  const [told, setTold] = useState(typeof Notification !== "undefined" && Notification.permission === "granted");
  const [pick, setPick] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<"7" | "30" | "all">("all");
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
  // an application left waiting for me at the computer, which I finished there myself
  const sent = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/apply/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, state: "sent" }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `${res.status}`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["apply"] }),
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
  const shown = STATES.find((x) => x.state === state);
  // the picked state, then the words and the period
  const since = period === "all" ? 0 : Date.now() - Number(period) * 86_400_000;
  const needle = q.trim().toLowerCase();
  const rows = (lists.data?.byState[state] ?? []).filter(
    (a) =>
      Date.parse(a.updated) >= since && (!needle || `${a.title} ${a.org} ${a.reason}`.toLowerCase().includes(needle)),
  );
  const week = Date.now() - 7 * 86_400_000;
  const all = Object.values(lists.data?.byState ?? {}).flat();
  const sentWeek = all.filter((a) => a.state === "sent" && Date.parse(a.updated) >= week).length;
  const stoppedWeek = all.filter((a) => a.state === "not-sent" && Date.parse(a.updated) >= week).length;
  const s = after.data?.status ?? {};
  const failed = [lists, retry, sent].find((x) => x.isError);
  // the newest attempt's time, the one fact the figures don't say
  const latest = all.reduce<string>((a, x) => (x.updated > a ? x.updated : a), "");
  // a filter differs from how the page opens (the state it picks by itself, every period, no words)
  const changed = q !== "" || period !== "all" || pick !== null;

  return (
    <Page
      app="Applications"
      eyebrow="Jobs"
      title="Applications"
      line={
        lists.data &&
        (all.length ? (
          <>
            <b className="font-mono text-ink">{all.length}</b> {all.length === 1 ? "application" : "applications"} · the
            last <b className="text-ink">{ago(latest)}</b>
          </>
        ) : (
          "No applications yet."
        ))
      }
      actions={
        <Link to="/searches" className="btn">
          Find jobs
        </Link>
      }
    >
      {/* what happened after sending, then this week: one strip, each figure in its stage's or its state's colour */}
      <Figures label="After sending, and this week">
        {AFTER.map((f) => (
          <Figure
            key={f.status}
            label={f.label}
            tone={stageOf("jobs", f.status).tone}
            value={s[f.status] ?? 0}
            quiet={!s[f.status]}
            hint={f.hint}
          />
        ))}
        <Figure
          label="Sent"
          tone="accent"
          value={sentWeek}
          quiet={!sentWeek}
          note="this week"
          hint="Applications sent in the last 7 days"
        />
        <Figure
          label="Stopped"
          tone="orange"
          value={stoppedWeek}
          quiet={!stoppedWeek}
          note="this week"
          hint="Applications stopped before sending in the last 7 days"
        />
      </Figures>

      {/* Searches' filter card: the words, then the states with their numbers and the period, a row each */}
      <FilterPanel
        find={{
          label: "Search title, company or reason",
          value: q,
          onChange: (v) => {
            setQ(v);
            setLimit(PAGE);
          },
        }}
        changed={changed}
        onReset={() => {
          setQ("");
          setPeriod("all");
          setPick(null);
          setLimit(PAGE);
        }}
      >
        <FilterRow label="State">
          <Pills
            label="State"
            options={STATES.map((x) => ({ value: x.state, label: x.title, tone: x.tone, count: counts[x.state] ?? 0 }))}
            value={state}
            onChange={(v) => {
              setPick(v);
              setLimit(PAGE);
            }}
          />
        </FilterRow>
        <FilterRow label="Period">
          <Seg
            label="Period"
            options={PERIODS.map(([k, label]) => ({ value: k, label }))}
            value={period}
            onChange={setPeriod}
          />
        </FilterRow>
      </FilterPanel>

      {failed && <p className="m-0 text-detail text-red">{String((failed.error as Error).message)}</p>}

      <section className="grid gap-3" aria-labelledby="apply-state">
        <SectionHead id="apply-state" title={shown?.title} count={rows.length} tone={shown?.tone} hint={shown?.what} />
        {lists.data && rows.length === 0 && (
          <EmptyState
            title="Nothing here right now."
            line={
              needle && period !== "all"
                ? "Other words or a longer period may find some."
                : needle
                  ? "Other words may find some."
                  : period !== "all"
                    ? "A longer period may find some."
                    : undefined
            }
          />
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {rows.slice(0, limit).map((a) => {
            const st = STATES.find((x) => x.state === a.state);
            return (
              // Searches' card: the state's chip on the left, when at the right end; the company, who works on it
              // (its agent, the value bold) and why it stopped or waits; the posting and the one step it needs last
              <Card
                key={a.id}
                tone={a.state === "needs-me" ? "pink" : undefined}
                title={a.title || a.link}
                // the title opens the listing whole, here; the posting has its own button
                onOpen={a.listing ? () => a.listing && setOpen(a.listing) : undefined}
                meta={<span className={`chip chip-caps tone-${st?.tone ?? "muted"}`}>{st?.title ?? a.state}</span>}
                end={
                  <span title={new Date(a.updated).toLocaleString()}>
                    {ago(a.updated)} · {day(a.updated)}
                  </span>
                }
                actions={
                  <>
                    <a href={a.link} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
                      The posting ↗
                    </a>
                    {a.state === "needs-me" && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={sent.isPending}
                        onClick={() => sent.mutate(a.id)}
                      >
                        I sent it
                      </button>
                    )}
                    {a.state === "not-sent" && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={retry.isPending}
                        onClick={() => retry.mutate(a.id)}
                      >
                        Retry
                      </button>
                    )}
                  </>
                }
              >
                {a.org && <p className="m-0 text-ink">{a.org}</p>}
                {a.agent && (
                  <p className="m-0 text-small">
                    By <b className="font-mono text-ink">{a.agent}</b>
                  </p>
                )}
                {/* why it stopped or waits: an inner block (the card's edge already says it needs me) */}
                {a.reason && <p className="inner m-0 mt-2 text-ink">{a.reason}</p>}
              </Card>
            );
          })}
        </div>
        {rows.length > limit && (
          <button type="button" className="btn justify-self-center" onClick={() => setLimit((n) => n + PAGE)}>
            Show more
          </button>
        )}
      </section>
      {/* Ask, the page wide at its foot: about the applications; Retry for one that stopped comes as a card */}
      <Ask
        app="applications"
        refId="applications"
        title="Ask about my applications"
        placeholder="Ask why one stopped, or what to retry"
        starters={[
          "Why did the last ones stop?",
          "Which should I retry first?",
          "What do the sent ones have in common?",
        ]}
        onChange={() => queryClient.invalidateQueries({ queryKey: ["apply"] })}
      />
      {/* the rare action, at the page's foot, as News' Make it now: a plain button */}
      {!told && typeof Notification !== "undefined" && (
        <button
          type="button"
          className="btn justify-self-start"
          onClick={async () => setTold((await Notification.requestPermission()) === "granted")}
        >
          Notify this phone
        </button>
      )}
      {open && <ListingSheet id={open} onClose={() => setOpen(null)} />}
    </Page>
  );
}
