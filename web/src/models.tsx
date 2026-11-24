// The Models screen: which model each use runs on, as one list of rows: the job, what it does, its fallback, and at the
// row's end its model, which opens the picker: the door's models as pills, one tap switches the job (the settings file
// stays the fallback). Under them, the calls each made, with Cost a tap away for what they'd cost.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { Dialog } from "./ui/dialog.tsx";
import { List, Row } from "./ui/list.tsx";
import { Page } from "./ui/page.tsx";
import { Pills } from "./ui/pills.tsx";

type UseRow = { use: string; what: string; model: string; fallback: string };

// each use by a plain name, not its id; a use or a call not named here reads its id in words ("notes-draft": "Notes
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
const words = (id: string) => `${id.charAt(0).toUpperCase()}${id.slice(1).replaceAll("-", " ")}`;
const named = (id: string) => NAMES[id] ?? words(id);
// a recorded call carries its prompt's id ("quiz-grade:v3"), not its use's: the same plain names, so one job has one
// name on this page. Ask's calls are one per app ("ask-learn")
const PURPOSES: Record<string, string> = {
  changes: "Notes, changes",
  "deep-job": "Searches, deep check of a job",
  "deep-deal": "Searches, deep check of a deal",
  research: "Research",
  "research-plan": "Research, its plan",
  "research-ask": "Research, its questions",
  "quiz-make": "Quiz, a question written",
  "quiz-grade": "Quiz, marking",
  "quiz-explain": "Quiz, explanations",
  letter: "Cover letters",
  "letter-review": "Cover letters, the review",
  "letter-fix": "Cover letters, a fix",
};
const purposeOf = (purpose: string) => {
  const [id = "", version = ""] = purpose.split(":");
  const name = id.startsWith("ask-") ? `Ask, on ${words(id.slice(4))}` : (PURPOSES[id] ?? words(id));
  return { name, version };
};

export function Models() {
  const queryClient = useQueryClient();
  const [picking, setPicking] = useState<string | null>(null);
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
  // the job whose picker is open, read fresh from the data, so a switch shows at once
  const pick = uses.find((u) => u.use === picking);
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
      <div className="models-uses">
        <List cols label="The jobs and their models">
          {uses.map((u) => (
            <Row
              key={u.use}
              title={named(u.use)}
              line={
                <>
                  <span className="line-clamp-2">{u.what}</span>
                  <span className="block font-mono wrap-anywhere">Fallback: {u.fallback}</span>
                </>
              }
              end={
                <button
                  type="button"
                  className="pill models-pick"
                  aria-label={`${named(u.use)}: ${u.model}. Change the model`}
                  title="Change the model"
                  onClick={() => setPicking(u.use)}
                >
                  {u.model}
                </button>
              }
            />
          ))}
        </List>
      </div>
      <Dialog
        open={pick !== undefined}
        onClose={() => setPicking(null)}
        eyebrow="The model for"
        title={pick ? named(pick.use) : ""}
        busy={set.isPending}
      >
        {pick && (
          <div className="grid gap-3">
            <p className="m-0 text-detail text-muted">
              {door.length
                ? "The models the door offers right now. A tap switches this job; the settings file stays the fallback."
                : "The door isn't answering, so only the current pick shows."}
            </p>
            <Pills
              label={`The model for ${named(pick.use)}`}
              options={(door.length ? (door.includes(pick.model) ? door : [pick.model, ...door]) : [pick.model]).map(
                (m) => ({ value: m, label: m }),
              )}
              value={pick.model}
              onChange={(m) => {
                if (m !== pick.model && !set.isPending) set.mutate({ use: pick.use, model: m });
                setPicking(null);
              }}
            />
            <span className="font-mono text-small text-muted wrap-anywhere">Fallback: {pick.fallback}</span>
          </div>
        )}
      </Dialog>
      {calls.length > 0 && (
        <section className="grid gap-2">
          <h2 className="font-cond m-0 text-section">The calls they made</h2>
          <p className="m-0 text-detail text-muted">
            Every recorded call, newest first. Local models charge time, nothing else;{" "}
            <Link to="/cost" className="text-accent underline underline-offset-2">
              Cost
            </Link>{" "}
            shows what the same use would cost in the cloud.
          </p>
          <List cols label="The calls they made">
            {calls.map((r) => {
              const p = purposeOf(r.purpose);
              return (
                <Row
                  key={`${r.purpose}:${r.model}`}
                  // the prompt's version tells two rows of one job apart
                  title={
                    <>
                      {p.name}
                      {p.version && <span className="font-mono ml-2 text-small text-muted">{p.version}</span>}
                    </>
                  }
                  line={
                    <span className="font-mono wrap-anywhere">
                      {r.model} · {r.calls} call{r.calls === 1 ? "" : "s"} · {r.seconds} s each
                      {r.failed > 0 && <span className="text-orange"> · {r.failed} failed</span>}
                    </span>
                  }
                />
              );
            })}
          </List>
        </section>
      )}
    </Page>
  );
}
