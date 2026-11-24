// Home: the launcher, and the page that carries the name: the date over it and the pink wolf with kestrel as its
// title (there is no bar above the pages). What needs me first, then this morning's brief as a row of figures, each
// opening its page, then the apps as one list of rows (two columns on a computer), each in a few words and opening
// its app, then Cost and Models, the two pages about the models.
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { useChatLink } from "./chats.tsx";
import { LiveStrip } from "./live-strip.tsx";
import { Mark } from "./mark.tsx";
import { List, Row } from "./ui/list.tsx";
import { Page } from "./ui/page.tsx";
import type { Tone } from "./ui/pills.tsx";

export const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;
export const ICONS: Record<string, ReactNode> = {
  Notes: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...STROKE}>
      <path d="M6 3.5h8.5L19 8v12.5H6z" />
      <path d="M14.5 3.5V8H19" />
      <path d="M9 12.5h7M9 16h5" />
    </svg>
  ),
  Searches: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...STROKE}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15.2 15.2 5.3 5.3" />
    </svg>
  ),
  Applications: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...STROKE}>
      <path d="m12 3 9 5-9 5-9-5z" />
      <path d="m4.5 12.8 7.5 4.2 7.5-4.2" />
      <path d="m4.5 16.8 7.5 4.2 7.5-4.2" />
    </svg>
  ),
  Learn: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...STROKE}>
      <path d="M12 6c-1.8-1.6-4.4-2-8-2v14.5c3.6 0 6.2.4 8 2 1.8-1.6 4.4-2 8-2V4c-3.6 0-6.2.4-8 2z" />
      <path d="M12 6v14.5" />
    </svg>
  ),
  "Interview prep": (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...STROKE}>
      <path d="M5 5.5h14v9.5H9.5L5 19z" />
      <path d="M9 9.5h6M9 12h4" />
    </svg>
  ),
  Tasks: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...STROKE}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  ),
  Chat: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...STROKE}>
      <path d="M4.5 5.5h15v10h-9L6 19v-3.5H4.5z" />
    </svg>
  ),
  Research: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...STROKE}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.1-3.6-8.5s1.2-6.2 3.6-8.5z" />
    </svg>
  ),
  Quiz: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...STROKE}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6" />
      <path d="M12 16.6v.1" />
    </svg>
  ),
  Writing: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...STROKE}>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  ),
};

// each app its own colour, no two alike (Searches green, my pick), as a colour class so it follows the theme
const APP_COLOR: Record<string, string> = {
  Searches: "text-great",
  Chat: "text-cyan",
  Learn: "text-purple",
  Notes: "text-accent",
  Tasks: "text-pink",
  Research: "text-yellow",
  Quiz: "text-teal",
  Applications: "text-orange",
  Writing: "text-magenta",
  "Interview prep": "text-good",
};

// the order is mine: Searches, Chat, Learn, Notes, Tasks, then the rest
const APPS: { name: string; what: string; to: string }[] = [
  {
    name: "Searches",
    what: "Job and deal hunts",
    to: "/searches",
  },
  {
    name: "Chat",
    what: "The agent's chats, live",
    to: "/chats",
  },
  { name: "Learn", what: "Lessons, read aloud", to: "/learn" },
  {
    name: "Notes",
    what: "Documents and my notes on them",
    to: "/notes",
  },
  { name: "Tasks", what: "My list, and the agents'", to: "/tasks" },
  {
    name: "Research",
    what: "Questions answered from the web",
    to: "/research",
  },
  {
    name: "Quiz",
    what: "Questions from my lessons",
    to: "/quiz",
  },
  {
    name: "Applications",
    what: "Every application, by state",
    to: "/applications",
  },
  {
    name: "Writing",
    what: "Cover letters and answers",
    to: "/writing",
  },
  {
    name: "Interview prep",
    what: "Answers to say, and the helper",
    to: "/interview",
  },
];

// Cost and Models, the two pages about the models themselves, in a list of their own under the apps
const TOOLS: { name: string; what: string; to: string; icon: ReactNode }[] = [
  {
    name: "Cost",
    what: "What the models cost",
    to: "/cost",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...STROKE}>
        <circle cx="9" cy="9" r="5.5" />
        <path d="M14.5 9.6a5.5 5.5 0 1 1-4.9 4.9" />
      </svg>
    ),
  },
  {
    name: "Models",
    what: "Which model runs each job",
    to: "/models",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...STROKE}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5v4.5l3 2" />
      </svg>
    ),
  },
];

// the morning brief as figures, each the count its page shows when tapped. Great matches and Priority are the job
// hunt's own pills, read from the counts Searches reads (its first job hunt, as Searches opens on, and its "Not applied
// yet" switch as this browser keeps it). The other two come from the server's brief, in sentences
// (src/domain/brief.ts), one count each, and only the counts above zero: each figure reads its count from the sentence
// its words match, and a figure with no sentence is 0. What needs me and the queue are left out here: the live row
// above says them. A sentence no figure or the live row names stays a sentence under the figures, so a new one is
// never lost
type Counts = { stages: Record<string, number>; match: Record<string, number> };
const FIGURES: {
  label: string;
  words: RegExp;
  to: string;
  tone: Tone;
  hint: string;
  hunt?: (c: Counts) => number;
}[] = [
  {
    label: "Great matches",
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
    label: "To review",
    words: /up for review/i,
    to: "/learn/practice",
    tone: "cyan",
    hint: "Lessons due for review today",
  },
  { label: "Tasks open", words: /tasks? stays? open/i, to: "/tasks", tone: "accent", hint: "Tasks not done yet" },
];
const LIVE_ROW = /on me\b|queued|nothing waits/i;
const countIn = (line: string) => Number(line.match(/\d+/)?.[0] ?? 0);
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
  // the job hunt Searches opens on, and its counts as the Searches page asks for them (the same query keys, so either
  // page's answer serves the other)
  const hunts = useQuery({
    queryKey: ["searches"],
    queryFn: async () => {
      const res = await fetch("/api/search");
      if (!res.ok) throw new Error(`${res.status}`);
      return (await res.json()) as { hunts: { key: string; kind: string }[] };
    },
  });
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
        <span className="inline-flex items-center gap-2">
          <Mark size={24} />
          kestrel
        </span>
      }
      line="One app, one computer, my own models."
    >
      <LiveStrip />
      {brief.data && (
        <section className="card home-figs" aria-label="This morning">
          {FIGURES.map((f) => {
            // a hunt figure is 0 when there is no job hunt, and waits for its counts (a dash) rather than show a wrong 0
            const n = f.hunt
              ? hunt
                ? counts.data && f.hunt(counts.data)
                : hunts.data && 0
              : countIn(lines.find((l) => f.words.test(l)) ?? "");
            return (
              <Link
                key={f.label}
                to={f.hunt && hunt ? `${f.to}&hunt=jobs:${encodeURIComponent(hunt.key)}` : f.to}
                className="home-fig"
                title={f.hint}
              >
                <span className="eyebrow">{f.label}</span>
                <span className="flex items-center gap-2">
                  <span className={`dot tone-${f.tone}`} aria-hidden="true" />
                  <b className={`font-mono text-lead tabular-nums ${n ? "text-strong" : "text-muted"}`}>{n ?? "–"}</b>
                </span>
              </Link>
            );
          })}
          {lines
            .filter((l) => !FIGURES.some((f) => f.words.test(l)) && !LIVE_ROW.test(l))
            .map((l) => (
              <p key={l} className="home-figs-more m-0 text-small text-muted">
                {l}
              </p>
            ))}
        </section>
      )}
      <List cols label="The apps">
        {APPS.map((app) => (
          <Row
            key={app.name}
            // on a computer, Chat opens the chat app itself, in its own tab, where this browser is signed in
            {...(app.to === "/chats" && chat.external ? { href: chat.href } : { to: app.to })}
            icon={<span className={`grid ${APP_COLOR[app.name]}`}>{ICONS[app.name]}</span>}
            title={app.name}
            line={<span className="block truncate">{app.what}</span>}
          />
        ))}
      </List>
      <List cols label="The models">
        {TOOLS.map((tool) => (
          <Row
            key={tool.name}
            to={tool.to}
            icon={<span className="grid text-yellow">{tool.icon}</span>}
            title={tool.name}
            line={<span className="block truncate">{tool.what}</span>}
          />
        ))}
      </List>
    </Page>
  );
}
