// Research: ask anything — health, money, travel, a purchase, tech. The computer's model may first ask me a few
// questions, then searches the web, quick or deep, and writes the answer for me like a lesson: the point first, short
// lines to hear one by one, the words explained, each claim's source a link named for its site. It knows what I keep in
// About me and in the context folder (read on this computer only, never put into a search). Every answer is kept.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Ask as AskBox } from "./ask.tsx";
import { block, type Cite, Cites, heard, type Say } from "./learn/blocks.tsx";
import { type Spoken, useReader } from "./learn/voice.ts";
import { Card } from "./ui/card.tsx";
import { useConfirm } from "./ui/confirm.tsx";
import { cx } from "./ui/cx.ts";
import { EmptyState } from "./ui/empty.tsx";
import { Field } from "./ui/field.tsx";
import { Page } from "./ui/page.tsx";

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
const QUESTION_MAX = 1000; // the server's limit on a question
const BACK = { to: "/research", label: "Research" };
// an answer the server doesn't have: final, so it is not asked for again
const GONE = "It may have been deleted.";
const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
// the server's reasons start in lower case, as they read in its log; on the page they start a sentence
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

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

// the same question from the card's ✕ and from the report's Delete; a failed answer has no sources to name
const deleteAnswer = (title: string, sources: boolean) => ({
  title: "Delete this answer?",
  body: sources ? `“${title}” and its sources are deleted for good.` : `“${title}” is deleted for good.`,
  yes: "Delete",
  danger: true,
});

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
  // a kept answer goes with the ✕ on its card
  const sure = useConfirm();
  const forget = useMutation({
    mutationFn: (id: string) => send(`/api/research/${encodeURIComponent(id)}`, "DELETE"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["research"] }),
  });
  const [askMe, setAskMe] = useState(true);
  const [questions, setQuestions] = useState<string[] | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [keep, setKeep] = useState(true);
  // the question box waits while its questions are open, so the focus goes on to the first answer, where the eye goes;
  // in the same commit, so a phone's keyboard moves along instead of closing
  const round = useRef<HTMLFormElement>(null);
  useLayoutEffect(() => {
    if (questions) round.current?.querySelector("input")?.focus();
  }, [questions]);
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
  const kept = rows.filter((r) => r.state !== "running");
  const error = ask.error ?? first.error;
  return (
    <Page
      title="Research"
      line="Ask anything. The computer's model searches the web and writes the answer plainly, like a lesson you can listen to."
    >
      <Card>
        {/* the question waits while its first questions are answered below, and while another answer is written */}
        <Field
          label="Your question"
          placeholder="Anything: which laptop to buy, how a visa works, why my code fails…"
          value={question}
          onChange={(v) => setQuestion(v.slice(0, QUESTION_MAX))}
          onSend={go}
          sendLabel="Research"
          busy={first.isPending || ask.isPending || Boolean(running)}
          disabled={Boolean(questions)}
          hint={
            questions
              ? "Answer the questions below, or skip them"
              : running
                ? "Researching… the next question can go once this answer is written"
                : first.isPending
                  ? "Thinking of a few questions first…"
                  : undefined
          }
          tall
        />
        <fieldset className="seg" aria-label="How deep">
          {LEVELS.map(([k, label, hint]) => (
            <button key={k} type="button" aria-pressed={level === k} onClick={() => setLevel(k)}>
              {label}
              <small>{hint}</small>
            </button>
          ))}
        </fieldset>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button type="button" className="btn" aria-pressed={askMe} onClick={() => setAskMe(!askMe)}>
            {askMe ? "✓ " : ""}Ask me first
          </button>
          <span className="min-w-0 flex-1 text-small text-muted">
            Up to three questions first, when the answer depends on you
          </span>
        </div>
        {error && <p className="m-0 text-detail text-red">{sentence((error as Error).message)}</p>}
      </Card>

      {questions && (
        <Card tone="purple">
          {/* Enter in any answer researches now, the way a form sends */}
          <form
            ref={round}
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!ask.isPending) ask.mutate(true);
            }}
          >
            <span className="eyebrow tone-purple">A few questions first</span>
            {questions.map((q, i) => (
              <label key={q} className="grid gap-1.5">
                <span className="text-body text-strong">{q}</span>
                <input
                  className="btn w-full"
                  value={answers[i] ?? ""}
                  placeholder="Your answer, or leave it empty"
                  enterKeyHint="send"
                  onChange={(e) => setAnswers((a) => a.map((x, j) => (j === i ? e.target.value : x)))}
                />
              </label>
            ))}
            <span className="text-small text-muted">Enter researches now · an empty answer is left out</span>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn" aria-pressed={keep} onClick={() => setKeep(!keep)}>
                {keep ? "✓ " : ""}Keep my answers in About me
              </button>
              <button type="button" className="btn ml-auto" disabled={ask.isPending} onClick={() => ask.mutate(false)}>
                Skip the questions
              </button>
              <button type="submit" className="btn btn-primary inline-flex items-center gap-2" disabled={ask.isPending}>
                {ask.isPending && <span className="spin" />}
                Research now
              </button>
            </div>
          </form>
        </Card>
      )}

      <AboutMe context={context.data} />

      {running && (
        <Card>
          <span className="flex items-center gap-3">
            <span className="dot tone-green pulse" />
            <span className="grid min-w-0">
              <b className="truncate text-strong">{running.question}</b>
              <span className="text-small text-muted">{running.step || "Starting"}…</span>
            </span>
          </span>
        </Card>
      )}

      {list.isError && <p className="m-0 text-detail text-red">{(list.error as Error).message}</p>}
      {/* a refused delete says so: the box named what would go, so silence would read as done */}
      {forget.isError && (
        <p className="m-0 text-detail text-red">The delete didn't land: {(forget.error as Error).message}</p>
      )}
      {kept.length > 0 && (
        <section className="grid gap-3">
          <h2 className="eyebrow m-0">Kept</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {kept.map((r) => (
              <Card
                key={r.id}
                title={r.title || r.question}
                busy={forget.isPending && forget.variables === r.id}
                meta={
                  <>
                    <span className={`chip chip-caps ${r.level === "deep" ? "tone-purple" : "tone-accent"}`}>
                      {r.level}
                    </span>
                    {r.state === "failed" && <span className="chip chip-caps tone-red">Failed</span>}
                    <span className="ml-auto text-small text-muted">{when(r.started)}</span>
                  </>
                }
                onOpen={() => onOpen(r.id)}
                removeLabel={`Delete “${r.title || r.question}”`}
                onRemove={async () => {
                  if (await sure(deleteAnswer(r.title || r.question, r.state === "done"))) forget.mutate(r.id);
                }}
              >
                <span className="line-clamp-2">{r.state === "failed" ? sentence(r.error) : r.short}</span>
              </Card>
            ))}
          </div>
        </section>
      )}
      {list.data && rows.length === 0 && (
        <EmptyState title="Nothing asked yet." line="Ask a question above: the answer is kept here, like a lesson." />
      )}
    </Page>
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
      if (res.status === 404) throw new Error(GONE);
      if (!res.ok) throw new Error(`The server answered ${res.status}: try again in a moment.`);
      return (await res.json()) as Full;
    },
    retry: (n, e) => e.message !== GONE && n < 3,
    refetchInterval: (q) => (q.state.data?.state === "running" ? 2000 : false),
  });
  const sure = useConfirm();
  const drop = useMutation({
    mutationFn: () => send(`/api/research/${encodeURIComponent(id)}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["research"] });
      onBack();
    },
  });
  const r = one.data;
  if (!r)
    return one.isError ? (
      <Page back={BACK} title="This answer didn't load." line={(one.error as Error).message} />
    ) : (
      <Page back={BACK} title="Opening the answer…" />
    );
  const eyebrow = `${r.level === "deep" ? "Deep" : "Quick"} · ${when(r.started)}`;
  if (!r.report)
    return (
      <Page back={BACK} eyebrow={eyebrow} title={r.question}>
        <Card>
          {r.state === "running" ? (
            <span className="flex items-center gap-3">
              <span className="dot tone-green pulse" />
              <span className="text-muted">{r.step || "Starting"}…</span>
            </span>
          ) : (
            <span className="text-red">{sentence(r.error)}</span>
          )}
        </Card>
      </Page>
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
        <p key={w.w} className={cx("m-0", reader.at === i && "reading")}>
          <b className="text-strong">{w.w}</b> <span className="text-muted">— {w.m}</span>
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
      <Page
        back={BACK}
        sticky
        eyebrow={eyebrow}
        title={title}
        actions={
          <>
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
              onClick={() => reader.setSpeed((s) => (s < 1 ? 1 : 0.8))}
            >
              Slow
            </button>
          </>
        }
      >
        <div className="grid gap-2">
          <p className="m-0 text-read text-ink">{lede}</p>
          <p className="m-0 text-small text-muted">You asked: {r.question}</p>
          {r.answers && <p className="m-0 whitespace-pre-line text-small text-muted">You told it: {r.answers}</p>}
        </div>
        {/* the report and, beside it on a computer, its words, what it wasn't sure of and its sources */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="grid text-read">
            <Card>{body}</Card>
          </div>
          <aside className="grid gap-4 lg:sticky lg:top-16">
            {words.length > 0 && (
              <Card>
                <span className="eyebrow tone-accent">{wordsHead}</span>
                {words}
              </Card>
            )}
            {rep.unsure.length > 0 && (
              <section className="callout grid gap-1">
                <span className="eyebrow tone-accent">Not settled</span>
                {rep.unsure.map((u) => (
                  <p key={u} className="m-0">
                    {u}
                  </p>
                ))}
              </section>
            )}
            {used.length > 0 && (
              <Card>
                <h2 className="font-cond m-0 text-head font-bold">Sources</h2>
                <div className="grid gap-1.5">
                  {used.map((s) => (
                    <a
                      key={s.n}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-detail text-accent hover:underline"
                    >
                      <span className="cite !ml-0 shrink-0">{host(s.url)}</span>
                      <span className="truncate text-ink">{s.title || s.url}</span>
                    </a>
                  ))}
                </div>
              </Card>
            )}
          </aside>
        </div>
        {/* the report's foot: who wrote it from what, and its Delete, a button like every other */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-small text-muted">
            Written by {rep.model} from {rep.read.length} pages it read.
          </span>
          <button
            type="button"
            className="btn btn-danger ml-auto"
            disabled={drop.isPending}
            onClick={async () => {
              if (await sure(deleteAnswer(rep.title, rep.refs.length > 0))) drop.mutate();
            }}
          >
            Delete
          </button>
        </div>
        {drop.isError && (
          <p className="m-0 text-detail text-red">The delete didn't land: {(drop.error as Error).message}</p>
        )}
        {/* Ask, the page wide under the report: about the report and its sources */}
        <AskBox
          app="research"
          refId={id}
          title="Ask about this report"
          placeholder="Ask about the report or its sources"
          starters={["What is the main point, in two lines?", "Which sources disagree?", "What should I read next?"]}
        />
      </Page>
    </Cites.Provider>
  );
}

// what Research knows about me, so it asks less and answers for me: About me, a file I write in Notes like my voice
// and stories (every save kept as a version), and the context folder's files
function AboutMe({ context }: { context: Context | undefined }) {
  const navigate = useNavigate();
  const open = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/research/about/open", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? `${res.status}`);
      return data.id;
    },
    onSuccess: (id) => navigate(`/notes/${id}`),
  });
  const files = context?.files.length ?? 0;
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1 text-detail">
          <b className="text-strong">About me</b>
          <span className="text-muted">
            {" "}
            · read before every answer, never put into a web search
            {files ? ` · ${files} context file${files === 1 ? "" : "s"}` : ""}
          </span>
        </span>
        <button type="button" className="btn" disabled={open.isPending} onClick={() => open.mutate()}>
          {open.isPending ? "Opening…" : "Edit in Notes →"}
        </button>
        {open.isError && (
          <span className="basis-full text-small text-red">{sentence((open.error as Error).message)}</span>
        )}
      </div>
    </Card>
  );
}
