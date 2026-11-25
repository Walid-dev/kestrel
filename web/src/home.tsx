// Home: the launcher, and the page that carries the name: the date over it and the pink wolf with kestrel as its
// title (there is no bar above the pages), what kestrel is in a short line beside them. The morning's news first, then
// what needs me, then this morning's brief as one small strip of figures, what waits and what comes next, each opening
// its page, then the apps as one list of rows (two columns on a computer), each in a few words and opening its app,
// then Cost and Models, the two pages about the models.
import { useQuery } from "@tanstack/react-query";
import { useChatLink } from "./chats.tsx";
import { LiveStrip } from "./live-strip.tsx";
import { Mark } from "./mark.tsx";
import { NewsCard } from "./news/card.tsx";
import { APPS, AppIcon, type AppName } from "./ui/apps.tsx";
import { Figure, Figures } from "./ui/figures.tsx";
import { List, Row } from "./ui/list.tsx";
import { Page } from "./ui/page.tsx";
import type { Tone } from "./ui/pills.tsx";

// the apps in my order (Searches, Chat, Learn, Notes, Tasks, News, then the rest), each in a few words; its address,
// icon and colour come from the app map (web/src/ui/apps.tsx)
const LIST: [AppName, string][] = [
  ["Searches", "Job and deal hunts"],
  ["Chat", "The agent's chats, live"],
  ["Learn", "Lessons, read aloud"],
  ["Notes", "Documents and my notes on them"],
  ["Tasks", "My list, and the agents'"],
  ["News", "The morning's AI and tech news"],
  ["Research", "Questions answered from the web"],
  ["Quiz", "Questions from my lessons"],
  ["Applications", "Every application, by state"],
  ["Writing", "Cover letters and answers"],
  ["Interview prep", "Answers to say, and the helper"],
];

// Cost and Models, the two pages about the models themselves, in a list of their own under the apps
const TOOLS: [AppName, string][] = [
  ["Cost", "What the models cost"],
  ["Models", "Which model runs each job"],
];

// the morning brief as figures, each the count its page shows when tapped. Great matches and Priority are the job
// hunt's own pills, read from the counts Searches reads (its first job hunt, as Searches opens on, and its "Not applied
// yet" switch as this browser keeps it). Lessons and tasks come from the server's brief, in sentences
// (src/domain/brief.ts), one count each, and only the counts above zero: each figure reads its count from the sentence
// its words match, and a figure with no sentence is 0. Then what comes next: the next search (from the hunts Searches
// reads) and what needs me, with the queue (from the counts the live row reads). A sentence no figure or the live row
// names stays a sentence under the figures, so a new one is never lost
type Counts = { stages: Record<string, number>; match: Record<string, number> };
type HuntRow = { key: string; kind: string; name: string; next: string | null; running: number; mode: string | null };
const FIGURES: {
  label: string;
  words: RegExp;
  to: string;
  tone: Tone;
  hint: string;
  hunt?: (c: Counts) => number;
}[] = [
  {
    label: "Great jobs",
    words: /great match/i,
    to: "/searches?stage=review&match=great",
    tone: "great",
    hint: "Great matches still to review in the job hunt",
    hunt: (c) => c.match.great ?? 0,
  },
  {
    label: "Priority",
    words: /priority/i,
    to: "/searches?stage=priority",
    tone: "yellow",
    hint: "The job hunt's Priority list: starred listings, and great matches not passed on",
    hunt: (c) => c.stages.priority ?? 0,
  },
  {
    label: "Lessons due",
    words: /up for review/i,
    to: "/learn/practice",
    tone: "cyan",
    hint: "Lessons due for review today",
  },
  { label: "Tasks open", words: /tasks? stays? open/i, to: "/tasks", tone: "accent", hint: "Tasks not done yet" },
];
const LIVE_ROW = /on me\b|queued|nothing waits/i;
const countIn = (line: string) => Number(line.match(/\d+/)?.[0] ?? 0);
// a search's time, short enough for a figure: the time today, else the weekday and the hour
const soon = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : `${d.toLocaleDateString(undefined, { weekday: "short" })} ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
};

// Searches' "Not applied yet" switch, on unless this browser turned it off (search/searches.tsx keeps it under this key)
const notApplied = () => {
  try {
    return localStorage.getItem("kestrel-search-todo") !== "off";
  } catch {
    return true;
  }
};

// today, as the eyebrow says it, in the order every other date in the app takes (the browser's own): MON, NOV 23
const today = () => new Date().toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

export function Home() {
  const chat = useChatLink();
  const brief = useQuery({
    queryKey: ["brief"],
    queryFn: async () => {
      const res = await fetch("/api/brief");
      if (!res.ok) throw new Error(`${res.status}`);
      return (await res.json()) as { lines: string[] };
    },
    refetchInterval: 5 * 60_000,
  });
  const lines = brief.data?.lines ?? [];
  // what the brief says that no figure and no live row says: a sentence of its own, so a new one is never lost
  const more = lines.filter((l) => !FIGURES.some((f) => f.words.test(l)) && !LIVE_ROW.test(l));
  // the job hunt Searches opens on, and its counts as the Searches page asks for them (the same query keys, so either
  // page's answer serves the other)
  const hunts = useQuery({
    queryKey: ["searches"],
    queryFn: async () => {
      const res = await fetch("/api/search");
      if (!res.ok) throw new Error(`${res.status}`);
      return (await res.json()) as { hunts: HuntRow[] };
    },
  });
  // what comes next: a hunt searching now, else the soonest search a hunt has planned (a paused one plans none)
  const all = hunts.data?.hunts ?? [];
  const running = all.find((h) => h.running > 0);
  const next = all
    .filter((h) => h.next && h.mode !== "paused")
    .sort((a, b) => Date.parse(a.next ?? "") - Date.parse(b.next ?? ""))[0];
  const nextHunt = running ?? next;
  // the applications' counts, as the live row above reads them (the same key: either one's answer serves both)
  const apply = useQuery({
    queryKey: ["apply-counts"],
    queryFn: async () => ((await (await fetch("/api/apply")).json()) as { counts: Record<string, number> }).counts,
  });
  const needs = apply.data?.["needs-me"] ?? 0;
  const queued = apply.data?.queued ?? 0;
  const hunt = hunts.data?.hunts.find((h) => h.kind === "jobs");
  const counted = new URLSearchParams({ kind: "jobs", hunt: hunt?.key ?? "" });
  if (notApplied()) counted.set("todo", "1");
  counted.set("stage", "review");
  const counts = useQuery({
    queryKey: ["search-counts", counted.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/search/counts?${counted}`);
      if (!res.ok) throw new Error(`${res.status}`);
      return (await res.json()) as Counts;
    },
    enabled: Boolean(hunt),
  });
  return (
    <Page
      eyebrow={today()}
      title={
        <span className="flex items-center gap-2">
          <Mark size={24} />
          kestrel
        </span>
      }
      aside="One app, one computer, local models."
    >
      <NewsCard />
      <LiveStrip />
      {brief.data && (
        // a sentence of the brief that no figure says runs under them all
        <Figures
          label="This morning"
          foot={
            more.length > 0 && (
              <div className="grid gap-1">
                {more.map((l) => (
                  <p key={l} className="m-0 text-small text-muted">
                    {l}
                  </p>
                ))}
              </div>
            )
          }
        >
          {FIGURES.map((f) => {
            // a hunt figure is 0 when there is no job hunt, and waits for its counts (a dash) rather than show a wrong 0
            const n = f.hunt
              ? hunt
                ? counts.data && f.hunt(counts.data)
                : hunts.data && 0
              : countIn(lines.find((l) => f.words.test(l)) ?? "");
            return (
              <Figure
                key={f.label}
                label={f.label}
                to={f.hunt && hunt ? `${f.to}&hunt=jobs:${encodeURIComponent(hunt.key)}` : f.to}
                hint={f.hint}
                tone={f.tone}
                value={n ?? "–"}
                quiet={!n}
              />
            );
          })}
          <Figure
            label="Next search"
            to={nextHunt ? `/searches?hunt=${nextHunt.kind}:${encodeURIComponent(nextHunt.key)}` : "/searches"}
            hint={
              running
                ? `${running.name} is searching now`
                : next
                  ? `${next.name}, if the Mac is awake and plugged in`
                  : "No search planned: every hunt is paused or there is none"
            }
            tone={running ? "green" : "muted"}
            pulse={Boolean(running)}
            value={running ? "Now" : next?.next ? soon(next.next) : "–"}
            quiet={!running && !next}
          />
          <Figure
            label="Needs me"
            to="/live"
            hint={`Applications that wait on me${queued ? `; ${queued} queued to apply` : ""}`}
            tone={needs ? "pink" : "muted"}
            value={apply.data ? needs : "–"}
            quiet={!needs}
            note={queued > 0 && `${queued} queued`}
          />
        </Figures>
      )}
      <List cols label="The apps">
        {LIST.map(([app, what]) => (
          <Row
            key={app}
            // on a computer, Chat opens the chat app itself, in its own tab, where this browser is signed in
            {...(app === "Chat" && chat.external ? { href: chat.href } : { to: APPS[app].to })}
            icon={<AppIcon app={app} />}
            title={app}
            line={<span className="block truncate">{what}</span>}
          />
        ))}
      </List>
      <List cols label="The models">
        {TOOLS.map(([app, what]) => (
          <Row
            key={app}
            to={APPS[app].to}
            icon={<AppIcon app={app} />}
            title={app}
            line={<span className="block truncate">{what}</span>}
          />
        ))}
      </List>
    </Page>
  );
}
