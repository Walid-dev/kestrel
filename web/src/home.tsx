// Home: the launcher. Each app is a card; the ones still being built say which version brings them (docs/PLAN.md)
// and stay quiet until then.
import type { ReactNode } from "react";

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;
const ICONS: Record<string, ReactNode> = {
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
};

const APPS: { name: string; what: string; when: string | null; color: string }[] = [
  {
    name: "Notes",
    what: "A document, my notes on its words, and the changes the computer's model proposes.",
    when: "this version",
    color: "var(--accent)",
  },
  {
    name: "Searches",
    what: "Saved searches that run on their own: jobs first, deals later.",
    when: "v0.2",
    color: "var(--violet)",
  },
  {
    name: "Applications",
    what: "One page by state; what needs me waits here and nothing gets lost.",
    when: "v0.3",
    color: "var(--orange)",
  },
  {
    name: "Learn",
    what: "One lesson per page, read aloud, with practice and Ask.",
    when: "v0.4",
    color: "var(--green)",
  },
];

export function Home() {
  return (
    <main className="grid gap-3.5">
      <p className="font-mono mt-1 mb-1 text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--muted)" }}>
        One app · one computer · my own models
      </p>
      {APPS.map((app) => {
        const soon = app.when !== "this version";
        return (
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
              <span style={{ color: app.color, opacity: soon ? 0.75 : 1 }}>{ICONS[app.name]}</span>
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
      })}
    </main>
  );
}
