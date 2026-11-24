// Writing: a text for a real job, written the way an application writes it — the apply skill's step for its texts,
// my voice and stories, the posting — a cover letter, the answer to a form's question, or any text I describe. It is
// checked by the applications' own check (what it names goes back to be fixed) and a letter is laid out by their own
// PDF tool, so this is what an employer would get. My voice and stories are edited here, each save keeping the old
// words; write again and compare the tries.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Ask } from "./ask.tsx";
import { Card } from "./ui/card.tsx";
import { useConfirm } from "./ui/confirm.tsx";
import { cx } from "./ui/cx.ts";
import { Doc } from "./ui/doc.tsx";
import { EmptyState } from "./ui/empty.tsx";
import { Field } from "./ui/field.tsx";
import { List, Row } from "./ui/list.tsx";
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
  const [picking, setPicking] = useState(false);
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
  // a try goes with the ✕ on its row; the one on show gives way to the newest left
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
      toTry();
      queryClient.invalidateQueries({ queryKey: ["letters"] });
    },
  });

  const list = (jobs.data ?? []).filter((j) => `${j.title} ${j.org}`.toLowerCase().includes(q.trim().toLowerCase()));
  const picked = jobs.data?.find((j) => j.id === job);
  // with a job picked, the picker folds to that one job; Change, or a word in the search box, opens the list again
  const folded = Boolean(picked) && !picking && !q.trim();
  const running = tries.data?.some((t) => t.state === "running");
  const ready = Boolean(job && files.data?.ready);
  const t = one.data;
  const box = KINDS.find(([k]) => k === kind);
  const pick = (id: string) => {
    setJob(id);
    setParams({});
    setPicking(false);
    setQ("");
    refocus.current = "change";
  };
  const change = () => {
    setPicking(true);
    refocus.current = "search";
  };
  // the picker folds and opens by swapping what is on screen, so the focus goes where the hand goes next: the search
  // box on Change, the Change button after a pick (never on its own, when the page opens folded): asked for by the
  // press, done once the swap is on screen
  const picker = useRef<HTMLDivElement>(null);
  const refocus = useRef<"change" | "search" | null>(null);
  useEffect(() => {
    const to = refocus.current;
    if (!to) return;
    refocus.current = null;
    picker.current?.querySelector<HTMLElement>(to === "search" ? "input" : ".writing-change")?.focus();
  });

  return (
    <Page
      title="Writing"
      line="Letters and answers for a job, in your voice."
      actions={files.data?.ready && <YourFiles />}
    >
      {files.data && !files.data.ready && (
        // what is missing, once, in one row in the chip's tone: the setting itself in mono, at most two lines, all of
        // it in its title
        <p className="read-box tone-orange m-0 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="chip chip-caps tone-orange">Not set up</span>
          <code className="line-clamp-2 min-w-0 font-mono text-small break-words text-ink" title={files.data.why}>
            {files.data.why}
          </code>
        </p>
      )}

      {/* the side column 320 wide on a computer, 16 from the try; on a phone the open try comes first */}
      <div className="grid gap-x-4 gap-y-(--page-gap) lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* the job, what to write, and the job's tries */}
        <section className="grid content-start gap-(--page-gap)">
          <Card>
            {/* the job's part of the card, a box of no layout of its own: only to find what takes the focus */}
            <div ref={picker} className="contents">
              <div className="flex items-center gap-2">
                <h2 className="eyebrow m-0">The job</h2>
                {folded && (
                  <button type="button" className="btn btn-sm writing-change ml-auto" onClick={change}>
                    Change
                  </button>
                )}
              </div>
              {!folded && <Field label="Search your applications" value={q} onChange={setQ} />}
              {folded && picked ? (
                <JobTile j={picked} on onClick={change} />
              ) : jobs.data && list.length === 0 ? (
                <p className="m-0 text-detail text-muted">
                  {q.trim() ? "No application has those words." : "No jobs yet: apply for one, or mark it Interested."}
                </p>
              ) : (
                // at most half the screen, so a phone turned sideways still scrolls the page around it
                <div className="grid max-h-[min(440px,50vh)] gap-2 overflow-y-auto">
                  {list.map((j) => (
                    <JobTile key={j.id} j={j} on={job === j.id} onClick={() => pick(j.id)} />
                  ))}
                </div>
              )}
            </div>
            <h2 className="eyebrow m-0">What to write</h2>
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
              <h2 className="eyebrow m-0">
                Tries <span className="tabular-nums">· {tries.data?.length}</span>
              </h2>
              <List label="Tries">
                {tries.data?.map((x) => (
                  <Row
                    key={x.id}
                    // a letter is named by its job, an answer or a text by what was asked; the open one is marked, and
                    // one being deleted dims while it waits
                    title={
                      <span
                        className={cx(
                          "line-clamp-2",
                          shown === x.id && "writing-open",
                          forget.isPending && forget.variables === x.id && "writing-busy",
                        )}
                      >
                        {x.ask || x.title}
                        {shown === x.id && <span className="sr-only">, open</span>}
                      </span>
                    }
                    // the date first, so the dates line up down the list; a failed try says so last, in red: a word,
                    // not a chip, so the line stays one line in the side column
                    line={
                      <>
                        <span className="font-mono whitespace-nowrap tabular-nums">{when(x.started)}</span> ·{" "}
                        {KIND_NAME[x.kind] ?? "Letter"}
                        {x.state === "failed" && <span className="text-red"> · Failed</span>}
                      </>
                    }
                    onOpen={() => {
                      setParams({ try: x.id });
                      toTry();
                    }}
                    end={
                      x.state === "running" ? (
                        <span className="chip chip-caps tone-yellow">
                          <span className="dot pulse" /> Writing
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="card-remove"
                          aria-label="Delete this try"
                          title="Delete this try"
                          disabled={forget.isPending && forget.variables === x.id}
                          onClick={async () => {
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
                          }}
                        >
                          ✕
                        </button>
                      )
                    }
                  />
                ))}
              </List>
              {/* a refused delete (a try still being written) says so: the box named what would go */}
              {forget.isError && (
                <p className="m-0 text-detail text-red">The delete didn't land: {(forget.error as Error).message}</p>
              )}
            </section>
          )}
        </section>

        {/* the try: what it is and what the check and the review said, then the text and a letter's PDF */}
        <section className={cx("grid content-start gap-3", shown && "max-lg:order-first")}>
          {!shown &&
            (!job ? (
              <EmptyState title="Pick a job to write for." line="Then choose what to write, and write it." />
            ) : (
              tries.data && (
                <EmptyState title="Nothing written for this job yet." line="Choose what to write, then Write it." />
              )
            ))}
          {t && <TryView t={t} />}
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

// on a phone the open try sits at the top of the page, above the list it was picked from: go there
function toTry() {
  if (!matchMedia("(min-width: 64rem)").matches) window.scrollTo(0, 0);
}

// a job to write for: its title over its company and where its application stands
function JobTile({ j, on, onClick }: { j: Job; on: boolean; onClick: () => void }) {
  return (
    <button type="button" className="tile" aria-pressed={on} onClick={onClick}>
      <b className="truncate">{j.title}</b>
      <span className="flex min-w-0 items-center gap-2">
        <span className={`dot ${STATE_TONE[j.state] ?? "tone-muted"}`} />
        <span className="truncate">
          {j.org} · {j.state.replace("-", " ")}
        </span>
      </span>
    </button>
  );
}

// the try's chips: what it is, then what the applications' check said, in the chips' one voice (why a chip says so
// is a line of the card's, under its facts)
function Chips({ t }: { t: Try }) {
  return (
    <>
      <span className="chip chip-caps tone-purple">{KIND_NAME[t.kind] ?? "Letter"}</span>
      {t.state === "running" ? (
        <span className="chip chip-caps tone-yellow">
          <span className="dot pulse" /> Writing
        </span>
      ) : t.state === "failed" ? (
        <span className="chip chip-caps tone-red">Failed</span>
      ) : t.notes.checked === false ? (
        <span className="chip chip-caps tone-muted">Not checked</span>
      ) : t.notes.findings ? (
        <span className="chip chip-caps tone-orange">Check: to fix</span>
      ) : (
        <span className="chip chip-caps tone-green">Check passed</span>
      )}
    </>
  );
}

// the review in a few words: what it did, the value bold
const reviewSaid = (r: Exclude<Review, { failed: string }>) =>
  r.adopted ? "made it better" : r.verdict === "ready" ? "ready to send" : r.held ? "kept the first" : "found things";

// the open try, as one card: the chips and the date, the title, what was asked, the facts with their values bold, the
// match, and what the check and the review said folded under it; then the text, and a letter's PDF beside it
function TryView({ t }: { t: Try }) {
  const n = t.notes;
  const r = n.review && !("failed" in n.review) ? n.review : null;
  const fixed = n.fixed?.length ?? 0;
  const needs = n.needs ?? [];
  const facts: ReactNode[] = [];
  if (r)
    facts.push(
      <>
        Review <b className="text-ink">{reviewSaid(r)}</b>
      </>,
    );
  if (r && r.issues.length > 0)
    facts.push(
      <>
        <b className="text-ink tabular-nums">{r.issues.length}</b> change{r.issues.length === 1 ? "" : "s"}
      </>,
    );
  if (fixed > 0)
    facts.push(
      <>
        Fixed <b className="text-ink tabular-nums">{fixed}</b> time{fixed === 1 ? "" : "s"}
      </>,
    );
  if (n.model) facts.push(<span className="font-mono whitespace-nowrap">{n.model}</span>);
  const off = r ? !r.match.company || !r.match.job : false;
  // what went wrong or was left out, each said once, in a line of its own that I can act on from a phone: at most two
  // lines on screen, all of it in the title
  const warns: [string, string][] = [];
  if (n.stepFound === false) warns.push(["text-red", "The skill's letter step wasn't found."]);
  if (n.checked === false) warns.push(["text-muted", "The applications' check isn't set up in kestrel's settings."]);
  if (n.review && "failed" in n.review) warns.push(["text-muted", `The review didn't run: ${n.review.failed}`]);
  if (r?.held) warns.push(["text-warn", `The check said of the review's version: ${r.held}`]);
  if (t.kind === "letter" && !n.pdf) warns.push(["text-warn", `No PDF: ${n.pdfNote || "the PDF tool made none"}`]);
  if (n.pdf && n.pdfNote) warns.push(["text-warn", `The PDF tool said: ${n.pdfNote}`]);
  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Chips t={t} />
          <span className="ml-auto font-mono text-small text-muted tabular-nums">{when(t.started)}</span>
        </div>
        <div className="grid gap-1">
          <h2 className="font-cond m-0 text-head">{t.title}</h2>
          {t.state === "running" ? (
            <p className="m-0 text-detail text-muted">{t.step || "Starting"}…</p>
          ) : t.state === "failed" ? (
            <p className="m-0 text-detail text-ink">{sentence(t.error)}</p>
          ) : (
            t.kind !== "letter" &&
            t.ask && (
              <p className="m-0 line-clamp-2 text-detail text-muted" title={t.ask}>
                {t.kind === "answer" ? "The question: " : "Asked for: "}
                <span className="text-ink">{t.ask}</span>
              </p>
            )
          )}
        </div>
        {t.state === "done" && facts.length > 0 && (
          <p className="m-0 text-small text-muted">
            {facts.map((f, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the facts are fixed once the try is done
              <span key={i}>
                {i > 0 && " · "}
                {f}
              </span>
            ))}
          </p>
        )}
        {r && (off || r.match.note) && (
          // the match, as the hunt cards say theirs: a ring in its colour, the verdict bold, why after it
          <div className="flex items-start gap-2 text-detail">
            <span className={`match-ring ${off ? "tone-red" : "tone-green"}`} aria-hidden="true" />
            <span>
              <b className={off ? "text-red" : "text-strong"}>{off ? "Check the match" : "Match"}</b>
              {(r.match.note || off) && (
                <span className="text-muted"> · {r.match.note || "it may name another company or job"}</span>
              )}
            </span>
          </div>
        )}
        {t.state === "done" && warns.length > 0 && (
          <ul className="m-0 grid list-none gap-1 p-0">
            {warns.map(([tone, said]) => (
              <li key={said} className={`line-clamp-2 text-small ${tone}`} title={said}>
                {said}
              </li>
            ))}
          </ul>
        )}
        {t.state === "done" && <Folds t={t} r={r} needs={needs} />}
      </Card>
      {t.state === "done" && (
        <div className={cx("grid gap-3", t.kind === "letter" && n.pdf && "xl:grid-cols-2")}>
          {/* the text as a document: read, copied or downloaded; it is written again, never edited here */}
          <div className="try-text min-w-0">
            <Doc
              id={`writing:${t.id}`}
              name={`${t.title} ${KIND_NAME[t.kind].toLowerCase()}.txt`}
              text={t.text}
              rev=""
            />
          </div>
          {t.kind === "letter" && n.pdf && (
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
          )}
        </div>
      )}
    </>
  );
}

// what waits behind a tap, a fold with its count where there is one: the review's changes, what the text answered,
// what the check said (each fix and what is still named), the first draft
function Folds({ t, r, needs }: { t: Try; r: Exclude<Review, { failed: string }> | null; needs: string[] }) {
  const said = [
    ...(t.notes.fixed ?? []).map((f, i) => `Before fix ${i + 1}:\n${f}`),
    t.notes.findings ? `Still:\n${t.notes.findings}` : "",
  ].filter(Boolean);
  const check = said.join("\n\n");
  const any = (r && (r.issues.length > 0 || r.before)) || needs.length > 0 || check;
  if (!any) return null;
  return (
    <div className="grid">
      {r && r.issues.length > 0 && (
        <details>
          <summary className="disclosure">
            The review's changes <span className="font-mono tabular-nums">{r.issues.length}</span>
          </summary>
          <ol className="m-0 mt-1 mb-3 grid list-none gap-3 p-0">
            {r.issues.map((x) => (
              <li key={`${x.quote}|${x.why}`} className="grid gap-0.5 text-detail">
                {x.quote && <i className="text-muted">"{x.quote}"</i>}
                <span className="text-ink">{x.why}</span>
                {x.fix && <span className="text-green">→ {x.fix}</span>}
              </li>
            ))}
          </ol>
        </details>
      )}
      {needs.length > 0 && (
        <details>
          <summary className="disclosure">
            What it answered <span className="font-mono tabular-nums">{needs.length}</span>
          </summary>
          <ul className="m-0 mt-1 mb-3 grid list-none gap-1 p-0">
            {needs.map((x, i) => (
              <li key={x} className="text-detail">
                <b className="text-strong">{x}</b>
                {t.notes.stories?.[i] && <span className="text-muted"> · {t.notes.stories[i]}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {check && (
        <details>
          <summary className="disclosure">
            What the check said <span className="font-mono tabular-nums">{said.length}</span>
          </summary>
          <pre className="mt-1 mb-3 whitespace-pre-wrap font-mono text-small text-muted">{check}</pre>
        </details>
      )}
      {r?.before && (
        <details>
          <summary className="disclosure">The first draft</summary>
          <p className="m-0 mt-1 mb-3 whitespace-pre-wrap text-detail text-muted">{r.before}</p>
        </details>
      )}
    </div>
  );
}

// my voice and my stories, the files every application reads, in the page's head: each opens in Notes (select
// words, note what should change, apply the notes as an edit I review), every save kept as a version I can bring back
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
    <>
      {(
        [
          ["voice", "My voice"],
          ["stories", "My stories"],
        ] as const
      ).map(([k, label]) => (
        <button
          key={k}
          type="button"
          className="btn"
          disabled={open.isPending}
          title="Every application writes from this file. Rework it in Notes; each save keeps the version before"
          aria-describedby={open.isError ? "writing-files-why" : undefined}
          onClick={() => open.mutate(k)}
        >
          {open.isPending && open.variables === k && <span className="spin" />}
          {label} →
        </button>
      ))}
      {open.isError && (
        <span id="writing-files-why" className="basis-full text-small text-red">
          {sentence((open.error as Error).message)}
        </span>
      )}
    </>
  );
}
