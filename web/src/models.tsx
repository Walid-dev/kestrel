// The Models screen: which model each job runs on, grouped by app (Notes, Searches, Research…), a group per card in a
// grid that uses the width, each group's name in its app's colour. A row is a job: its name, what it does in a few
// words, and at its end its model, by a short name (Qwen 27B), which opens the picker: the door's models as pills, one
// tap switches the job; the settings file stays the fallback, shown in the picker. The head's line says the door's
// state as a chip. Under them, the calls each made as one table, Cost's look (aligned mono columns), with Cost a tap
// away for what they'd cost.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { APPS, type AppName, appTone } from "./ui/apps.tsx";
import { cx } from "./ui/cx.ts";
import { Dialog } from "./ui/dialog.tsx";
import { List, Row } from "./ui/list.tsx";
import { Page } from "./ui/page.tsx";
import { Pills } from "./ui/pills.tsx";
import { SectionHead } from "./ui/section.tsx";

type UseRow = { use: string; what: string; model: string; fallback: string };

const words = (id: string) => `${id.charAt(0).toUpperCase()}${id.slice(1).replaceAll("-", " ")}`;
// each use by its app, its job and what it does in a few words, not by its id; a use not named here takes its app from
// its id's first word, its job from the rest ("notes-draft": Notes, Draft) and its words from the settings, so a new
// one still shows in its group
const JOBS: Record<string, [string, string, string]> = {
  "notes-careful": ["Notes", "Careful", "Changes, with time to think"],
  "notes-fast": ["Notes", "Fast", "Changes in seconds"],
  ask: ["Ask", "On any page", "A talk about the page"],
  "search-deep": ["Searches", "Deep check", "A longer look at one listing"],
  research: ["Research", "The answer", "Answered from the web"],
  "research-ask": ["Research", "Its questions", "What it asks me first"],
  quiz: ["Quiz", "Marking", "Marks my answer"],
  "quiz-explain": ["Quiz", "Explanations", "After each question"],
  letter: ["Writing", "Cover letters", "As an application writes them"],
};
// what a job does, from the settings' description, after its "App's job:" start
const gist = (what: string) => {
  const rest = what.includes(": ") ? what.slice(what.indexOf(": ") + 2) : what;
  return `${rest.charAt(0).toUpperCase()}${rest.slice(1)}`;
};
const jobOf = (u: UseRow): [string, string, string] => {
  if (JOBS[u.use]) return JOBS[u.use];
  const [app = "", ...rest] = u.use.split("-");
  return [words(app), rest.length ? words(rest.join("-")) : "Main", gist(u.what)];
};
const named = (u: UseRow) => {
  const [app, job] = jobOf(u);
  return `${app}, ${job.charAt(0).toLowerCase()}${job.slice(1)}`;
};
// a model by its family and size ("Qwen3.8-27B-oQ4e-mtp": Qwen 27B), or whole when that is all there is or when two of
// the models in sight would share the short name
const shortOf = (m: string) => {
  const family = m.match(/^[A-Za-z]+/)?.[0];
  const size = m.match(/(?:^|[-_ ])(\d+(?:\.\d+)?B)(?=$|[-_ ])/i)?.[1];
  return family && size ? `${family} ${size.toUpperCase()}` : m;
};
const shortNames = (models: string[]) => {
  const all = [...new Set(models)];
  const taken = new Map<string, number>();
  for (const m of all) taken.set(shortOf(m), (taken.get(shortOf(m)) ?? 0) + 1);
  return (m: string) => ((taken.get(shortOf(m)) ?? 0) > 1 ? m : shortOf(m));
};
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
// a group's colour: its app's (the app map), Ask's purple (Ask is on every page, its mark purple); a group kestrel
// doesn't know stays grey
const groupTone = (app: string) => (app === "Ask" ? "tone-purple" : app in APPS ? appTone(app as AppName) : "");
const purposeOf = (purpose: string) => {
  const [id = "", version = ""] = purpose.split(":");
  const name = id.startsWith("ask-") ? `Ask, on ${words(id.slice(4))}` : (PURPOSES[id] ?? words(id));
  return { name, version };
};

export function Models() {
  const queryClient = useQueryClient();
  // the job in the picker stays set after it closes, so the dialog keeps its words while it fades out
  const [picking, setPicking] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
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
      <Page app="Models" eyebrow="The models" title="Models">
        <p className="m-0 text-detail text-red">The picks didn't load: {String((state.error as Error).message)}</p>
      </Page>
    );
  if (!state.data)
    return (
      <Page app="Models" eyebrow="The models" title="Models">
        <p className="m-0 text-detail text-muted">Reading the picks…</p>
      </Page>
    );
  const { door, uses } = state.data;
  // the job whose picker is open, read fresh from the data, so a switch shows at once
  const pick = uses.find((u) => u.use === picking);
  const switchWhy = set.isError ? String((set.error as Error).message) : "";
  const calls = spent.data?.calls ?? [];
  const short = shortNames([...door, ...uses.map((u) => u.model), ...calls.map((c) => c.model)]);
  // the jobs by app, in the order the settings give them
  const groups: [string, UseRow[]][] = [];
  for (const u of uses) {
    const [app] = jobOf(u);
    const at = groups.find(([a]) => a === app);
    if (at) at[1].push(u);
    else groups.push([app, [u]]);
  }
  return (
    <Page
      app="Models"
      eyebrow="The models"
      title="Models"
      line={
        <span className="models-facts">
          {door.length ? (
            <span
              className="chip chip-caps tone-green"
              title="The choices are what the computer's model door offers right now"
            >
              Door on
            </span>
          ) : (
            <span
              className="chip chip-caps tone-orange"
              title="The computer's model door isn't answering, so only the current picks show"
            >
              Door off
            </span>
          )}
          <span>
            <b className="text-ink">{uses.length}</b> jobs
            {door.length > 0 && (
              <>
                {" · "}
                <b className="text-ink">{door.length}</b> models offered
              </>
            )}
          </span>
        </span>
      }
    >
      {switchWhy && <p className="m-0 text-detail text-red">The switch was refused: {switchWhy}</p>}
      <div className="models-uses grid items-start gap-x-3 gap-y-6 md:grid-cols-2 lg:grid-cols-3">
        {groups.map(([app, rows]) => (
          <section key={app} className="grid gap-2" aria-label={app}>
            <span className={cx("eyebrow", groupTone(app))}>{app}</span>
            <List label={`${app}: the jobs and their models`}>
              {rows.map((u) => (
                <Row
                  key={u.use}
                  title={jobOf(u)[1]}
                  // the settings' own words, whole, on hover
                  line={
                    <span className="block truncate" title={u.what}>
                      {jobOf(u)[2]}
                    </span>
                  }
                  end={
                    <button
                      type="button"
                      className="pill models-pick"
                      aria-label={`${named(u)}: ${u.model}. Change the model`}
                      title={`${u.model}: change the model`}
                      onClick={() => {
                        setPicking(u.use);
                        setOpen(true);
                      }}
                    >
                      {short(u.model)}
                    </button>
                  }
                />
              ))}
            </List>
          </section>
        ))}
      </div>
      <Dialog
        open={open && pick !== undefined}
        onClose={() => setOpen(false)}
        eyebrow="The model for"
        title={pick ? named(pick) : ""}
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
              label={`The model for ${named(pick)}`}
              options={(door.length ? (door.includes(pick.model) ? door : [pick.model, ...door]) : [pick.model]).map(
                // the names whole, in mono: here two builds of one model are told apart
                (m) => ({ value: m, label: <span className="font-mono text-small">{m}</span> }),
              )}
              value={pick.model}
              onChange={(m) => {
                if (m !== pick.model && !set.isPending) set.mutate({ use: pick.use, model: m });
                setOpen(false);
              }}
            />
            <span className="font-mono text-small text-muted wrap-anywhere">Fallback: {pick.fallback}</span>
          </div>
        )}
      </Dialog>
      {calls.length > 0 && (
        <section className="grid gap-3" aria-labelledby="models-calls">
          <SectionHead
            id="models-calls"
            title="The calls they made"
            count={calls.length}
            hint={
              <>
                Newest first. Local models cost time only;{" "}
                <Link to="/cost" className="text-accent underline underline-offset-2">
                  Cost
                </Link>{" "}
                prices them in the cloud.
              </>
            }
          />
          {/* one table, as Cost's: the job and its model on the left, the figures in mono columns, right-aligned. On a
              phone the model goes under the job's name, so the figures keep their columns */}
          <div className="card">
            <table className="data-table models-calls">
              <caption className="sr-only">The calls each job made</caption>
              <thead>
                <tr>
                  <th className="eyebrow">Job</th>
                  <th className="eyebrow models-model">Model</th>
                  <th className="eyebrow">Calls</th>
                  <th className="eyebrow">Each</th>
                  <th className="eyebrow">Failed</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((r) => {
                  const p = purposeOf(r.purpose);
                  return (
                    <tr key={`${r.purpose}:${r.model}`}>
                      <td>
                        {/* the prompt's version tells two rows of one job apart */}
                        <span className="font-medium text-strong">{p.name}</span>
                        {p.version && <span className="font-mono ml-2 text-small text-muted">{p.version}</span>}
                        <span className="models-model-under" title={r.model}>
                          {short(r.model)}
                        </span>
                      </td>
                      <td className="models-model" title={r.model}>
                        {short(r.model)}
                      </td>
                      <td>{r.calls}</td>
                      <td>{r.seconds} s</td>
                      <td className={r.failed > 0 ? "text-red" : "text-muted"}>{r.failed}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </Page>
  );
}
