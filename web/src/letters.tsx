// Cover letters: a letter for a real job, written the way an application writes it — the apply skill's letter step,
// my voice and stories, the posting — checked by the applications' own check (what it names goes back to be fixed)
// and laid out by their own PDF tool, so this is what an employer would get. My voice and stories are edited here,
// each save keeping the old words; write again and compare the tries.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

type Job = { id: string; title: string; org: string; state: string; at: string };
type TryRow = {
  id: string;
  listing: string;
  title: string;
  state: string;
  step: string;
  started: string;
  error: string;
};
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

export function Letters() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const pickedTry = params.get("try");
  const [job, setJob] = useState(params.get("listing") ?? "");
  const [q, setQ] = useState("");

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
    mutationFn: () => send("/api/letters", "POST", { listing: job }),
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
      <header className="grid gap-1">
        <h2 className="font-cond m-0 text-[34px] font-bold uppercase leading-none tracking-tight">Cover letters</h2>
        <p className="m-0 text-[15px]" style={{ color: "var(--muted)" }}>
          A letter for a real job, written exactly the way an application writes it, checked and laid out the same.
          Change your voice or stories below, write again, compare.
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
          <div className="card grid gap-2 !p-3">
            <span className="eyebrow">The job</span>
            <input
              type="search"
              className="btn"
              placeholder="Search your applications"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="grid max-h-[340px] gap-1 overflow-y-auto">
              {list.map((j) => (
                <button
                  key={j.id}
                  type="button"
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left"
                  style={{
                    background: job === j.id ? "var(--accent-soft)" : undefined,
                    boxShadow: job === j.id ? "0 0 0 1px var(--accent)" : undefined,
                  }}
                  onClick={() => {
                    setJob(j.id);
                    setParams({});
                  }}
                >
                  <span className={`dot ${STATE_TONE[j.state] ?? "tone-muted"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold" style={{ color: "var(--strong)" }}>
                      {j.title}
                    </span>
                    <span className="block truncate text-[12.5px]" style={{ color: "var(--muted)" }}>
                      {j.org} · {j.state.replace("-", " ")}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!job || !files.data?.ready || write.isPending || running}
              onClick={() => write.mutate()}
            >
              {running ? "Writing…" : tries.data?.length && job ? "Write it again" : "Write the letter"}
            </button>
            {write.isError && (
              <p className="m-0 text-sm" style={{ color: "var(--red)" }}>
                {(write.error as Error).message}
              </p>
            )}
          </div>
          {job && (tries.data?.length ?? 0) > 0 && (
            <div className="card grid gap-1 !p-3">
              <span className="eyebrow">Tries</span>
              {tries.data?.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[14px]"
                  style={{ background: shown === x.id ? "var(--surface-2)" : undefined }}
                  onClick={() => setParams({ try: x.id })}
                >
                  <span
                    className={`dot ${x.state === "done" ? "tone-green" : x.state === "failed" ? "tone-red" : "tone-yellow pulse"}`}
                  />
                  {when(x.started)}
                  <span className="ml-auto text-[12.5px]" style={{ color: "var(--muted)" }}>
                    {x.state === "running" ? x.step : x.state}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* the try: the letter, what the check said, the PDF */}
        <section className="grid content-start gap-3">
          {!t && (
            <p className="m-0 text-sm" style={{ color: "var(--muted)" }}>
              Pick a job and write its letter.
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
              <div className="grid gap-3 xl:grid-cols-2">
                <article
                  className="card whitespace-pre-wrap text-[15px] leading-relaxed"
                  style={{ color: "var(--strong)" }}
                >
                  {t.text}
                </article>
                {t.notes.pdf ? (
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
          {files.data?.ready && <FilesEditor files={files.data} />}
        </section>
      </div>
    </main>
  );
}

// my voice and my stories, the files every application reads: a save keeps the old words in kestrel's data folder
function FilesEditor({ files }: { files: { voice: string; stories: string } }) {
  const queryClient = useQueryClient();
  const [which, setWhich] = useState<"voice" | "stories">("voice");
  const [text, setText] = useState(files[which]);
  useEffect(() => setText(files[which]), [files, which]);
  const save = useMutation({
    mutationFn: () => send(`/api/letters/files/${which}`, "PUT", { text }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["letter-files"] }),
  });
  const changed = text !== files[which];
  return (
    <section className="card grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="eyebrow">Your files</span>
        {(
          [
            ["voice", "Voice"],
            ["stories", "Stories"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" className="pill" aria-pressed={which === k} onClick={() => setWhich(k)}>
            {label}
          </button>
        ))}
        <button
          type="button"
          className="btn btn-primary ml-auto"
          disabled={!changed || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </div>
      <p className="m-0 text-[13px]" style={{ color: "var(--muted)" }}>
        Every application reads this file. Saving keeps the previous words in kestrel's data folder.
        {save.isSuccess && !changed ? " Saved." : ""}
      </p>
      {save.isError && (
        <p className="m-0 text-sm" style={{ color: "var(--red)" }}>
          {(save.error as Error).message}
        </p>
      )}
      <textarea
        className="btn font-mono min-h-[420px] text-[13px] leading-relaxed"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck
      />
    </section>
  );
}
