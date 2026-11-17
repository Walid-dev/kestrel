// Home: the apps, each a card; the ones still being built say which version brings them (docs/PLAN.md).
const APPS: { name: string; what: string; when: string | null }[] = [
  {
    name: "Notes",
    what: "A document, my notes on its words, and the changes the computer's model proposes.",
    when: "this version",
  },
  { name: "Searches", what: "Saved searches that run on their own: jobs first, deals later.", when: "v0.2" },
  { name: "Applications", what: "One page by state; what needs me waits here and nothing gets lost.", when: "v0.3" },
  { name: "Learn", what: "Guides one lesson per page, read aloud, with practice.", when: "v0.4" },
];

export function Home() {
  return (
    <main className="grid gap-3">
      <p className="font-mono text-xs uppercase tracking-widest" style={{ color: "var(--muted)" }}>
        One app, one computer, my own models
      </p>
      {APPS.map((app) => (
        <section
          key={app.name}
          className="rounded-xl border p-4"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        >
          <div className="flex items-baseline gap-3">
            <h2 className="font-cond text-lg font-semibold">{app.name}</h2>
            {app.when && (
              <span
                className="font-mono ml-auto rounded-full px-2.5 py-0.5 text-xs"
                style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
              >
                {app.when}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            {app.what}
          </p>
        </section>
      ))}
    </main>
  );
}
