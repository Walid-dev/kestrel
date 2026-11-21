// Applications, one page by state: needs me first (with what it waits for), then applying, queued, not sent with its
// reason and Retry, and sent. Live through the events stream; the phone can ask to be told.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useEvents } from "../events.ts";

type Application = {
  id: string;
  link: string;
  title: string;
  org: string;
  state: string;
  reason: string;
  agent: string;
  updated: string;
};
type Lists = { byState: Record<string, Application[]>; counts: Record<string, number> };

const ORDER: { state: string; title: string; color: string }[] = [
  { state: "needs-me", title: "Needs me", color: "var(--warn)" },
  { state: "applying", title: "Applying now", color: "var(--accent)" },
  { state: "queued", title: "Queued", color: "var(--muted)" },
  { state: "not-sent", title: "Not sent", color: "var(--red)" },
  { state: "sent", title: "Sent", color: "var(--green)" },
];

export function Applications() {
  const queryClient = useQueryClient();
  const [told, setTold] = useState(typeof Notification !== "undefined" && Notification.permission === "granted");
  const lists = useQuery({
    queryKey: ["apply"],
    queryFn: async () => (await (await fetch("/api/apply")).json()) as Lists,
  });
  useEvents((p) => {
    if (p.kind === "apply") queryClient.invalidateQueries({ queryKey: ["apply"] });
  });
  const retry = useMutation({
    mutationFn: async (id: string) => {
      await fetch("/api/apply/retry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["apply"] }),
  });
  if (!lists.data) return null;
  return (
    <main className="grid gap-3.5">
      <div className="flex items-center gap-3">
        <h2 className="font-cond text-xl font-bold">Applications</h2>
        {!told && typeof Notification !== "undefined" && (
          <button
            type="button"
            className="btn ml-auto"
            onClick={async () => setTold((await Notification.requestPermission()) === "granted")}
          >
            Tell me on this phone
          </button>
        )}
      </div>
      {ORDER.map(({ state, title, color }) => {
        const rows = lists.data.byState[state] ?? [];
        return (
          <section key={state} className="grid gap-2">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color }}>
              {title} · {rows.length}
            </h3>
            {rows.length === 0 && (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                nothing here
              </p>
            )}
            {rows.map((a) => (
              <div key={a.id} className="card grid gap-1.5">
                <div className="flex items-baseline gap-2">
                  <a
                    href={a.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-cond min-w-0 flex-1 truncate text-lg font-bold hover:underline"
                  >
                    {a.title || a.link}
                  </a>
                  {a.agent && (
                    <span className="font-mono text-[11px]" style={{ color: "var(--muted)" }}>
                      {a.agent}
                    </span>
                  )}
                </div>
                {a.org && (
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    {a.org}
                  </p>
                )}
                {a.reason && (
                  <p
                    className="rounded-xl px-3 py-2 text-sm"
                    style={{ background: state === "needs-me" ? "var(--warn-soft)" : "var(--del-soft)" }}
                  >
                    {a.reason}
                  </p>
                )}
                {state === "not-sent" && (
                  <div>
                    <button type="button" className="btn" onClick={() => retry.mutate(a.id)}>
                      Retry
                    </button>
                  </div>
                )}
              </div>
            ))}
          </section>
        );
      })}
    </main>
  );
}
