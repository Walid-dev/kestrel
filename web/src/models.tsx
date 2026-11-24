// The Models screen: which model each use runs on. The door's models are the choices, as pills; one tap switches a use,
// the settings file stays the fallback. Under them, the calls each made, with Cost a tap away for what they'd cost.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { Card } from "./ui/card.tsx";
import { Page } from "./ui/page.tsx";
import { Pills } from "./ui/pills.tsx";

type UseRow = { use: string; what: string; model: string; fallback: string };

// each use by a plain name, not its id; a use or a prompt not named here reads its id in words ("notes-draft": "Notes
// draft"), so a new one still shows
const NAMES: Record<string, string> = {
  "notes-careful": "Notes, careful",
  "notes-fast": "Notes, fast",
  ask: "Ask",
  "search-deep": "Searches, deep check",
  research: "Research",
  "research-ask": "Research, its questions",
  quiz: "Quiz, marking",
  "quiz-explain": "Quiz, explanations",
  letter: "Cover letters",
};
const named = (id: string) => NAMES[id] ?? `${id.charAt(0).toUpperCase()}${id.slice(1).replaceAll("-", " ")}`;

export function Models() {
  const queryClient = useQueryClient();
  const state = useQuery({
    queryKey: ["models"],
    queryFn: async () => {
      const res = await fetch("/api/models");
      if (!res.ok) throw new Error(`models: ${res.status}`);
      return (await res.json()) as { door: string[]; uses: UseRow[] };
    },
  });
  const spent = useQuery({
    queryKey: ["model-calls"],
    queryFn: async () => {
      const res = await fetch("/api/models/calls");
      if (!res.ok) throw new Error(`${res.status}`);
      return (await res.json()) as {
        calls: { purpose: string; model: string; calls: number; seconds: number; last: string; failed: number }[];
      };
    },
  });
  const set = useMutation({
    mutationFn: async (body: { use: string; model: string }) => {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `${res.status}`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["models"] }),
  });
  if (state.isError)
    return (
      <Page title="Models">
        <p className="m-0 text-detail text-red">The picks didn't load: {String((state.error as Error).message)}</p>
      </Page>
    );
  if (!state.data)
    return (
      <Page title="Models">
        <p className="m-0 text-detail text-muted">Reading the picks…</p>
      </Page>
    );
  const { door, uses } = state.data;
  const switchWhy = set.isError ? String((set.error as Error).message) : "";
  const calls = spent.data?.calls ?? [];
  return (
    <Page
      title="Models"
      line={
        <>
          Which model runs each job. The choices are what the computer's model door offers right now
          {door.length === 0 && ": the door isn't answering, so only the current picks show"}.
        </>
      }
    >
      {switchWhy && <p className="m-0 text-detail text-red">The switch was refused: {switchWhy}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {uses.map((u) => (
          <Card key={u.use} title={named(u.use)}>
            <div className="grid gap-3">
              <span>{u.what}</span>
              <Pills
                label={`The model for ${named(u.use)}`}
                options={(door.length ? (door.includes(u.model) ? door : [u.model, ...door]) : [u.model]).map((m) => ({
                  value: m,
                  label: m,
                }))}
                value={u.model}
                onChange={(m) => m !== u.model && !set.isPending && set.mutate({ use: u.use, model: m })}
              />
              <span className="font-mono text-small wrap-anywhere">Fallback: {u.fallback}</span>
            </div>
          </Card>
        ))}
      </div>
      {calls.length > 0 && (
        <Card title="The calls they made">
          <div className="grid gap-3">
            <span>
              Every recorded call, newest first. Local models charge time, nothing else;{" "}
              <Link to="/cost" className="text-accent underline underline-offset-2">
                Cost
              </Link>{" "}
              shows what the same use would cost in the cloud.
            </span>
            <ul className="m-0 grid list-none gap-2 p-0">
              {calls.map((r) => (
                <li key={`${r.purpose}:${r.model}`} className="grid gap-0.5" title={r.purpose}>
                  <span className="font-semibold text-strong">{named(r.purpose.split(":")[0])}</span>
                  <span className="font-mono text-small wrap-anywhere">
                    {r.model} · {r.calls} call{r.calls === 1 ? "" : "s"} · {r.seconds} s each
                    {r.failed > 0 && <span className="text-orange"> · {r.failed} failed</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}
    </Page>
  );
}
