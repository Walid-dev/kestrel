// Writing: a text for a real job, written the way an application writes it — the apply skill's step for its texts,
// my voice and stories, the posting — a cover letter, the answer to a form's question, or any text I describe. It is
// checked by the applications' own check (what it names goes back to be fixed) and a letter is laid out by their own
// PDF tool, so this is what an employer would get. My voice and stories are edited here, each save keeping the old
// words; write again and compare the tries.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Ask } from "./ask.tsx";
import { Card } from "./ui/card.tsx";
import { useConfirm } from "./ui/confirm.tsx";
import { Doc } from "./ui/doc.tsx";
import { EmptyState } from "./ui/empty.tsx";
import { Field } from "./ui/field.tsx";
import { Page } from "./ui/page.tsx";
import { Seg } from "./ui/seg.tsx";

type Job = { id: string; title: string; org: string; state: string; at: string };
type Kind = "letter" | "answer" | "text";
type TryRow = {
  id: string;
  listing: string;
  title: string;
  state: string;
  step: string;
  started: string;
  error: string;
  kind: Kind;
  ask: string;
  // the PDF's file name, when the try made one
  pdf?: string | null;
};
// each kind: its name on the choice (short, so the three stay one line on a phone), what it writes (the switch's hint
// line), the box's name, and what to type in it
const KINDS: [Kind, string, string, string, string][] = [
  ["letter", "A letter", "A cover letter for this job, laid out as a PDF", "", ""],
  [
    "answer",
    "An answer",
    "The answer to one of the form's questions",
    "The form's question",
    "Paste the form's question, like: Why do you want to work here?",
  ],
  [
    "text",
    "Any text",
    "Any text you describe, for this job",
    "What to write",
    "Say what to write, like: a three-line note to the recruiter about my start date",
  ],
];
const KIND_NAME: Record<Kind, string> = { letter: "Letter", answer: "Answer", text: "Text" };
type Try = TryRow & {
  text: string;
  voice: string;
  notes: {
    model?: string;
    needs?: string[];
    stories?: string[];
    fixed?: string[];
    findings?: string;
    checked?: boolean;
    pdf?: string | null;
    pdfNote?: string;
    stepFound?: boolean;
    review?: Review;
  };
};
// the review a reader gives each try: the match, what it made better, the first draft when its version was kept
type Review =
  | {
      verdict: "ready" | "better";
      match: { company: boolean; job: boolean; note: string };
      issues: { quote: string; why: string; fix: string }[];
      adopted: boolean;
      before: string;
      held: string;
    }
  | { failed: string };
type Files = { ready: true; voice: string; stories: string } | { ready: false; why: string };

const STATE_TONE: Record<string, string> = {
  sent: "tone-accent",
  "not-sent": "tone-orange",
  "needs-me": "tone-pink",
  applying: "tone-purple",
  queued: "tone-purple",
  interested: "tone-green",
};
const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
// the server's reasons start in lower case, as they read in its log; on the page they start a sentence
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ASK_MAX = 4000; // the server's limit on a question or a brief

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as { error?: string; id?: string };
  if (!res.ok) throw new Error(j.error ?? `${res.status}`);
  return j;
}

export function Writing() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const pickedTry = params.get("try");
  const [job, setJob] = useState(params.get("listing") ?? "");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind>("letter");
  const [ask, setAsk] = useState("");

  const files = useQuery({
    queryKey: ["letter-files"],
    queryFn: async () => (await (await fetch("/api/letters/files")).json()) as Files,
  });
  const jobs = useQuery({
    queryKey: ["letter-jobs"],
    queryFn: async () => ((await (await fetch("/api/letters/jobs")).json()) as { jobs: Job[] }).jobs,
  });
  const tries = useQuery({
    queryKey: ["letters", job],
    queryFn: async () =>
      (
        (await (await fetch(`/api/letters${job ? `?listing=${encodeURIComponent(job)}` : ""}`)).json()) as {
          letters: TryRow[];
        }
      ).letters,
    refetchInterval: (query) => (query.state.data?.some((t) => t.state === "running") ? 2000 : false),
  });
  const shown = pickedTry ?? tries.data?.[0]?.id ?? null;
  // a try goes with the ✕ on its card; the one on show gives way to the newest left
  const sure = useConfirm();
  const forget = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/letters/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok)
        throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `${res.status}`);
      return id;
    },
    onSuccess: (id) => {
      if (pickedTry === id) setParams({});
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["letters"] }),
  });
  const one = useQuery({
    queryKey: ["letter", shown],
    queryFn: async () => (await (await fetch(`/api/letters/${shown}`)).json()) as Try,
    enabled: Boolean(shown),
    refetchInterval: (query) => (query.state.data?.state === "running" ? 2000 : false),
  });
  // a try opened from Live brings its job along
  useEffect(() => {
    if (one.data && !job) setJob(one.data.listing);
  }, [one.data, job]);
  const write = useMutation({
    mutationFn: () => send("/api/letters", "POST", { listing: job, kind, ask }),
    onSuccess: (j) => {
      setParams(j.id ? { try: j.id } : {});
      queryClient.invalidateQueries({ queryKey: ["letters"] });
    },
  });

  const list = (jobs.data ?? []).filter((j) => `${j.title} ${j.org}`.toLowerCase().includes(q.trim().toLowerCase()));
  const running = tries.data?.some((t) => t.state === "running");
  const ready = Boolean(job && files.data?.ready);
  const t = one.data;
  const box = KINDS.find(([k]) => k === kind);

  return (
    <Page
      title="Writing"
      line="A cover letter, the answer to a form's question, or any text for a job, written exactly the way an application writes it and checked the same. Change your voice or stories below, write again, compare."
    >
      {files.data && !files.data.ready && (
        <EmptyState
          title="Writing can't start yet."
          line="It writes from the applications' folder (your voice, your stories, your profile) and follows the apply skill's letter step. Set both in kestrel's settings."
          detail={files.data.why}
        />
      )}

      {/* the side column 320 wide on a computer, 16 from the try */}
      <div className="grid gap-x-4 gap-y-(--page-gap) lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* the job, and its tries */}
        <section className="grid content-start gap-(--page-gap)">
          <Card>
            <h2 className="font-cond m-0 text-head">The job</h2>
            <Field label="Search your applications" value={q} onChange={setQ} />
            {jobs.data && list.length === 0 ? (
              <p className="m-0 text-detail text-muted">
                {q.trim()
                  ? "No application has those words."
                  : "No jobs yet: one shows here once you apply for it, or mark it Interested."}
              </p>
            ) : (
              // at most half the screen, so a phone turned sideways still scrolls the page around it
              <div className="grid max-h-[min(440px,50vh)] gap-2 overflow-y-auto">
                {list.map((j) => (
                  <button
                    key={j.id}
                    type="button"
                    className="tile"
                    aria-pressed={job === j.id}
                    onClick={() => {
                      setJob(j.id);
                      setParams({});
                    }}
                  >
                    <b className="truncate">{j.title}</b>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`dot ${STATE_TONE[j.state] ?? "tone-muted"}`} />
                      <span className="truncate">
                        {j.org} · {j.state.replace("-", " ")}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <h2 className="font-cond m-0 text-head">What to write</h2>
            <Seg
              label="What to write"
              options={KINDS.map(([value, label, hint]) => ({ value, label, hint }))}
              value={kind}
              onChange={setKind}
            />
            {kind === "letter" || !box ? (
              // the form's one main action: as wide as its words under a mouse, the whole width on touch
              <button
                type="button"
                className="btn btn-primary btn-big justify-self-start pointer-coarse:w-full"
                disabled={!ready || write.isPending || running}
                onClick={() => write.mutate()}
              >
                {(running || write.isPending) && <span className="spin" />}
                {running ? "Writing…" : "Write it"}
              </button>
            ) : (
              <Field
                label={box[3]}
                placeholder={box[4]}
                value={ask}
                onChange={(v) => setAsk(v.slice(0, ASK_MAX))}
                // the words can be typed before a job is picked; only the send waits for it
                onSend={() => ready && write.mutate()}
                sendLabel="Write it"
                busy={write.isPending || running}
                hint={
                  running
                    ? "Writing…"
                    : !job
                      ? "Pick a job above, then Enter writes it"
                      : "Enter writes it · Shift+Enter for a new line"
                }
                tall
              />
            )}
            {write.isError && <p className="m-0 text-detail text-red">{sentence((write.error as Error).message)}</p>}
          </Card>
          {job && (tries.data?.length ?? 0) > 0 && (
            <section className="grid gap-2">
              <h2 className="font-cond m-0 text-head">Tries</h2>
              <div className="grid gap-3">
                {tries.data?.map((x) => (
                  <Card
                    key={x.id}
                    // a letter is named by its job, an answer or a text by what was asked
                    title={<span className="line-clamp-2">{x.ask || x.title}</span>}
                    tone={shown === x.id ? "accent" : undefined}
                    busy={forget.isPending && forget.variables === x.id}
                    meta={
                      <>
                        <span className="chip chip-caps tone-purple">{KIND_NAME[x.kind] ?? "Letter"}</span>
                        {x.state === "failed" && <span className="chip chip-caps tone-red">Failed</span>}
                        {x.state === "running" && (
                          <span className="chip chip-caps tone-yellow">
                            <span className="dot pulse" /> Writing
                          </span>
                        )}
                        <span className="ml-auto text-small text-muted">{when(x.started)}</span>
                      </>
                    }
                    onOpen={() => setParams({ try: x.id })}
                    removeLabel="Delete this try"
                    onRemove={
                      x.state === "running"
                        ? undefined
                        : async () => {
                            const yes = await sure({
                              title: "Delete this try?",
                              // name only what goes: a failed try wrote nothing, and only a letter can have a PDF
                              body: x.pdf
                                ? "Its text and its PDF are deleted too."
                                : x.state === "done"
                                  ? "Its text is deleted too."
                                  : undefined,
                              yes: "Delete",
                              danger: true,
                            });
                            if (yes) forget.mutate(x.id);
                          }
                    }
                  >
                    {x.state === "running" ? `${x.step || "Starting"}…` : undefined}
                  </Card>
                ))}
              </div>
              {/* a refused delete (a try still being written) says so: the box named what would go */}
              {forget.isError && (
                <p className="m-0 text-detail text-red">The delete didn't land: {(forget.error as Error).message}</p>
              )}
            </section>
          )}
        </section>

        {/* the try: the letter, what the check said, the PDF */}
        <section className="grid content-start gap-4">
          {!shown &&
            (!job ? (
              <EmptyState
                title="Pick a job to write for."
                line="Then choose what to write, and write it. The text, what the check said and the PDF show here."
              />
            ) : (
              tries.data && (
                <EmptyState title="Nothing written for this job yet." line="Choose what to write, then Write it." />
              )
            ))}
          {t && t.state === "running" && (
            <Card>
              <span className="flex items-center gap-3">
                <span className="dot tone-green pulse" />
                <span>
                  <b className="text-strong">{t.title}</b>
                  <span className="text-muted"> · {t.step || "Starting"}…</span>
                </span>
              </span>
            </Card>
          )}
          {t && t.state === "failed" && (
            // the try itself, its chips and date, is the open card in the list: here only why it failed
            <Card title="Why it failed">
              <span className="text-ink">{sentence(t.error)}</span>
            </Card>
          )}
          {t && t.state === "done" && <TryView t={t} />}
          {files.data?.ready && <YourFiles />}
        </section>
      </div>
      {/* Ask, the page wide under it: about this job's writing, its latest try and what the check said */}
      {job && (
        <Ask
          app="writing"
          refId={job}
          title="Ask about this job's writing"
          placeholder="Ask about the letter, or how to say something"
          starters={[
            "Does it answer what the job asks?",
            "Which lines could be stronger?",
            "Rewrite the opening in my voice",
          ]}
        />
      )}
    </Page>
  );
}

// a try that wrote: what the check and the review said, what it answered, the text, and a letter's PDF beside it
function TryView({ t }: { t: Try }) {
  const fixed = t.notes.fixed?.length ?? 0;
  return (
    <>
      <div className="grid gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-cond m-0 text-head">{t.title}</h2>
          <span className="ml-auto text-small text-muted">
            {when(t.started)}
            {t.notes.model ? ` · ${t.notes.model}` : ""}
          </span>
        </div>
        {/* the check's state, in the chips' one voice */}
        <div className="flex flex-wrap gap-1.5">
          {t.notes.checked === false ? (
            <span className="chip chip-caps tone-muted">Not checked</span>
          ) : t.notes.findings ? (
            <span className="chip chip-caps tone-orange">The check names something</span>
          ) : (
            <span className="chip chip-caps tone-green">Check passed</span>
          )}
          {fixed > 0 && (
            <span className="chip chip-caps tone-accent">
              Fixed {fixed} time{fixed === 1 ? "" : "s"}
            </span>
          )}
          {t.notes.stepFound === false && (
            <span className="chip chip-caps tone-red">The skill's letter step wasn't found</span>
          )}
        </div>
        {t.notes.checked === false && (
          <p className="m-0 text-small text-muted">The applications' check isn't set up in kestrel's settings.</p>
        )}
      </div>
      {t.notes.review && <ReviewBox r={t.notes.review} />}
      {(t.notes.needs?.length ?? 0) > 0 && (
        <div className="read-box tone-accent grid gap-1">
          <span className="eyebrow tone-accent">What it answered</span>
          {t.notes.needs?.map((n, i) => (
            <p key={n} className="m-0 text-detail">
              <b className="text-strong">{n}</b>
              {t.notes.stories?.[i] && <span className="text-muted"> · {t.notes.stories[i]}</span>}
            </p>
          ))}
        </div>
      )}
      {t.kind !== "letter" && t.ask && (
        <p className="m-0 text-detail text-muted">
          {t.kind === "answer" ? "The question: " : "Asked for: "}
          <span className="text-ink">{t.ask}</span>
        </p>
      )}
      <div className={`grid gap-3 ${t.kind === "letter" ? "xl:grid-cols-2" : ""}`}>
        {/* the text as a document: read, copied or downloaded; it is written again, never edited here */}
        <div className="try-text min-w-0">
          <Doc id={`writing:${t.id}`} name={`${t.title} ${KIND_NAME[t.kind].toLowerCase()}.txt`} text={t.text} rev="" />
        </div>
        {t.kind !== "letter" ? null : t.notes.pdf ? (
          // its link in a bar on top, the height of the Doc's bar beside it, so the letter and the PDF start level
          <div className="grid content-start gap-3">
            <a
              href={`/api/letters/${t.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-quiet justify-self-end"
            >
              Open the PDF ↗
            </a>
            {/* the PDF as an employer gets it: a white page in both themes */}
            <iframe
              title="The PDF"
              src={`/api/letters/${t.id}/pdf`}
              className="h-[70vh] w-full rounded-xl border border-line bg-white"
            />
          </div>
        ) : (
          <EmptyState title="No PDF this time." line={sentence(t.notes.pdfNote || "the PDF tool made none")} />
        )}
      </div>
      {t.notes.pdf && t.notes.pdfNote && (
        <p className="m-0 text-detail text-warn">The PDF tool said: {t.notes.pdfNote}</p>
      )}
      {(t.notes.findings || fixed > 0) && (
        <details className="card">
          <summary className="disclosure">What the check said</summary>
          <pre className="mt-2 mb-0 whitespace-pre-wrap font-mono text-small text-muted">
            {[
              ...(t.notes.fixed ?? []).map((f, i) => `Before fix ${i + 1}:\n${f}`),
              t.notes.findings ? `Still:\n${t.notes.findings}` : "",
            ]
              .filter(Boolean)
              .join("\n\n")}
          </pre>
        </details>
      )}
    </>
  );
}

// the review under a try: the match first (red when it names the wrong company or job), then what a reader would make
// better and whether its version was kept (it is, only when the applications' check passes it), then the first draft
function ReviewBox({ r }: { r: Review }) {
  if ("failed" in r) return <p className="m-0 text-small text-muted">The review didn't run: {r.failed}</p>;
  const off = !r.match.company || !r.match.job;
  const head = r.adopted
    ? `The review made it better: ${r.issues.length} change${r.issues.length === 1 ? "" : "s"}`
    : r.verdict === "ready"
      ? "The review: ready to send"
      : r.held
        ? "The review's version failed the check: the first is kept"
        : "The review found things to make better";
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`chip chip-caps ${r.adopted || r.verdict === "ready" ? "tone-green" : "tone-orange"}`}>
          Review
        </span>
        <b className="text-body text-strong">{head}</b>
      </div>
      {(off || r.match.note) && (
        <p className={`m-0 rounded-lg px-3 py-2 text-detail text-ink ${off ? "bg-pink-soft" : "bg-surface-2"}`}>
          <b className={off ? "text-red" : "text-green"}>{off ? "Check the match: " : "The match: "}</b>
          {r.match.note || (off ? "it may name another company or job" : "")}
        </p>
      )}
      {r.issues.length > 0 && (
        <ol className="m-0 grid list-none gap-3 p-0">
          {r.issues.map((x) => (
            <li key={`${x.quote}|${x.why}`} className="grid gap-0.5 text-detail">
              {x.quote && <i className="text-muted">"{x.quote}"</i>}
              <span className="text-ink">{x.why}</span>
              {x.fix && <span className="text-green">→ {x.fix}</span>}
            </li>
          ))}
        </ol>
      )}
      {r.held && (
        <p className="m-0 text-small text-warn">The check said of the review's version: {r.held.slice(0, 300)}</p>
      )}
      {r.before && (
        <details>
          <summary className="disclosure">The first draft</summary>
          <p className="m-0 mt-2 whitespace-pre-wrap text-detail text-muted">{r.before}</p>
        </details>
      )}
    </Card>
  );
}

// my voice and my stories, the files every application reads: reworked in Notes (select words, note what should
// change, turn the notes into an edit I review), every save kept as a version I can bring back
function YourFiles() {
  const navigate = useNavigate();
  const open = useMutation({
    mutationFn: async (which: "voice" | "stories") => {
      const res = await fetch(`/api/letters/files/${which}/open`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? `${res.status}`);
      return data.id;
    },
    onSuccess: (id) => navigate(`/notes/${id}`),
  });
  return (
    <Card>
      <h2 className="font-cond m-0 text-head">Your voice and stories</h2>
      <p className="m-0 text-detail text-ink">
        Every application writes from these two files. Rework them in Notes: select words, say what should change, and
        turn your notes into an edit you check before it is saved. Every save keeps the previous version.
      </p>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["voice", "Rework my voice"],
            ["stories", "Rework my stories"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" className="btn" disabled={open.isPending} onClick={() => open.mutate(k)}>
            {open.isPending && open.variables === k && <span className="spin" />}
            {label} →
          </button>
        ))}
      </div>
      {open.isError && <p className="m-0 text-detail text-red">{sentence((open.error as Error).message)}</p>}
    </Card>
  );
}
