// Home: the launcher. Each app is a card; the ones still being built say which version brings them (docs/PLAN.md)
// and stay quiet until then.
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { useChatLink } from "./chats.tsx";
import { LiveStrip } from "./live-strip.tsx";

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

// each app its own colour, the same on Home's cards and in the dock: no two apps share one
// each app's own colour, no two alike (Searches green, my pick)
const APP_COLOR: Record<string, string> = {
  Home: "var(--strong)",
  Searches: "var(--great)",
  Chat: "var(--cyan)",
  Learn: "var(--purple)",
  Notes: "var(--accent)",
  Tasks: "var(--pink)",
  Research: "var(--yellow)",
  Quiz: "var(--teal)",
  Applications: "var(--orange)",
  Writing: "var(--magenta)",
  "Interview prep": "var(--good)",
  Live: "var(--green)",
};

// the order is mine: Searches, Chat, Learn, Notes, Tasks, then the rest
const APPS: { name: string; what: string; when: string; to: string | null }[] = [
  {
    name: "Searches",
    what: "Job and deal hunts that run on their own, each listing whole, deep checks on a tap.",
    when: "v0.2",
    to: "/searches",
  },
  {
    name: "Chat",
    what: "The agent's chats, live as they work: write to one, answer its questions, stop it.",
    when: "",
    to: "/chats",
  },
  {
    name: "Learn",
    what: "One lesson per page, read aloud, with practice and Ask.",
    when: "v0.4",
    to: "/learn",
  },
  {
    name: "Notes",
    what: "A document, my notes on its words, and the changes the computer's model proposes.",
    when: "v0.1",
    to: "/notes",
  },
  {
    name: "Tasks",
    what: "One line each; an agent closes one with a note of what was done.",
    when: "v0.5",
    to: "/tasks",
  },
  {
    name: "Research",
    what: "Ask anything: the computer's model searches the web, quick or deep, and writes it plain, like a lesson.",
    when: "v0.6",
    to: "/research",
  },
  {
    name: "Quiz",
    what: "Questions from my lessons; the model marks my answer, explains it and answers my questions. My place is kept.",
    when: "v0.6",
    to: "/quiz",
  },
  {
    name: "Applications",
    what: "One page by state; what needs me waits here and nothing gets lost.",
    when: "v0.3",
    to: "/applications",
  },
  {
    name: "Writing",
    what: "A cover letter, a form's answer or any text for a job, written the way an application writes it.",
    when: "v0.6",
    to: "/writing",
  },
  {
    name: "Interview prep",
    what: "Answers to say for a job or a project, and the helper that finds them while you're asked.",
    when: "v0.4",
    to: "/interview",
  },
];

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
  return (
    <main className="grid gap-3.5 md:grid-cols-2">
      <LiveStrip />
      {brief.data && (
        <section className="card md:col-span-2">
          <p className="font-mono mb-1.5 text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--muted)" }}>
            This morning
          </p>
          {(brief.data.lines ?? []).map((line) => (
            <p key={line} className="text-sm leading-relaxed">
              {line}
            </p>
          ))}
        </section>
      )}
      <p
        className="font-mono mt-1 mb-1 text-[11px] uppercase tracking-[0.18em] md:col-span-2"
        style={{ color: "var(--muted)" }}
      >
        One app · one computer · my own models
      </p>
      {APPS.map((app) => {
        const soon = app.to === null; // a card without a door isn't here yet
        const card = (
          <section
            key={app.name}
            className="rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-px"
            style={{
              borderColor: "var(--line)",
              background: "var(--surface)",
              boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
            }}
          >
            <div className="flex items-center gap-3">
              <span style={{ color: APP_COLOR[app.name], opacity: soon ? 0.75 : 1 }}>{ICONS[app.name]}</span>
              <h2 className="font-cond text-xl font-bold" style={{ color: soon ? "var(--muted)" : "var(--text)" }}>
                {app.name}
              </h2>
              {app.when && (
                <span
                  className="font-mono ml-auto rounded-full px-2.5 py-1 text-[11px]"
                  style={
                    soon
                      ? { background: "var(--surface-2)", color: "var(--muted)" }
                      : { background: "var(--accent-soft)", color: "var(--accent)" }
                  }
                >
                  {app.when}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
              {app.what}
            </p>
          </section>
        );
        if (app.to === "/chats" && chat.external)
          return (
            <a key={app.name} href={chat.href} target="_blank" rel="noopener noreferrer" aria-label="Open Chat">
              {card}
            </a>
          );
        return app.to === null ? (
          card
        ) : (
          <Link key={app.name} to={app.to} aria-label={`Open ${app.name}`}>
            {card}
          </Link>
        );
      })}
      <Link to="/cost" className="card card-link flex items-center gap-3">
        <span style={{ color: "var(--yellow)" }}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...STROKE}>
            <circle cx="9" cy="9" r="5.5" />
            <path d="M14.5 9.6a5.5 5.5 0 1 1-4.9 4.9" />
          </svg>
        </span>
        <span className="font-cond text-lg font-bold">Cost</span>
        <span className="ml-auto truncate text-sm" style={{ color: "var(--muted)" }}>
          what the models cost
        </span>
      </Link>
      <Link
        to="/models"
        className="card flex items-center gap-3 transition-all duration-200 hover:-translate-y-px md:col-span-2"
      >
        <span style={{ color: "var(--yellow)" }}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...STROKE}>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5v4.5l3 2" />
          </svg>
        </span>
        <span className="font-cond text-lg font-bold">Models</span>
        <span className="ml-auto text-sm" style={{ color: "var(--muted)" }}>
          which model runs each job
        </span>
      </Link>
    </main>
  );
}
