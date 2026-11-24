// Home: the launcher, and the page that carries the name: the date over it and the pink wolf with kestrel as its
// title (there is no bar above the pages). What needs me and this morning's brief first, then the apps as one list of
// rows (two columns on a computer), each opening its app, then Cost and Models, the two pages about the models.
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useChatLink } from "./chats.tsx";
import { LiveStrip } from "./live-strip.tsx";
import { Mark } from "./mark.tsx";
import { List, Row } from "./ui/list.tsx";
import { Page } from "./ui/page.tsx";

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
    what: "Job and deal hunts that run on their own, each listing whole, deep checks on a tap.",
    to: "/searches",
  },
  {
    name: "Chat",
    what: "The agent's chats, live as they work: write to one, answer its questions, stop it.",
    to: "/chats",
  },
  { name: "Learn", what: "One lesson per page, read aloud, with practice and Ask.", to: "/learn" },
  {
    name: "Notes",
    what: "A document, my notes on its words, and the changes the computer's model proposes.",
    to: "/notes",
  },
  { name: "Tasks", what: "One line each; an agent closes one with a note of what was done.", to: "/tasks" },
  {
    name: "Research",
    what: "Ask anything: the computer's model searches the web, quick or deep, and writes it plain, like a lesson.",
    to: "/research",
  },
  {
    name: "Quiz",
    what: "Questions from my lessons; the model marks my answer, explains it and answers my questions. My place is kept.",
    to: "/quiz",
  },
  {
    name: "Applications",
    what: "One page by state; what needs me waits here and nothing gets lost.",
    to: "/applications",
  },
  {
    name: "Writing",
    what: "A cover letter, a form's answer or any text for a job, written the way an application writes it.",
    to: "/writing",
  },
  {
    name: "Interview prep",
    what: "Answers to say for a job or a project, and the helper that finds them while you're asked.",
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
      {lines.length > 0 && (
        <section className="grid gap-2" aria-label="This morning">
          <span className="eyebrow">This morning</span>
          <div className="text-body">
            {lines.map((line) => (
              <p key={line} className="m-0">
                {line}
              </p>
            ))}
          </div>
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
