// Applications: what happened after sending (the job stages: interviewing, offers, rejections) and this week's count in
// one line under the title; then the words, the period and the states with their numbers — sent, not sent, waiting
// on me, being applied, queued — and the attempts of the state I pick, newest first. An attempt opens its listing
// whole. Live through the events stream; the phone can ask to be told, from the page's foot.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { Ask } from "../ask.tsx";
import { useEvents } from "../events.ts";
import { ago, day } from "../search/cards.tsx";
import { ListingSheet } from "../search/sheet.tsx";
import { Card } from "../ui/card.tsx";
import { EmptyState } from "../ui/empty.tsx";
import { Field } from "../ui/field.tsx";
import { Page } from "../ui/page.tsx";
import { Pills, type Tone } from "../ui/pills.tsx";
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

// a count in the line under the title: mono, in the ink
const Num = ({ n }: { n: number | undefined }) => <b className="font-mono text-ink">{n ?? 0}</b>;

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

  return (
    <Page
      title="Applications"
      // what happened after sending, then this week, quiet: each sentence its own line where there is room, one flow
      // on a phone; this week's words never part, so a wrap never leaves a word or two alone
      line={
        <span className="block text-small">
          <span className="md:block">
            After sending: <Num n={s.interviewing} /> interviewing · <Num n={s.offer} /> offers · <Num n={s.rejected} />{" "}
            rejected · <Num n={s.applied} /> waiting for an answer.
          </span>{" "}
          <span className="whitespace-nowrap">
            This week: <Num n={sentWeek} /> sent, <Num n={stoppedWeek} /> stopped.
          </span>
        </span>
      }
      actions={
        <Link to="/searches" className="btn">
          Find jobs
        </Link>
      }
    >
      {/* the words and the period on one row (wrapping on a phone), the states under them */}
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-[1_1_16rem]">
            <Field
              label="Search title, company or reason"
              value={q}
              onChange={(v) => {
                setQ(v);
                setLimit(PAGE);
              }}
            />
          </div>
          <Seg
            label="Period"
            options={PERIODS.map(([k, label]) => ({ value: k, label }))}
            value={period}
            onChange={setPeriod}
          />
        </div>
        <Pills
          label="State"
          options={STATES.map((x) => ({ value: x.state, label: x.title, tone: x.tone, count: counts[x.state] ?? 0 }))}
          value={state}
          onChange={(v) => {
            setPick(v);
            setLimit(PAGE);
          }}
        />
      </div>

      {failed && <p className="m-0 text-detail text-red">{String((failed.error as Error).message)}</p>}

      <section className="grid gap-3">
        <div className="grid gap-1">
          <h2 className="font-cond m-0 text-section">
            {shown?.title} <span className="font-mono text-small text-muted">{rows.length}</span>
          </h2>
          {shown && <p className="m-0 text-small text-muted">{shown.what}</p>}
        </div>
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
              <Card
                key={a.id}
                tone={a.state === "needs-me" ? "pink" : undefined}
                title={a.title || a.link}
                // the title opens the listing whole, here; the posting has its own button
                onOpen={a.listing ? () => a.listing && setOpen(a.listing) : undefined}
                meta={
                  <>
                    <span className={`chip chip-caps tone-${st?.tone ?? "muted"}`}>{st?.title ?? a.state}</span>
                    <span className="text-small text-muted">
                      {ago(a.updated)} · {day(a.updated)}
                    </span>
                    {a.agent && <span className="eyebrow ml-auto truncate">{a.agent}</span>}
                  </>
                }
              >
                <div className="grid gap-3">
                  {(a.org || a.reason) && (
                    <div className="grid gap-2">
                      {a.org && <p className="m-0 text-ink">{a.org}</p>}
                      {/* why it stopped or waits: an inner block (the card's edge already says it needs me) */}
                      {a.reason && <p className="inner m-0 text-ink">{a.reason}</p>}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={a.link} target="_blank" rel="noopener noreferrer" className="btn">
                      The posting ↗
                    </a>
                    {a.state === "needs-me" && (
                      <button type="button" className="btn" disabled={sent.isPending} onClick={() => sent.mutate(a.id)}>
                        I sent it
                      </button>
                    )}
                    {a.state === "not-sent" && (
                      <button
                        type="button"
                        className="btn"
                        disabled={retry.isPending}
                        onClick={() => retry.mutate(a.id)}
                      >
                        Retry
                      </button>
                    )}
                  </div>
                </div>
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
      {/* the rare action, at the page's foot: a ghost, its words on the page's edge (pulled back by its padding, 12,
          or 14 on touch, and its 1 px edge) */}
      {!told && typeof Notification !== "undefined" && (
        <button
          type="button"
          className="btn btn-quiet -ms-[13px] justify-self-start pointer-coarse:-ms-[15px]"
          onClick={async () => setTold((await Notification.requestPermission()) === "granted")}
        >
          Notify this phone
        </button>
      )}
      {open && <ListingSheet id={open} onClose={() => setOpen(null)} />}
    </Page>
  );
}
