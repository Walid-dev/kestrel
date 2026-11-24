// Live, the old setup's: Now is what runs this minute, step by step — a search, a deep check, a model writing, an
// agent applying, an application waiting for me — each with its timer and steps; the last thing that finished opens
// its work. Activity is the week: everything that ran and every mark I made (a lesson graded, a task done, a stage
// set, an application sent), by day, each opening the work itself — the listing, the lesson, the task list, the note.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { onComputer, useChatLink } from "./chats.tsx";
import { useEvents } from "./events.ts";
import { ListingSheet } from "./search/sheet.tsx";
import { QueueLine, StopChat } from "./stop.tsx";
import { Card } from "./ui/card.tsx";
import { EmptyState } from "./ui/empty.tsx";
import { Page } from "./ui/page.tsx";
import { Pills, type Tone } from "./ui/pills.tsx";

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
        <button type="button" className="btn btn-quiet justify-self-start" onClick={() => setAll(true)}>
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
              <span className={`text-center font-bold ${colour}`} aria-hidden="true">
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

// a chat's state in words, with the way to open it (on a computer in dsh itself, on a phone in kestrel's Chat) and to
// stop it while it works or waits
function ChatState({ chat, open }: { chat: AgentChat; open: (id: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-small">
      {chat.working ? (
        <>
          <span className="dot tone-green pulse" />
          <b className="text-green">Working</b>
        </>
      ) : chat.waiting ? (
        <>
          <span className={`dot ${chat.waiting === "you" ? "tone-pink" : "tone-yellow"}`} />
          <b className={chat.waiting === "you" ? "text-pink" : "text-yellow"}>
            Waiting for {chat.waiting}
            {chat.help && ":"}
          </b>
          {chat.help && <span className="text-ink">{chat.help}</span>}
        </>
      ) : (
        <span className="text-muted">Ended {clock(chat.updated)}</span>
      )}
      <span className="font-mono text-muted">
        {length(chat.started, chat.working || chat.waiting ? Date.now() : Date.parse(chat.updated))}
      </span>
      <button type="button" className="btn btn-quiet ml-auto" onClick={() => open(chat.id)}>
        Open the chat
      </button>
      {(chat.working || chat.waiting) && <StopChat chat={chat.id} applying={chat.applying} />}
    </div>
  );
}

// each kind's name and its one colour (a tone, so its chip and its filter's dot match)
const KIND: Record<string, [string, Tone]> = {
  search: ["Search", "purple"],
  deep: ["Deep check", "accent"],
  model: ["Model", "yellow"],
  mirror: ["Mirror", "muted"],
  backup: ["Copy", "muted"],
  lesson: ["Lesson", "green"],
  task: ["Task", "pink"],
  apply: ["Application", "orange"],
  notes: ["Notes", "accent"],
  listing: ["Listing", "purple"],
  research: ["Research", "yellow"],
  quiz: ["Quiz", "green"],
  letter: ["Writing", "orange"],
};
const FILTERS: [string, string][] = [
  ["all", "Everything"],
  ["apply", "Applications"],
  ["listing", "Listings"],
  ["deep", "Deep checks"],
  ["lesson", "Lessons"],
  ["task", "Tasks"],
  ["notes", "Notes"],
  ["search", "Searches"],
  ["model", "Models"],
];
const kindChip = (kind: string, tone?: Tone) => (
  <span className={`chip chip-caps tone-${tone ?? KIND[kind]?.[1] ?? "muted"}`}>{KIND[kind]?.[0] ?? kind}</span>
);
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
        <li key={`${s.at}|${s.text}`} className="grid grid-cols-[64px_minmax(0,1fr)] items-baseline gap-2 text-detail">
          <span className="font-mono text-label text-muted">{clock(s.at)}</span>
          <span className="text-ink">{s.text}</span>
        </li>
      ))}
    </ol>
  );
}

// a card's top line: the kind's chip, then how long, at the far end; the title gets the next line whole, so a long
// job's name is read, not cut, on a phone
function Meta({ chip, time }: { chip: ReactNode; time: ReactNode }) {
  return (
    <>
      {chip}
      <span className="ml-auto font-mono text-small text-muted">{time}</span>
    </>
  );
}

// a finished piece of work: the chip and the time on top, what it was under them, its note (red when it failed);
// a tap opens the work itself
function Row({ a, go }: { a: Item; go: (link: string) => void }) {
  const failed = a.outcome === "failed";
  return (
    <Card
      title={a.title}
      onOpen={a.link ? () => go(a.link) : undefined}
      meta={
        <Meta
          chip={kindChip(a.kind)}
          time={
            <span className="flex items-center gap-2">
              <span className={`dot ${failed ? "tone-red" : "tone-green"}`} />
              {clock(a.ended ?? a.started)}
              {a.ended && a.ended !== a.started && ` · ${length(a.started, a.ended)}`}
              {/* the arrow says this row opens: a touch screen has no hover to tell it */}
              {a.link && (
                <span className="text-accent" aria-hidden="true">
                  →
                </span>
              )}
            </span>
          }
        />
      }
    >
      {a.note && <span className={failed ? "text-red" : undefined}>{a.note}</span>}
    </Card>
  );
}

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
  const log = useQuery({
    queryKey: ["live-activity", kind],
    queryFn: async () => {
      const res = await fetch(`/api/live/activity?days=7${kind !== "all" ? `&kind=${kind}` : ""}`);
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

  return (
    <Page
      title="Live"
      width="reading"
      line={d ? `What runs now, and the week's work. Updated ${clock(d.at)}.` : undefined}
    >
      <fieldset className="seg sm:w-80 sm:justify-self-start" aria-label="Show">
        <button type="button" aria-pressed={view === "now"} onClick={() => setView("now")}>
          <span className="flex items-center gap-2">{busy > 0 && <span className="dot tone-green pulse" />}Now</span>
        </button>
        <button type="button" aria-pressed={view === "activity"} onClick={() => setView("activity")}>
          Activity
        </button>
      </fieldset>
      {[live, log].map((x) =>
        x.isError ? (
          <p key={String(x.error)} className="m-0 text-detail text-red">
            {String((x.error as Error).message)}
          </p>
        ) : null,
      )}

      {view === "now" && d && (
        <>
          <QueueLine queued={d.apps.filter((a) => a.state === "queued").length} paused={d.paused} />
          {busy === 0 && d.apps.length === 0 && (
            <EmptyState
              title="Nothing is running right now."
              line="A search, a deep check, a model writing or an agent applying shows here while it works, step by step."
            />
          )}
          {d.now.map((a) => (
            <Card
              key={a.id}
              tone="green"
              title={a.title}
              meta={<Meta chip={kindChip(a.kind)} time={length(a.started, Date.now())} />}
            >
              <div className="grid gap-3">
                <div className="flex items-center gap-2 text-small">
                  <span className="dot tone-green pulse" />
                  <b className="text-green">Working</b>
                  {a.link && (
                    <button type="button" className="btn btn-quiet ml-auto" onClick={() => go(a.link)}>
                      Open
                    </button>
                  )}
                </div>
                <Steps steps={a.steps} />
              </div>
            </Card>
          ))}
          {d.apps.map((a) => {
            const chat = chatOf(a);
            const [words, tone] = APP_STATE[a.state] ?? APP_STATE.queued;
            return (
              <Card
                key={a.id}
                tone={a.state === "needs-me" ? "pink" : undefined}
                title={a.title || a.link}
                meta={
                  <Meta
                    chip={<span className={`chip chip-caps tone-${tone}`}>{words}</span>}
                    time={length(a.updated, Date.now())}
                  />
                }
              >
                <div className="grid gap-3">
                  {a.org && <p className="m-0 text-ink">{a.org}</p>}
                  {a.reason && <p className="m-0 rounded-lg bg-pink-soft px-3 py-2 text-ink">{a.reason}</p>}
                  {chat && (
                    <>
                      <ChatState chat={chat} open={openChat} />
                      <AgentSteps chat={chat} />
                    </>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {a.listing && (
                      <button type="button" className="btn" onClick={() => a.listing && setOpen(a.listing)}>
                        The listing
                      </button>
                    )}
                    <a href={a.link} target="_blank" rel="noopener noreferrer" className="btn">
                      The page ↗
                    </a>
                  </div>
                </div>
              </Card>
            );
          })}
          {loose.map((c) => {
            // a chat waiting on me needs me, pink as everywhere; a wait on something else stays yellow
            const tone = c.working ? "green" : c.waiting === "you" ? "pink" : c.waiting ? "yellow" : undefined;
            return (
              <Card
                key={c.id}
                tone={tone}
                title={
                  c.job?.title ? `${c.job.title}${c.job.company ? ` · ${c.job.company}` : ""}` : c.title || "A chat"
                }
                meta={
                  <span className={`chip chip-caps tone-${tone ?? "muted"}`}>
                    {c.applying ? "Application" : "Agent"}
                  </span>
                }
              >
                <div className="grid gap-3">
                  <ChatState chat={c} open={openChat} />
                  <AgentSteps chat={c} />
                </div>
              </Card>
            );
          })}
          {busy === 0 && last && (
            <section className="grid gap-2">
              <span className="eyebrow">Last finished</span>
              <Row a={last} go={go} />
              <button type="button" className="btn btn-quiet justify-self-start" onClick={() => setView("activity")}>
                See the whole week
              </button>
            </section>
          )}
        </>
      )}

      {view === "activity" && (
        <section className="grid gap-4">
          <Pills
            label="Which kind"
            options={FILTERS.map(([k, label]) => ({ value: k, label, tone: k === "all" ? undefined : KIND[k]?.[1] }))}
            value={kind}
            onChange={setKind}
          />
          {days.map(([name, items]) => (
            <div key={name} className="grid gap-2">
              <h2 className="font-cond m-0 mt-2 text-head font-bold">
                {name} <span className="font-mono text-small text-muted">{items.length}</span>
              </h2>
              {items.map((a) => (
                <Row key={a.id} a={a} go={go} />
              ))}
            </div>
          ))}
          {log.data && log.data.activity.length === 0 && (
            <EmptyState
              title={`Nothing in the last week${kind !== "all" ? " of this kind" : ""}.`}
              line={kind !== "all" ? "Pick Everything to see the other kinds." : "Work shows here once it ends."}
            />
          )}
        </section>
      )}
      {open && <ListingSheet id={open} onClose={() => setOpen(null)} />}
    </Page>
  );
}
