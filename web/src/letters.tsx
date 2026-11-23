// Writing: a text for a real job, written the way an application writes it — the apply skill's step for its texts,
// my voice and stories, the posting — a cover letter, the answer to a form's question, or any text I describe. It is
// checked by the applications' own check (what it names goes back to be fixed) and a letter is laid out by their own
// PDF tool, so this is what an employer would get. My voice and stories are edited here, each save keeping the old
// words; write again and compare the tries.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Ask } from "./ask.tsx";
import { enterSends } from "./keys.ts";

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
};
const KINDS: [Kind, string, string][] = [
  ["letter", "Cover letter", ""],
  ["answer", "An answer", "Paste the form's question, like: Why do you want to work here?"],
  ["text", "Any text", "Say what to write, like: a three-line note to the recruiter about my start date"],
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
  };
};
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
  // a try goes with the ✕ on its row; the one on show gives way to the newest left
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
  const t = one.data;

  return (
    <main className="grid gap-4">
      <header className="grid gap-2">
        <h2 className="font-cond m-0 text-[40px] font-bold uppercase leading-none tracking-tight">Writing</h2>
        <p className="m-0 max-w-3xl text-[16px] leading-relaxed" style={{ color: "var(--muted)" }}>
          A cover letter, the answer to a form's question, or any text for a job, written exactly the way an application
          writes it and checked the same. Change your voice or stories below, write again, compare.
        </p>
      </header>
      {files.data && !files.data.ready && (
        <p className="m-0 rounded-xl px-4 py-3 text-sm" style={{ background: "var(--warn-soft)" }}>
          The lab can't write yet: {files.data.why}.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(300px,380px)_1fr]">
        {/* the job, and its tries */}
        <section className="grid content-start gap-3">
          <div className="card grid gap-3 !p-4">
            <h3 className="font-cond m-0 text-[19px] font-bold" style={{ color: "var(--strong)" }}>
              The job
            </h3>
            <input
              type="search"
              className="btn"
              placeholder="Search your applications"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="grid max-h-[360px] gap-1.5 overflow-y-auto">
              {list.map((j) => (
                <button
                  key={j.id}
                  type="button"
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left"
                  style={{
                    background: job === j.id ? "var(--accent-soft)" : "var(--surface-2)",
                    boxShadow: job === j.id ? "0 0 0 1px var(--accent)" : undefined,
                  }}
                  onClick={() => {
                    setJob(j.id);
                    setParams({});
                  }}
                >
                  <span className={`dot ${STATE_TONE[j.state] ?? "tone-muted"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold" style={{ color: "var(--strong)" }}>
                      {j.title}
                    </span>
                    <span className="block truncate text-[12.5px]" style={{ color: "var(--muted)" }}>
                      {j.org} · {j.state.replace("-", " ")}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <h3 className="font-cond m-0 mt-1 text-[19px] font-bold" style={{ color: "var(--strong)" }}>
              What to write
            </h3>
            <fieldset className="seg" aria-label="What to write">
              {KINDS.map(([k, label]) => (
                <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
                  {label}
                </button>
              ))}
            </fieldset>
            {kind !== "letter" && (
              <textarea
                className="btn min-h-[80px] !rounded-xl !px-3.5 !py-2.5 text-[15px] leading-relaxed"
                placeholder={KINDS.find(([k]) => k === kind)?.[2]}
                value={ask}
                maxLength={4000}
                onChange={(e) => setAsk(e.target.value)}
                enterKeyHint="send"
                onKeyDown={enterSends(
                  () => job && files.data?.ready && !write.isPending && !running && ask.trim() && write.mutate(),
                )}
              />
            )}
            <button
              type="button"
              className="btn btn-primary btn-big inline-flex w-full items-center justify-center gap-2"
              disabled={!job || !files.data?.ready || write.isPending || running || (kind !== "letter" && !ask.trim())}
              onClick={() => write.mutate()}
            >
              {(running || write.isPending) && <span className="spin" />}
              {running ? "Writing…" : "Write it"}
            </button>
            {write.isError && (
              <p className="m-0 text-sm" style={{ color: "var(--red)" }}>
                {(write.error as Error).message}
              </p>
            )}
          </div>
          {job && (tries.data?.length ?? 0) > 0 && (
            <div className="card grid gap-1.5 !p-4">
              <h3 className="font-cond m-0 mb-1 text-[19px] font-bold" style={{ color: "var(--strong)" }}>
                Tries
              </h3>
              {tries.data?.map((x) => (
                <div
                  key={x.id}
                  className="relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14.5px]"
                  style={{
                    background: shown === x.id ? "var(--accent-soft)" : "var(--surface-2)",
                    boxShadow: shown === x.id ? "0 0 0 1px var(--accent)" : undefined,
                    opacity: forget.isPending && forget.variables === x.id ? 0.5 : undefined,
                  }}
                >
                  <span
                    className={`dot ${x.state === "done" ? "tone-green" : x.state === "failed" ? "tone-red" : "tone-yellow pulse"}`}
                  />
                  <span className="chip tone-purple shrink-0">{KIND_NAME[x.kind] ?? "Letter"}</span>
                  <button
                    type="button"
                    className="card-open min-w-0 flex-1 truncate text-left"
                    style={{ color: "var(--text)", font: "inherit" }}
                    onClick={() => setParams({ try: x.id })}
                  >
                    {x.ask || when(x.started)}
                  </button>
                  <span className="shrink-0 text-[12.5px]" style={{ color: "var(--muted)" }}>
                    {x.state === "running" ? x.step : x.state === "done" ? when(x.started) : x.state}
                  </span>
                  {x.state !== "running" && (
                    <button
                      type="button"
                      className="card-remove"
                      aria-label="Delete this try"
                      title="Delete"
                      onClick={() => confirm("Delete this try?") && forget.mutate(x.id)}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* the try: the letter, what the check said, the PDF */}
        <section className="grid content-start gap-3">
          {!t && (
            <p className="m-0 text-sm" style={{ color: "var(--muted)" }}>
              Pick a job, choose what to write, and write it.
            </p>
          )}
          {t && t.state === "running" && (
            <div className="card flex items-center gap-3">
              <span className="dot tone-green pulse" />
              <span>
                <b style={{ color: "var(--strong)" }}>{t.title}</b>
                <span style={{ color: "var(--muted)" }}> · {t.step || "Starting"}…</span>
              </span>
            </div>
          )}
          {t && t.state === "failed" && (
            <p className="m-0 rounded-xl px-4 py-3 text-sm" style={{ background: "var(--warn-soft)" }}>
              {t.error}
            </p>
          )}
          {t && t.state === "done" && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-cond text-[20px] font-bold" style={{ color: "var(--strong)" }}>
                  {t.title}
                </span>
                <span className="eyebrow ml-auto">
                  {when(t.started)} · {t.notes.model}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {t.notes.checked === false ? (
                  <span className="chip tone-muted">Not checked: set apply.check</span>
                ) : t.notes.findings ? (
                  <span className="chip tone-orange">The check still names something</span>
                ) : (
                  <span className="chip tone-green">The check names nothing</span>
                )}
                {(t.notes.fixed?.length ?? 0) > 0 && (
                  <span className="chip tone-accent">
                    Fixed {t.notes.fixed?.length} time{t.notes.fixed?.length === 1 ? "" : "s"}
                  </span>
                )}
                {t.notes.stepFound === false && (
                  <span className="chip tone-red">The skill's letter step wasn't found</span>
                )}
              </div>
              {(t.notes.needs?.length ?? 0) > 0 && (
                <div className="read-box tone-accent grid gap-1">
                  <span className="eyebrow" style={{ color: "var(--accent)" }}>
                    What it answered
                  </span>
                  {t.notes.needs?.map((n, i) => (
                    <p key={n} className="m-0 text-[14px]">
                      <b style={{ color: "var(--strong)" }}>{n}</b>
                      {t.notes.stories?.[i] && <span style={{ color: "var(--muted)" }}> · {t.notes.stories[i]}</span>}
                    </p>
                  ))}
                </div>
              )}
              {t.kind !== "letter" && t.ask && (
                <p className="m-0 text-[14px]" style={{ color: "var(--muted)" }}>
                  {t.kind === "answer" ? "The question: " : "Asked for: "}
                  <span style={{ color: "var(--text)" }}>{t.ask}</span>
                </p>
              )}
              <div className={`grid gap-3 ${t.kind === "letter" ? "xl:grid-cols-2" : ""}`}>
                <article
                  className="card whitespace-pre-wrap text-[15px] leading-relaxed"
                  style={{ color: "var(--strong)" }}
                >
                  {t.text}
                </article>
                {t.kind !== "letter" ? null : t.notes.pdf ? (
                  <div className="grid gap-1.5">
                    <iframe
                      title="The PDF"
                      src={`/api/letters/${t.id}/pdf`}
                      className="w-full rounded-2xl border"
                      style={{ height: "70vh", borderColor: "var(--line)", background: "#fff" }}
                    />
                    <a
                      href={`/api/letters/${t.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-quiet justify-self-start"
                    >
                      Open the PDF ↗
                    </a>
                  </div>
                ) : (
                  <p className="m-0 rounded-xl px-4 py-3 text-sm" style={{ background: "var(--warn-soft)" }}>
                    No PDF: {t.notes.pdfNote || "the PDF tool made none"}
                  </p>
                )}
              </div>
              {t.notes.pdf && t.notes.pdfNote && (
                <p className="m-0 text-sm" style={{ color: "var(--warn)" }}>
                  The PDF tool said: {t.notes.pdfNote}
                </p>
              )}
              {(t.notes.findings || (t.notes.fixed?.length ?? 0) > 0) && (
                <details className="card">
                  <summary className="cursor-pointer text-[14px] font-semibold">What the check said</summary>
                  <pre className="mt-2 whitespace-pre-wrap text-[13px]" style={{ color: "var(--muted)" }}>
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
          )}
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
    </main>
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
    <section className="card grid gap-3 !p-4">
      <h3 className="font-cond m-0 text-[19px] font-bold" style={{ color: "var(--strong)" }}>
        Your voice and stories
      </h3>
      <p className="m-0 text-[14.5px] leading-relaxed" style={{ color: "var(--text)" }}>
        Every application writes from these two files. Rework them in Notes: select words, say what should change, and
        turn your notes into an edit you check before it is saved. Every save keeps the previous version.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            ["voice", "Rework my voice"],
            ["stories", "Rework my stories"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className="btn btn-big inline-flex items-center justify-center gap-2"
            disabled={open.isPending}
            onClick={() => open.mutate(k)}
          >
            {open.isPending && open.variables === k && <span className="spin" />}
            {label} →
          </button>
        ))}
      </div>
      {open.isError && (
        <p className="m-0 text-sm" style={{ color: "var(--red)" }}>
          {(open.error as Error).message}
        </p>
      )}
    </section>
  );
}
