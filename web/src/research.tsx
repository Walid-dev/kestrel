// Research: ask anything — health, money, travel, a purchase, tech. The computer's model may first ask me a few
// questions, then searches the web, quick or deep, and writes the answer for me like a lesson: the point first, short
// lines to hear one by one, the words explained, each claim's source a link named for its site. It knows what I keep in
// About me and in the context folder (read on this computer only, never put into a search). Every answer is kept.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Ask as AskBox } from "./ask.tsx";
import { block, type Cite, Cites, heard, type Say } from "./learn/blocks.tsx";
import { type Spoken, useReader } from "./learn/voice.ts";

type Level = "quick" | "deep";
type Row = {
  id: string;
  question: string;
  level: Level;
  state: "running" | "done" | "failed";
  step: string;
  started: string;
  error: string;
  title: string;
  short: string;
};
type Report = {
  title: string;
  short: string;
  blocks: Record<string, unknown>[];
  words: { w: string; m: string }[];
  unsure: string[];
  sources: number[];
  refs: { n: number; title: string; url: string }[];
  read: number[];
  model: string;
};
type Full = Omit<Row, "title" | "short"> & { report: Report | null; answers: string };
type Context = { about: string; files: { name: string; chars: number }[] };

const LEVELS: [Level, string, string][] = [
  ["quick", "Quick", "one search, three pages, about a minute"],
  ["deep", "Deep", "several searches, six pages, a few minutes"],
];
const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = (await res.json().catch(() => ({}))) as { error?: string; id?: string };
  if (!res.ok) throw new Error(j.error ?? `${res.status}`);
  return j;
}

export function Research() {
  const [params, setParams] = useSearchParams();
  const open = params.get("open");
  return open ? (
    <ReportView id={open} onBack={() => setParams({})} />
  ) : (
    <Ask onOpen={(id) => setParams({ open: id })} />
  );
}

function Ask({ onOpen }: { onOpen: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState("");
  const [level, setLevel] = useState<Level>("quick");
  const list = useQuery({
    queryKey: ["research"],
    queryFn: async () => {
      const res = await fetch("/api/research");
      if (!res.ok) throw new Error(`The answers didn't load (${res.status})`);
      return (await res.json()) as { research: Row[] };
    },
    refetchInterval: (q) => (q.state.data?.research.some((r) => r.state === "running") ? 2000 : false),
  });
  const [askMe, setAskMe] = useState(true);
  const [questions, setQuestions] = useState<string[] | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [keep, setKeep] = useState(true);
  const context = useQuery({
    queryKey: ["research-context"],
    queryFn: async () => (await (await fetch("/api/research/context")).json()) as Context,
  });
  const ask = useMutation({
    mutationFn: async (withAnswers: boolean) => {
      const given = withAnswers
        ? (questions ?? []).map((q, i) => ({ q, a: answers[i] ?? "" })).filter((x) => x.a.trim())
        : [];
      // answers worth keeping go to About me, so it asks less next time
      if (keep && given.length) {
        const add = given.map((x) => `- ${x.q} ${x.a.trim()}`).join("\n");
        const about = `${(context.data?.about ?? "").trimEnd()}\n${add}`.trim();
        await send("/api/research/context", "PUT", { about });
      }
      return send("/api/research", "POST", { question, level, answers: given });
    },
    onSuccess: () => {
      setQuestion("");
      setQuestions(null);
      setAnswers([]);
      queryClient.invalidateQueries({ queryKey: ["research"] });
      queryClient.invalidateQueries({ queryKey: ["research-context"] });
    },
  });
  const first = useMutation({
    mutationFn: async () =>
      ((await send("/api/research/ask", "POST", { question })) as unknown as { questions: string[] }).questions,
    onSuccess: (qs) => {
      if (!qs.length) return ask.mutate(false);
      setQuestions(qs);
      setAnswers(qs.map(() => ""));
    },
  });
  const go = () => (askMe ? first.mutate() : ask.mutate(false));
  const rows = list.data?.research ?? [];
  const running = rows.find((r) => r.state === "running");
  return (
    <main className="grid gap-4">
      <header className="grid gap-1">
        <h2 className="font-cond m-0 text-[34px] font-bold uppercase leading-none tracking-tight">Research</h2>
        <p className="m-0 text-[15px]" style={{ color: "var(--muted)" }}>
          Ask anything. The computer's model searches the web and writes the answer plainly, like a lesson you can
          listen to.
        </p>
      </header>
      <section className="card grid gap-3">
        <textarea
          className="btn min-h-[96px] text-[15px] leading-relaxed"
          placeholder="Anything: should I take creatine, which laptop to buy, how a visa works, why my code fails…"
          value={question}
          maxLength={1000}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && question.trim()) go();
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          {LEVELS.map(([k, label, hint]) => (
            <button key={k} type="button" className="pill" aria-pressed={level === k} onClick={() => setLevel(k)}>
              {label} <span style={{ color: "var(--muted)", fontWeight: 400 }}>· {hint}</span>
            </button>
          ))}
          <button
            type="button"
            className="pill"
            aria-pressed={askMe}
            onClick={() => setAskMe(!askMe)}
            title="The model asks you up to three questions first, when the answer depends on you"
          >
            Ask me first
          </button>
          <button
            type="button"
            className="btn btn-primary ml-auto inline-flex items-center gap-2"
            disabled={!question.trim() || ask.isPending || first.isPending || Boolean(running) || Boolean(questions)}
            onClick={go}
          >
            {(first.isPending || ask.isPending) && <span className="spin" />}
            {running ? "Researching…" : first.isPending ? "Thinking of questions…" : "Research"}
          </button>
        </div>
        {(ask.isError || first.isError) && (
          <p className="m-0 text-sm" style={{ color: "var(--red)" }}>
            {((ask.error ?? first.error) as Error).message}
          </p>
        )}
      </section>

      {questions && (
        <section
          className="card grid gap-3"
          style={{ borderColor: "color-mix(in srgb, var(--purple) 45%, var(--line))" }}
        >
          <span className="eyebrow" style={{ color: "var(--purple)" }}>
            A few questions first
          </span>
          {questions.map((q, i) => (
            <label key={q} className="grid gap-1">
              <span className="text-[15px]" style={{ color: "var(--strong)" }}>
                {q}
              </span>
              <input
                className="btn"
                value={answers[i] ?? ""}
                placeholder="Your answer, or leave it empty"
                onChange={(e) => setAnswers((a) => a.map((x, j) => (j === i ? e.target.value : x)))}
              />
            </label>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="pill" aria-pressed={keep} onClick={() => setKeep(!keep)}>
              Keep my answers in About me
            </button>
            <button type="button" className="btn ml-auto" disabled={ask.isPending} onClick={() => ask.mutate(false)}>
              Skip the questions
            </button>
            <button
              type="button"
              className="btn btn-primary inline-flex items-center gap-2"
              disabled={ask.isPending}
              onClick={() => ask.mutate(true)}
            >
              {ask.isPending && <span className="spin" />}
              Research now
            </button>
          </div>
        </section>
      )}

      <AboutMe context={context.data} />

      {running && (
        <section className="card flex items-center gap-3">
          <span className="dot tone-green pulse" />
          <div className="min-w-0">
            <p className="m-0 truncate font-semibold" style={{ color: "var(--strong)" }}>
              {running.question}
            </p>
            <p className="m-0 text-[13px]" style={{ color: "var(--muted)" }}>
              {running.step || "Starting"}…
            </p>
          </div>
        </section>
      )}

      {rows.filter((r) => r.state !== "running").length > 0 && <span className="eyebrow">Kept</span>}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows
          .filter((r) => r.state !== "running")
          .map((r) => (
            <button
              key={r.id}
              type="button"
              className="card card-link grid content-start gap-1.5 text-left"
              onClick={() => onOpen(r.id)}
            >
              <div className="flex items-center gap-2">
                <span className={`chip chip-caps ${r.level === "deep" ? "tone-purple" : "tone-accent"}`}>
                  {r.level}
                </span>
                {r.state === "failed" && <span className="chip chip-caps tone-red">failed</span>}
                <span className="eyebrow ml-auto">{when(r.started)}</span>
              </div>
              <span className="font-cond text-[19px] font-bold leading-tight" style={{ color: "var(--strong)" }}>
                {r.title || r.question}
              </span>
              <span className="line-clamp-2 text-[14px]" style={{ color: "var(--muted)" }}>
                {r.state === "failed" ? r.error : r.short}
              </span>
            </button>
          ))}
      </section>
      {list.data && rows.length === 0 && (
        <p className="m-0 text-sm" style={{ color: "var(--muted)" }}>
          Nothing asked yet.
        </p>
      )}
    </main>
  );
}

function ReportView({ id, onBack }: { id: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const reader = useReader();
  const list = useRef<Spoken[]>([]);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const one = useQuery({
    queryKey: ["research", id],
    queryFn: async () => {
      const res = await fetch(`/api/research/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`This answer didn't load (${res.status})`);
      return (await res.json()) as Full;
    },
    refetchInterval: (q) => (q.state.data?.state === "running" ? 2000 : false),
  });
  const drop = useMutation({
    mutationFn: () => send(`/api/research/${encodeURIComponent(id)}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["research"] });
      onBack();
    },
  });
  const r = one.data;
  const back = (
    <button type="button" className="btn btn-quiet justify-self-start" onClick={onBack}>
      ← All research
    </button>
  );
  if (!r) return <main className="grid gap-3">{back}</main>;
  if (!r.report)
    return (
      <main className="grid gap-3">
        {back}
        <section className="card grid gap-2">
          <p className="m-0 font-semibold" style={{ color: "var(--strong)" }}>
            {r.question}
          </p>
          <p className="m-0 text-sm" style={{ color: r.state === "failed" ? "var(--red)" : "var(--muted)" }}>
            {r.state === "running" ? `${r.step || "Starting"}…` : r.error}
          </p>
        </section>
      </main>
    );
  const rep = r.report;
  // every heard line registers here in reading order; Listen plays this list and lights its index
  const spoken: Spoken[] = [];
  list.current = spoken;
  const say: Say = {
    add: (text, opts) => spoken.push({ text, pause: opts?.pause }) - 1,
    spoken: reader.at,
    from: (i) => reader.play(list.current, i),
    isOpen: (k) => opened.has(k),
    open: (k) => setOpened((s) => new Set(s).add(k)),
  };
  const title = heard(rep.title, say);
  const lede = heard(rep.short, say);
  const body = rep.blocks.map((b, i) => block(b, say, `b${i}`));
  const wordsHead = rep.words.length ? heard("Words", say) : null;
  const words = rep.words
    .filter((w) => w.w)
    .map((w) => {
      const i = say.add(`${w.w}: ${w.m}`);
      return (
        <p key={w.w} className={`m-0 ${reader.at === i ? "reading" : ""}`}>
          <b style={{ color: "var(--strong)" }}>{w.w}</b> <span style={{ color: "var(--muted)" }}>— {w.m}</span>
        </p>
      );
    });
  const used = rep.refs.filter((x) => (rep.sources.length ? rep.sources : rep.read).includes(x.n));
  const cites = new Map<number, Cite>(rep.refs.map((x) => [x.n, { title: x.title, url: x.url }]));
  const host = (u: string) => {
    try {
      return new URL(u).hostname.replace(/^www\./, "");
    } catch {
      return u;
    }
  };
  return (
    <Cites.Provider value={cites}>
      <main className="grid max-w-3xl gap-4">
        {back}
        <article className="grid gap-4">
          <div className="grid gap-2">
            <span className="eyebrow">
              Research · {r.level === "deep" ? "Deep" : "Quick"} · {when(r.started)}
            </span>
            <h1
              className="font-cond m-0 text-[30px] font-bold leading-tight md:text-[36px]"
              style={{ color: "var(--strong)" }}
            >
              {title}
            </h1>
            <p className="m-0 text-[17px] leading-relaxed" style={{ color: "var(--text)" }}>
              {lede}
            </p>
            <p className="m-0 text-[13px]" style={{ color: "var(--muted)" }}>
              You asked: {r.question}
            </p>
            {r.answers && (
              <p className="m-0 whitespace-pre-line text-[13px]" style={{ color: "var(--muted)" }}>
                You told it: {r.answers}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => (reader.reading ? reader.stop() : reader.play(list.current))}
            >
              {reader.reading ? "■ Stop" : "▶ Listen"}
            </button>
            <button
              type="button"
              className="btn"
              aria-pressed={reader.speed < 1}
              style={reader.speed < 1 ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
              onClick={() => reader.setSpeed((s) => (s < 1 ? 1 : 0.8))}
            >
              Slow
            </button>
          </div>
          <section className="card grid gap-3 text-[16px] leading-relaxed">{body}</section>
          {words.length > 0 && (
            <section className="card grid gap-1.5">
              <span className="eyebrow" style={{ color: "var(--accent)" }}>
                {wordsHead}
              </span>
              {words}
            </section>
          )}
          {rep.unsure.length > 0 && (
            <section className="callout grid gap-1">
              <span className="eyebrow" style={{ color: "var(--accent)" }}>
                Not settled
              </span>
              {rep.unsure.map((u) => (
                <p key={u} className="m-0">
                  {u}
                </p>
              ))}
            </section>
          )}
          {used.length > 0 && (
            <section className="grid gap-1.5">
              <span className="eyebrow">Sources</span>
              {used.map((s) => (
                <a
                  key={s.n}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 items-baseline gap-2 text-[14px] hover:underline"
                  style={{ color: "var(--accent)" }}
                >
                  <span className="cite !ml-0 shrink-0">{host(s.url)}</span>
                  <span className="truncate" style={{ color: "var(--text)" }}>
                    {s.title || s.url}
                  </span>
                </a>
              ))}
            </section>
          )}
          <p className="m-0 text-[12.5px]" style={{ color: "var(--muted)" }}>
            Written by {rep.model} from {rep.read.length} pages it read.{" "}
            <button
              type="button"
              className="underline"
              style={{ color: "var(--red)" }}
              onClick={() => {
                if (confirm("Delete this answer?")) drop.mutate();
              }}
            >
              Delete
            </button>
          </p>
        </article>
        {/* Ask, the page wide under the report: about the report and its sources */}
        <AskBox
          app="research"
          refId={id}
          title="Ask about this report"
          placeholder="Ask about the report or its sources"
          starters={["What is the main point, in two lines?", "Which sources disagree?", "What should I read next?"]}
        />
      </main>
    </Cites.Provider>
  );
}

// what Research knows about me, so it asks less and answers for me: About me (edited here), the context folder's files
function AboutMe({ context }: { context: Context | undefined }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? context?.about ?? "";
  const save = useMutation({
    mutationFn: () => send("/api/research/context", "PUT", { about: shown }),
    onSuccess: () => {
      setText(null);
      queryClient.invalidateQueries({ queryKey: ["research-context"] });
    },
  });
  return (
    <details className="card">
      <summary className="flex cursor-pointer items-center gap-2">
        <span className="eyebrow" style={{ color: "var(--purple)" }}>
          About me
        </span>
        <span className="text-[13px]" style={{ color: "var(--muted)" }}>
          {context?.about.trim() ? "what it knows about you" : "tell it about you, so it answers for you"}
          {context?.files.length
            ? ` · ${context.files.length} context file${context.files.length === 1 ? "" : "s"}`
            : ""}
        </span>
      </summary>
      <div className="mt-3 grid gap-2">
        <textarea
          className="btn min-h-[140px] text-[14px] leading-relaxed"
          placeholder="Your age, where you live, your work, your goals, health facts that matter, your budget, what you like…"
          value={shown}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px]" style={{ color: "var(--muted)" }}>
            Kept on this computer and read only by its model; never put into a web search. More files: research/context
            in kestrel's data folder (.md or .txt).
          </span>
          <button
            type="button"
            className="btn btn-primary ml-auto"
            disabled={text === null || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
        {(context?.files.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {context?.files.map((f) => (
              <span key={f.name} className="chip tone-purple">
                {f.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
