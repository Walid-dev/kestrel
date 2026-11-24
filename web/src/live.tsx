// Live, the old setup's: Now is what runs this minute, step by step — a search, a deep check, a model writing, an
// agent applying, an application waiting for me — each with its timer and steps, what needs me first, in a grid of
// cards that uses the width; the last thing that finished opens its work. Activity is the week: everything that ran
// and every mark I made (a lesson graded, a task done, a stage set, an application sent), one list per day read
// straight down, two days side by side on a computer, each row opening the work itself — the listing, the lesson,
// the task list, the note.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { onComputer, useChatLink } from "./chats.tsx";
import { useEvents } from "./events.ts";
import { ListingSheet } from "./search/sheet.tsx";
import { QueuePause, StopChat } from "./stop.tsx";
import { Card } from "./ui/card.tsx";
import { cx } from "./ui/cx.ts";
import { EmptyState } from "./ui/empty.tsx";
import { List, Row } from "./ui/list.tsx";
import { Page } from "./ui/page.tsx";
import { Pills, type Tone } from "./ui/pills.tsx";
import { Seg } from "./ui/seg.tsx";

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
// an agent's chat, from the old setup's Live: its state and its steps (passed, failed with why, asked, waiting…)
type ChatStep = { at: string; kind: string; text: string; why?: string };
type AgentChat = {
  id: string;
  title: string;
  applying: boolean;
  working: boolean;
  waiting: string;
  help: string;
  started: string;
  updated: string;
  steps: ChatStep[];
  job: { title?: string; company?: string } | null;
};
type Live = { at: string; now: Item[]; apps: App[]; chats?: AgentChat[]; paused?: boolean | null; recent: Item[] };

// one line per step, as the old Live has it: a green check for a step that went through, red with its error for one
// that failed, amber for a question or a wait on me, the agent's own words quiet, the last step turning while it works
const MARK: Record<string, [string, string]> = {
  passed: ["✓", "text-green"],
  ok: ["✓", "text-green"],
  done: ["■", "text-muted"],
  did: ["•", "text-muted"],
  failed: ["✕", "text-red"],
  no: ["✕", "text-red"],
  asked: ["?", "text-yellow"],
  wait: ["…", "text-yellow"],
  said: ["“", "text-muted"],
  you: ["›", "text-accent"],
};
// an application's state on its card: needs me in pink, as everywhere; at work green
const APP_STATE: Record<string, [string, Tone]> = {
  "needs-me": ["Needs me", "pink"],
  applying: ["Applying", "green"],
  queued: ["Queued", "muted"],
};
const WORDS: Record<string, string> = { said: "text-muted italic", failed: "text-red" };
const SHOWN = 14;

function AgentSteps({ chat }: { chat: AgentChat }) {
  const [all, setAll] = useState(false);
  const steps = all ? chat.steps : chat.steps.slice(-SHOWN);
  return (
    <div className="grid gap-1">
      {chat.steps.length > SHOWN && !all && (
        <button type="button" className="btn btn-sm btn-quiet justify-self-start" onClick={() => setAll(true)}>
          Show the {chat.steps.length - SHOWN} steps before
        </button>
      )}
      <ol className="m-0 grid list-none gap-1 p-0">
        {steps.map((st, i) => {
          const lastOne = i === steps.length - 1;
          const [mark, colour] = MARK[st.kind] ?? ["•", "text-muted"];
          const turning = lastOne && chat.working && st.kind === "did";
          return (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: a chat's steps only grow at the end
              key={i}
              className="grid grid-cols-[18px_minmax(0,1fr)] items-baseline gap-2 text-detail"
            >
              <span className={`text-center font-semibold ${colour}`} aria-hidden="true">
                {turning ? <span className="spin inline-block" /> : mark}
              </span>
              <span className={WORDS[st.kind] ?? "text-ink"}>{st.kind === "you" ? `You: ${st.text}` : st.text}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// a chat's state in a few words, in its colour (how long it has run, in mono, when the card's meta row doesn't say
// it), the help it asked for on an inner block, then its actions: the way to open it (on a computer in dsh itself, on
// a phone in kestrel's Chat) and Stop while it works or waits
function ChatState({ chat, open, timed = false }: { chat: AgentChat; open: (id: string) => void; timed?: boolean }) {
  return (
    <>
      {chat.waiting && chat.help && <p className="inner m-0 text-ink">{chat.help}</p>}
      <div className="flex flex-wrap items-center gap-2 text-small">
        {chat.working ? (
          <b className="text-green">Working</b>
        ) : chat.waiting ? (
          <b className={chat.waiting === "you" ? "text-pink" : "text-yellow"}>Waiting for {chat.waiting}</b>
        ) : (
          <span className="text-muted">
            Ended <b className="text-ink">{clock(chat.updated)}</b>
          </span>
        )}
        {timed && (
          <span className="font-mono text-muted tabular-nums">
            {length(chat.started, chat.working || chat.waiting ? Date.now() : Date.parse(chat.updated))}
          </span>
        )}
        <button type="button" className="btn btn-sm ml-auto" onClick={() => open(chat.id)}>
          Open the chat
        </button>
        {(chat.working || chat.waiting) && <StopChat chat={chat.id} applying={chat.applying} />}
      </div>
    </>
  );
}

// each kind's name and its one colour (a tone, so its chip and its filter's dot match), in design.md's meanings:
// learning and deep work purple; pink stays for what needs me, so a task (added or done) is a plain record, muted
const KIND: Record<string, [string, Tone]> = {
  search: ["Search", "purple"],
  deep: ["Deep check", "purple"],
  model: ["Model", "yellow"],
  mirror: ["Mirror", "muted"],
  backup: ["Copy", "muted"],
  lesson: ["Lesson", "purple"],
  task: ["Task", "muted"],
  apply: ["Application", "orange"],
  notes: ["Notes", "accent"],
  listing: ["Listing", "purple"],
  research: ["Research", "yellow"],
  quiz: ["Quiz", "purple"],
  letter: ["Writing", "orange"],
  news: ["News", "cyan"],
};
// a kind's name as a filter, where a plural reads better; any other kind is filtered by its chip's name
const PLURAL: Record<string, string> = {
  apply: "Applications",
  listing: "Listings",
  deep: "Deep checks",
  lesson: "Lessons",
  task: "Tasks",
  search: "Searches",
  model: "Models",
  backup: "Copies",
  mirror: "Mirrors",
};
const kindName = (kind: string) => KIND[kind]?.[0] ?? kind;
const kindChip = (kind: string, tone?: Tone) => (
  <span className={`chip chip-caps tone-${tone ?? KIND[kind]?.[1] ?? "muted"}`}>{kindName(kind)}</span>
);
// the chip already says the kind, so a title that starts with it ("Search: Made-up board") drops it; a title whose
// start says what happened ("Done: …", "New task: …") keeps it
const shortTitle = (a: Item) => {
  const at = a.title.indexOf(": ");
  return at > 0 && a.title.slice(0, at).toLowerCase() === kindName(a.kind).toLowerCase()
    ? a.title.slice(at + 2)
    : a.title;
};
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const dayName = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
};
const seconds = (from: string, to: string | number) =>
  Math.max(0, Math.round(((typeof to === "number" ? to : Date.parse(to)) - Date.parse(from)) / 1000));
const length = (from: string, to: string | number) => {
  const s = seconds(from, to);
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
        <li key={`${s.at}|${s.text}`} className="grid grid-cols-[64px_minmax(0,1fr)] items-baseline gap-2 text-detail">
          <span className="font-mono text-label text-muted">{clock(s.at)}</span>
          <span className="text-ink">{s.text}</span>
        </li>
      ))}
    </ol>
  );
}

// a card's meta row, as a listing's: the state or the kind as a chip on the left, how long in mono on the right; the
// title gets the next line whole, so a long job's name is read, not cut, on a phone
function Meta({ chip, time }: { chip: ReactNode; time: ReactNode }) {
  return (
    <>
      {chip}
      <span className="ml-auto flex items-center gap-2 font-mono text-small text-muted tabular-nums">{time}</span>
    </>
  );
}

// a finished piece of work, as one row of the day's list: what it was (a tap opens the work itself); under it the
// kind's chip, Failed when it failed, and its note; when it ended, and how long it took, at the end in mono
function LogRow({ a, go }: { a: Item; go: (link: string) => void }) {
  const failed = a.outcome === "failed";
  const took = a.ended ? seconds(a.started, a.ended) : 0;
  return (
    <Row
      onOpen={a.link ? () => go(a.link) : undefined}
      title={<span className="line-clamp-2">{shortTitle(a)}</span>}
      line={
        <span className="live-log-line">
          {kindChip(a.kind)}
          {failed && <span className="chip chip-caps tone-red">Failed</span>}
          {a.note && <span className={failed ? "text-red" : undefined}>{a.note}</span>}
        </span>
      }
      end={
        <span className="font-mono text-small text-muted tabular-nums">
          {clock(a.ended ?? a.started)}
          {took > 0 && ` · ${length(a.started, a.ended ?? a.started)}`}
        </span>
      }
    />
  );
}

// a few words of the head's line with the value bold, so the eye reads the numbers and skips the rest; a tone colours
// the value, the eye's anchor, and leaves the words muted
const fact = (value: ReactNode, words: string, tone?: Tone) => (
  <span>
    <b className={tone ? `text-${tone}` : "text-ink"}>{value}</b> {words}
  </span>
);
// a title clamped at two lines, as a listing's card has it, whole on hover
const clamped = (title: string) => (
  <span className="line-clamp-2" title={title}>
    {title}
  </span>
);

export function LivePage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [picked, setView] = useState<"now" | "activity" | null>(
    location.hash === "#activity" ? "activity" : location.hash === "#now" ? "now" : null,
  );
  const [kind, setKind] = useState("all");
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
  // with no tab picked, the page opens on what matters: Now while something runs or waits on me, else the Activity
  // (the same count as the Now tab's dot)
  const working = (live.data?.now.length ?? 0) + (live.data?.apps.filter((a) => a.state !== "queued").length ?? 0);
  const view = picked ?? (live.data && working === 0 ? "activity" : "now");
  const week = async (k: string) => {
    const res = await fetch(`/api/live/activity?days=7${k !== "all" ? `&kind=${k}` : ""}`);
    if (!res.ok) throw new Error(`The activity didn't load (${res.status})`);
    return (await res.json()) as { activity: Item[] };
  };
  // the whole week, always: it gives each kind's count on its pill. A picked kind is asked of the server on its own,
  // so a kind past the week's first 400 rows still shows whole
  const everything = useQuery({
    queryKey: ["live-activity", "all"],
    queryFn: () => week("all"),
    enabled: view === "activity",
  });
  const one = useQuery({
    queryKey: ["live-activity", kind],
    queryFn: () => week(kind),
    enabled: view === "activity" && kind !== "all",
  });
  const log = kind === "all" ? everything : one;
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
    if (!picked) return; // the page's own choice stays out of the address: the next visit chooses again
    const want = picked === "activity" ? "#activity" : "#now";
    if (location.hash !== want) window.history.replaceState(null, "", `${location.pathname}${location.search}${want}`);
  }, [picked]);

  // a tap opens the work: a listing in place, anything else on its own page
  const go = (link: string) => {
    if (!link) return;
    const id = new URLSearchParams(link.split("?")[1] ?? "").get("open");
    if (id && link.startsWith("/searches")) setOpen(id);
    else navigate(link);
  };

  const d = live.data;
  const chats = d?.chats ?? [];
  // an application's own chat, by its job: its steps show in the application's card
  const chatOf = (a: App) =>
    chats.find((c) => c.applying && a.title && (c.job?.title === a.title || c.title.includes(a.title)));
  const loose = chats.filter((c) => !d?.apps.some((a) => chatOf(a)?.id === c.id));
  // an application needs me when its state says so or its chat waits for me: one test for its card and the head's count
  const needsMe = (a: App) => a.state === "needs-me" || chatOf(a)?.waiting === "you";
  const busy =
    (d?.now.length ?? 0) +
    (d?.apps.filter((a) => a.state !== "queued").length ?? 0) +
    loose.filter((c) => c.working || c.waiting).length;
  const chatLink = useChatLink();
  const openChat = (id: string) => {
    if (onComputer() && chatLink.link) window.open(`${chatLink.link.desktop}#chat=${id}`, "_blank", "noopener");
    else navigate(`/chats?chat=${encodeURIComponent(id)}`);
  };
  const last = d?.recent[0];
  const days: [string, Item[]][] = [];
  for (const a of log.data?.activity ?? []) {
    const name = dayName(a.ended ?? a.started);
    const at = days.find(([n]) => n === name);
    if (at) at[1].push(a);
    else days.push([name, [a]]);
  }
  // each kind's count in the week, for its pill; a kind with none this week has no pill, unless it is the pick
  const counts = new Map<string, number>();
  for (const a of everything.data?.activity ?? []) counts.set(a.kind, (counts.get(a.kind) ?? 0) + 1);
  const kinds = [...new Set([...Object.keys(KIND), ...counts.keys()])].filter((k) => counts.has(k) || k === kind);

  const queued = d?.apps.filter((a) => a.state === "queued").length ?? 0;
  // the head counts as the cards are marked: an application that needs me is not also at work
  const needs = (d?.apps.filter(needsMe).length ?? 0) + loose.filter((c) => c.waiting === "you").length;
  const atWork =
    (d?.now.length ?? 0) +
    (d?.apps.filter((a) => a.state === "applying" && !needsMe(a)).length ?? 0) +
    loose.filter((c) => c.working).length;
  // the head's line: where things stand, each value bold; what needs me its number in pink; a held queue as a chip
  const line = d && (
    <span className="live-facts">
      {needs > 0 && fact(needs, "needs me", "pink")}
      {atWork > 0 && fact(atWork, "at work")}
      {queued > 0 && fact(queued, "queued")}
      {d.paused && <span className="chip chip-caps tone-yellow">Queue paused</span>}
      {view === "activity" && everything.data && fact(everything.data.activity.length, "this week")}
      <span>
        Updated <b className="text-ink">{clock(d.at)}</b>
      </span>
    </span>
  );

  // Now's cards: what needs me first, then what works, then what waits on something else, the queue last
  const cards: { rank: number; node: ReactNode }[] = [];
  for (const a of d?.now ?? [])
    cards.push({
      rank: 1,
      node: (
        <Card
          key={a.id}
          tone="green"
          title={clamped(shortTitle(a))}
          meta={
            <Meta
              chip={kindChip(a.kind)}
              time={
                <>
                  <span className="dot tone-green pulse" />
                  {length(a.started, Date.now())}
                </>
              }
            />
          }
        >
          <div className="grid gap-3">
            <Steps steps={a.steps} />
            {a.link && (
              <div className="flex">
                <button type="button" className="btn btn-sm" onClick={() => go(a.link)}>
                  Open
                </button>
              </div>
            )}
          </div>
        </Card>
      ),
    });
  for (const a of d?.apps ?? []) {
    const chat = chatOf(a);
    const needs = needsMe(a);
    // its chip says what its edge says: an application whose chat waits for me needs me, whatever its state
    const [words, tone] = needs ? APP_STATE["needs-me"] : (APP_STATE[a.state] ?? APP_STATE.queued);
    cards.push({
      rank: needs ? 0 : a.state === "queued" ? 3 : 1,
      node: (
        <Card
          key={a.id}
          tone={needs ? "pink" : a.state === "applying" ? "green" : undefined}
          title={clamped(a.title || a.link)}
          meta={
            <Meta
              chip={<span className={`chip chip-caps tone-${tone}`}>{words}</span>}
              time={length(a.updated, Date.now())}
            />
          }
        >
          <div className="grid gap-3">
            {a.org && <span>{a.org}</span>}
            {a.reason && <p className="inner m-0 text-ink">{a.reason}</p>}
            {chat && (
              <>
                <ChatState chat={chat} open={openChat} timed />
                <AgentSteps chat={chat} />
              </>
            )}
            <div className="flex flex-wrap gap-2">
              {a.listing && (
                <button type="button" className="btn btn-sm" onClick={() => a.listing && setOpen(a.listing)}>
                  The listing
                </button>
              )}
              <a href={a.link} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
                The page ↗
              </a>
            </div>
          </div>
        </Card>
      ),
    });
  }
  for (const c of loose) {
    // a chat waiting on me needs me, pink as everywhere; a wait on something else stays yellow
    const tone = c.working ? "green" : c.waiting === "you" ? "pink" : c.waiting ? "yellow" : undefined;
    cards.push({
      rank: c.waiting === "you" ? 0 : c.working ? 1 : 2,
      node: (
        <Card
          key={c.id}
          tone={tone}
          title={clamped(c.job?.title || c.title || "A chat")}
          meta={
            <Meta
              chip={
                <span className={`chip chip-caps tone-${tone ?? "muted"}`}>{c.applying ? "Application" : "Agent"}</span>
              }
              time={
                <>
                  {c.working && <span className="dot tone-green pulse" />}
                  {length(c.started, c.working || c.waiting ? Date.now() : Date.parse(c.updated))}
                </>
              }
            />
          }
        >
          <div className="grid gap-3">
            {c.job?.company && <span>{c.job.company}</span>}
            <ChatState chat={c} open={openChat} />
            <AgentSteps chat={c} />
          </div>
        </Card>
      ),
    });
  }
  cards.sort((a, b) => a.rank - b.rank);

  return (
    <Page
      title="Live"
      line={line}
      // the view switch sits in the head's button place: beside the title under a mouse, under the line on touch;
      // the queue's Pause (or Play) before it, while some wait or the queue is held
      actions={
        <>
          {d && <QueuePause queued={queued} paused={d.paused} />}
          <Seg
            label="Show"
            value={view}
            onChange={setView}
            options={[
              {
                value: "now",
                label: (
                  <span className="flex items-center gap-2">
                    {busy > 0 && <span className="dot tone-green pulse" />}Now
                  </span>
                ),
              },
              { value: "activity", label: "Activity" },
            ]}
          />
        </>
      }
    >
      {[live, log].map((x) =>
        x.isError ? (
          <p key={String(x.error)} className="m-0 text-detail text-red">
            {String((x.error as Error).message)}
          </p>
        ) : null,
      )}

      {view === "now" && d && busy === 0 && d.apps.length === 0 && (
        <EmptyState
          title="Nothing is running right now."
          line="Searches, deep checks, model work and applications show here while they run."
        />
      )}
      {/* the cards 12 apart, as wide as the page lets them: one column on a phone, two or three on a computer */}
      {view === "now" && d && (cards.length > 0 || (busy === 0 && last)) && (
        <div className="grid items-start gap-3 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => c.node)}
          {busy === 0 && last && (
            <Card
              title={clamped(shortTitle(last))}
              onOpen={last.link ? () => go(last.link) : undefined}
              meta={
                <Meta
                  chip={
                    <>
                      <span className="eyebrow">Last finished</span>
                      {kindChip(last.kind)}
                    </>
                  }
                  time={clock(last.ended ?? last.started)}
                />
              }
            >
              {last.note && <span className={last.outcome === "failed" ? "text-red" : undefined}>{last.note}</span>}
              <div className="card-actions">
                <button type="button" className="btn btn-sm" onClick={() => setView("activity")}>
                  The whole week
                </button>
              </div>
            </Card>
          )}
        </div>
      )}

      {view === "activity" && (
        <>
          <Pills
            label="Which kind"
            options={[
              { value: "all", label: "Everything", count: everything.data?.activity.length },
              ...kinds.map((k) => ({
                value: k,
                label: PLURAL[k] ?? kindName(k),
                tone: KIND[k]?.[1] ?? ("muted" as const),
                count: counts.get(k) ?? 0,
              })),
            ]}
            value={kind}
            onChange={setKind}
          />
          {/* a day reads straight down in time, one column; on a computer two days sit side by side */}
          <div className={cx("grid items-start gap-6", days.length > 1 && "lg:grid-cols-2")}>
            {days.map(([name, items]) => (
              <section key={name} className="live-log grid gap-2" aria-label={name}>
                <h2 className="font-cond m-0 text-section">
                  {name} <span className="font-mono text-small text-muted">{items.length}</span>
                </h2>
                <List label={name}>
                  {items.map((a) => (
                    <LogRow key={a.id} a={a} go={go} />
                  ))}
                </List>
              </section>
            ))}
          </div>
          {log.data && log.data.activity.length === 0 && (
            <EmptyState
              title={`Nothing in the last week${kind !== "all" ? " of this kind" : ""}.`}
              line={kind !== "all" ? "Pick Everything to see the other kinds." : "Work shows here once it ends."}
            />
          )}
        </>
      )}
      {open && <ListingSheet id={open} onClose={() => setOpen(null)} />}
    </Page>
  );
}
