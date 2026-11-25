// Research: ask anything — health, money, travel, a purchase, tech. The computer's model may first ask me a few
// questions, then searches the web, quick or deep, and writes the answer for me like a lesson: the point first, short
// lines to hear one by one, the words explained, each claim's source a link named for its site. It knows what I keep in
// About me and in the context folder (read on this computer only, never put into a search). Every answer is kept.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Ask as AskBox } from "./ask.tsx";
import { block, type Cite, Cites, heard, type Say } from "./learn/blocks.tsx";
import { type Spoken, useReader } from "./learn/voice.ts";
import { Card } from "./ui/card.tsx";
import { useConfirm } from "./ui/confirm.tsx";
import { cx } from "./ui/cx.ts";
import { EmptyState } from "./ui/empty.tsx";
import { Field } from "./ui/field.tsx";
import { FilterPanel, FilterRow } from "./ui/filters.tsx";
import { List, Row as ListRow } from "./ui/list.tsx";
import { Page } from "./ui/page.tsx";
import { Pills } from "./ui/pills.tsx";
import { RailPart, WithRail } from "./ui/rail.tsx";
import { SectionHead } from "./ui/section.tsx";
import { Seg } from "./ui/seg.tsx";

type Level = "quick" | "deep";
type Row = {
  id: string;
  question: string;
  level: Level;
  state: "running" | "done" | "failed";
  step: string;
  started: string;
  finished: string | null;
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
// which answers the landing shows: every one, one depth, or the failed ones
type Show = "all" | "quick" | "deep" | "failed";

const LEVELS: [Level, string, string][] = [
  ["quick", "Quick", "One search, three pages, about a minute"],
  ["deep", "Deep", "Several searches, six pages, a few minutes"],
];
// a depth's colour, the same on a card's chip and on its filter pill
const LEVEL_TONE = { quick: "accent", deep: "purple" } as const;
const ASK_ME = "Up to three questions first, when the answer depends on you";
// a toggle beside the depth: a pill whose dot is filled when on and hollow when off (styles.css, .research-toggle)
function Toggle({
  on,
  set,
  hint,
  children,
}: {
  on: boolean;
  set: (on: boolean) => void;
  hint: string;
  children: string;
}) {
  return (
    <button
      type="button"
      className="pill tone-purple research-toggle"
      aria-pressed={on}
      title={hint}
      onClick={() => set(!on)}
    >
      <span className="dot" aria-hidden="true" /> {children}
    </button>
  );
}
const QUESTION_MAX = 1000; // the server's limit on a question
// the filter row joins the answers once there are this many: fewer fit on a screen without it
const FILTER_FROM = 5;
// what to ask, when nothing is asked yet: a tap puts one in the box
const STARTERS = [
  "Which laptop suits light coding and travel?",
  "How does a long-stay visa usually work?",
  "Why would a web page load slowly only on a phone?",
];
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
// a card's date: short enough to share the meta row with two chips on a phone
const day = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
// how long an answer took, from its start to its end, as values and units: 40 s, 3 min, 1 h 5 min, 2 h
const took = (from: string, to: string | null): [number, string][] => {
  if (!to) return [];
  const s = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000));
  if (s < 60) return [[s, "s"]];
  const m = Math.round(s / 60);
  if (m < 60) return [[m, "min"]];
  return m % 60
    ? [
        [Math.floor(m / 60), "h"],
        [m % 60, "min"],
      ]
    : [[m / 60, "h"]];
};
const levelChip = (level: Level) => `chip chip-caps tone-${LEVEL_TONE[level]}`;
// the server's reasons start in lower case, as they read in its log; on the page they start a sentence
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n: number, one: string) => `${one}${n === 1 ? "" : "s"}`;

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
  // the landing's filter stays in the address while a report is open, so Back finds the answers as they were
  const rest = new URLSearchParams(params);
  rest.delete("open");
  const landing = `/research${rest.size ? `?${rest}` : ""}`;
  return open ? (
    <ReportView id={open} back={{ to: landing, label: "Research" }} onBack={() => setParams(rest)} />
  ) : (
    <Ask
      onOpen={(id) =>
        setParams((p) => {
          const next = new URLSearchParams(p);
          next.set("open", id);
          return next;
        })
      }
    />
  );
}

// the landing, News' layout: the answers in the main column, the question in the rail on its right with About me under
// it on a computer; on a phone the question first (the rail starts the work), About me at the foot, where rare actions
// go (styles.css, .research-land)
function Ask({ onOpen }: { onOpen: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
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
  const askBox = useRef<HTMLElement>(null);
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

  // the filter, in the address as on Searches: words to find, and which answers
  const q = params.get("q") ?? "";
  const show = (["quick", "deep", "failed"].includes(params.get("show") ?? "") ? params.get("show") : "all") as Show;
  const set = (key: "q" | "show", value: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value && value !== "all") next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  const changed = q !== "" || show !== "all";
  const reset = () =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.delete("q");
        next.delete("show");
        return next;
      },
      { replace: true },
    );
  const count = {
    all: kept.length,
    quick: kept.filter((r) => r.level === "quick").length,
    deep: kept.filter((r) => r.level === "deep").length,
    failed: kept.filter((r) => r.state === "failed").length,
  };
  const words = q.trim().toLowerCase();
  const shown = kept.filter(
    (r) =>
      (show === "all" || (show === "failed" ? r.state === "failed" : r.level === show)) &&
      (!words || `${r.title} ${r.question} ${r.short}`.toLowerCase().includes(words)),
  );
  const filtering = kept.length >= FILTER_FROM || changed;
  // the newest kept answer (the server sends the newest first; the sort keeps that true either way)
  const latest = kept.reduce<Row | undefined>((a, r) => (!a || r.started > a.started ? r : a), undefined);
  // the one being written shows unless a filter is set: a filter picks among the answers kept
  const writing = changed ? undefined : running;
  // after a delete the focus goes to the card that took its place, or the one before, or the question box
  const grid = useRef<HTMLDivElement>(null);
  const refocus = (at: number) =>
    requestAnimationFrame(() => {
      const opens = grid.current?.querySelectorAll<HTMLElement>(".card-open") ?? [];
      (opens[Math.min(at, opens.length - 1)] ?? askBox.current?.querySelector("textarea"))?.focus();
    });

  return (
    <Page
      app="Research"
      eyebrow="From the web"
      title="Research"
      line={
        // what the counts below don't say: one being written, or when I last asked
        running ? (
          <>
            <span className="dot tone-green pulse mr-2 inline-block align-middle" aria-hidden="true" />
            Writing an answer
          </>
        ) : (
          latest && (
            <>
              Last asked <b className="font-medium text-ink">{day(latest.started)}</b>
            </>
          )
        )
      }
    >
      {/* the rail stays in view while the answers scroll, but not while the questions round is open: the round can
          make it taller than the window, and its buttons must stay in reach */}
      <WithRail
        railFirst
        className={cx("research-land", questions && "research-round")}
        label="A new question, and About me"
        rail={
          <>
            <RailPart id="research-new" title="New question">
              {/* the question waits while its first questions are answered below, and while another answer is written */}
              <section ref={askBox} className="card card-stack research-ask" aria-label="A new question">
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
                        ? "Writing the answer…"
                        : first.isPending
                          ? "Choosing a few questions…"
                          : "Enter sends · Shift+Enter for a new line"
                  }
                  tall
                />
                {/* how deep, and whether it asks first: one row, what the depth means under it */}
                <div className="research-how">
                  <Seg
                    label="How deep"
                    options={LEVELS.map(([value, label, hint]) => ({ value, label, hint }))}
                    value={level}
                    onChange={setLevel}
                  />
                  <Toggle on={askMe} set={setAskMe} hint={ASK_ME}>
                    Ask me first
                  </Toggle>
                </div>
                {error && <p className="m-0 text-detail text-red">{sentence((error as Error).message)}</p>}
              </section>

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
                      <label key={q} className="grid gap-1">
                        <span className="text-body text-strong">{q}</span>
                        <input
                          className="input w-full"
                          value={answers[i] ?? ""}
                          placeholder="Your answer, or leave it empty"
                          enterKeyHint="send"
                          onChange={(e) => setAnswers((a) => a.map((x, j) => (j === i ? e.target.value : x)))}
                        />
                      </label>
                    ))}
                    <span className="text-small text-muted">Enter sends · an empty answer is left out</span>
                    <div className="pills-inline flex flex-wrap items-center gap-2">
                      <Toggle
                        on={keep}
                        set={setKeep}
                        hint="Each answer given is added to About me, so it asks less next time"
                      >
                        Keep in About me
                      </Toggle>
                      <button
                        type="button"
                        className="btn ml-auto"
                        disabled={ask.isPending}
                        onClick={() => ask.mutate(false)}
                      >
                        Skip
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary relative"
                        disabled={ask.isPending}
                        aria-busy={ask.isPending}
                      >
                        {/* its words stay under the spinner, so the button keeps its width */}
                        <span className={cx(ask.isPending && "opacity-0")}>Research now</span>
                        {ask.isPending && <span className="spin absolute inset-0 m-auto" />}
                      </button>
                    </div>
                  </form>
                </Card>
              )}
            </RailPart>
            {/* About me under the question on a computer; on a phone it is rendered at the foot instead, so the eye,
                Tab and a screen reader all meet it last */}
            <div className="hidden lg:block">
              <AboutMe context={context.data} />
            </div>
          </>
        }
      >
        <section className="research-answers" aria-labelledby={kept.length > 0 ? "research-answers" : undefined}>
          {/* the count beside the heading until the filter's pills carry it */}
          {kept.length > 0 && (
            <SectionHead id="research-answers" title="Answers" count={filtering ? undefined : kept.length} />
          )}
          {filtering && (
            // Searches' filter card: the words search the titles, questions and short answers; the pills pick a depth
            // or the failed ones
            <FilterPanel
              find={{ label: "Search the answers", value: q, onChange: (v) => set("q", v) }}
              changed={changed}
              onReset={reset}
            >
              <FilterRow label="Show">
                <Pills<Show>
                  label="Which answers"
                  options={[
                    { value: "all", label: "All", count: count.all },
                    { value: "quick", label: "Quick", count: count.quick, tone: LEVEL_TONE.quick },
                    { value: "deep", label: "Deep", count: count.deep, tone: LEVEL_TONE.deep },
                    ...(count.failed > 0 || show === "failed"
                      ? [{ value: "failed" as const, label: "Failed", count: count.failed, tone: "red" as const }]
                      : []),
                  ]}
                  value={show}
                  onChange={(v) => set("show", v)}
                />
              </FilterRow>
            </FilterPanel>
          )}

          {list.isError && <p className="m-0 text-detail text-red">{(list.error as Error).message}</p>}
          {/* a refused delete says so: the box named what would go, so silence would read as done */}
          {forget.isError && (
            <p className="m-0 text-detail text-red">The delete didn't land: {(forget.error as Error).message}</p>
          )}

          {(list.isLoading || writing || shown.length > 0) && (
            <div ref={grid} className="research-grid" aria-busy={list.isLoading}>
              {/* the first load: the shape of the cards to come */}
              {list.isLoading && ["a", "b", "c", "d"].map((k) => <div key={k} className="card skeleton min-h-36" />)}
              {/* the one being written, first: where it stands, and a bar that moves while it works */}
              {writing && (
                <Card
                  tone="green"
                  title={<span className="line-clamp-2">{writing.question}</span>}
                  onOpen={() => onOpen(writing.id)}
                  meta={
                    <>
                      <span className={levelChip(writing.level)}>{writing.level}</span>
                      <span className="chip chip-caps tone-green">
                        <span className="dot pulse" aria-hidden="true" />
                        Writing
                      </span>
                    </>
                  }
                  // no ✕ while it is written: the date keeps the ✕'s room, so it lines up with the others'
                  end={<span className="research-date-end font-mono">{day(writing.started)}</span>}
                >
                  <p className="m-0 line-clamp-2">{writing.step || "Starting"}…</p>
                  <div className="loading-bar mt-3" aria-hidden="true" />
                </Card>
              )}
              {shown.map((r, i) => {
                const name = r.title || r.question;
                const time = took(r.started, r.finished);
                return (
                  <Card
                    key={r.id}
                    title={<span className="line-clamp-2">{name}</span>}
                    busy={forget.isPending && forget.variables === r.id}
                    meta={
                      <>
                        <span className={levelChip(r.level)}>{r.level}</span>
                        {r.state === "failed" && <span className="chip chip-caps tone-red">Failed</span>}
                      </>
                    }
                    end={<span className="font-mono">{day(r.started)}</span>}
                    onOpen={() => onOpen(r.id)}
                    removeLabel={`Delete “${name}”`}
                    onRemove={async () => {
                      if (await sure(deleteAnswer(name, r.state === "done")))
                        forget.mutate(r.id, { onSuccess: () => refocus(i + (writing ? 1 : 0)) });
                    }}
                  >
                    <p className="m-0 line-clamp-2">{r.state === "failed" ? sentence(r.error) : r.short}</p>
                    {time.length > 0 && (
                      <p className="m-0 mt-2 text-small">
                        {r.state === "failed" ? "Stopped after" : "Written in"}
                        {time.map(([n, unit]) => (
                          <span key={unit}>
                            {" "}
                            <b className="font-mono text-ink">{n}</b> {unit}
                          </span>
                        ))}
                      </p>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {list.data && rows.length === 0 && (
            <EmptyState
              title="Nothing asked yet."
              line="Each answer is kept here, to read or hear again. Try one of these:"
              action={
                // plain pills, as Ask's starters: a tap puts the question in the box (the accent is for acting); the
                // group keeps its name for a screen reader, as Pills' fieldset does
                <fieldset className="pills">
                  <legend className="sr-only">Questions to start with</legend>
                  <div className="pills-row">
                    {STARTERS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="pill"
                        onClick={() => {
                          setQuestion(s);
                          askBox.current?.querySelector("textarea")?.focus();
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </fieldset>
              }
            />
          )}
          {kept.length > 0 && shown.length === 0 && (
            <EmptyState
              title="No answer matches."
              line="Reset the filter to see every answer."
              action={
                <button type="button" className="btn" onClick={reset}>
                  Reset the filter
                </button>
              }
            />
          )}
        </section>
        <div className="lg:hidden">
          <AboutMe context={context.data} />
        </div>
      </WithRail>
    </Page>
  );
}

function ReportView({ id, back, onBack }: { id: string; back: { to: string; label: string }; onBack: () => void }) {
  const queryClient = useQueryClient();
  const reader = useReader();
  const list = useRef<Spoken[]>([]);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  // Words and Not settled start open beside the report on a computer, folded under it on a phone
  const [beside] = useState(() => matchMedia("(min-width: 64rem)").matches);
  // Listen reads the words too: when it reaches them, their fold opens, so the line it lights can be seen
  const wordsFold = useRef<HTMLDetailsElement>(null);
  const wordsAt = useRef<[number, number]>([0, 0]);
  useEffect(() => {
    const [from, to] = wordsAt.current;
    if (reader.at >= from && reader.at < to && wordsFold.current) wordsFold.current.open = true;
  }, [reader.at]);
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
  const head = { back, app: "Research", eyebrow: "From the web" } as const;
  // gone (deleted, or an address mistyped): said at once, with the way back; any other failure: Try again
  if (!r)
    return one.isError ? (
      <Page {...head} title="This answer didn't open">
        {(one.error as Error).message === GONE ? (
          <EmptyState
            title="This answer isn't here any more."
            line="It may have been deleted. Open Research to find the others."
            action={
              <Link to={back.to} className="btn">
                Open Research
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="It didn't load."
            line={(one.error as Error).message}
            action={
              <button type="button" className="btn" onClick={() => one.refetch()}>
                Try again
              </button>
            }
          />
        )}
      </Page>
    ) : (
      <Page {...head} title="Opening the answer…" />
    );
  const rep = r.report;
  // the head's line: the depth as its chip, then the facts with their values bold (pages read, the model, the day)
  const line = (
    <span className="research-line">
      <span className={levelChip(r.level)}>{r.level}</span>
      {r.state === "failed" && <span className="chip chip-caps tone-red">Failed</span>}
      {rep && (
        <span>
          <b className="font-mono text-ink">{rep.read.length}</b> {plural(rep.read.length, "page")} read
        </span>
      )}
      {rep && <span className="font-mono">{rep.model}</span>}
      <span>
        <b className="font-medium text-ink">{when(r.started)}</b>
      </span>
    </span>
  );
  if (!rep)
    return (
      <Page {...head} line={line} title={r.question}>
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
  const wordsFrom = spoken.length;
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
  wordsAt.current = [wordsFrom, spoken.length];
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
        {...head}
        sticky
        line={line}
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
        {/* the report and, in the rail beside it on a computer (under it on a phone), its words, what it wasn't sure
            of and its sources: News' layout, the rail in view under the bar while the report scrolls */}
        <WithRail
          className="research-report"
          label="Its words, what it wasn't sure of, and its sources"
          rail={
            <>
              {words.length > 0 && (
                <details ref={wordsFold} className="research-fold" open={beside}>
                  <summary className="disclosure">
                    {wordsHead} <span className="font-mono text-small text-muted">{words.length}</span>
                  </summary>
                  <div className="card card-stack mt-1 gap-2">{words}</div>
                </details>
              )}
              {rep.unsure.length > 0 && (
                <details className="research-fold" open={beside}>
                  <summary className="disclosure">
                    Not settled <span className="font-mono text-small text-muted">{rep.unsure.length}</span>
                  </summary>
                  <div className="callout mt-1 grid gap-1">
                    {rep.unsure.map((u) => (
                      <p key={u} className="m-0">
                        {u}
                      </p>
                    ))}
                  </div>
                </details>
              )}
              {used.length > 0 && (
                // the pages it read, always in sight: each row opens the page in a tab of its own, its site under its
                // title
                <RailPart id="research-sources" title="Sources" count={used.length}>
                  <List>
                    {used.map((s) => (
                      <ListRow
                        key={s.n}
                        href={s.url}
                        title={s.title || s.url}
                        line={<span className="font-mono">{host(s.url)}</span>}
                      />
                    ))}
                  </List>
                </RailPart>
              )}
            </>
          }
        >
          <div className="grid content-start gap-4">
            <p className="m-0 max-w-[68ch] text-read text-ink">{lede}</p>
            {/* what I asked, quoted: the question, and what I told it before it searched */}
            <blockquote className="inner m-0 grid gap-1 text-detail">
              <span className="eyebrow">You asked</span>
              <span className="text-ink">{r.question}</span>
              {r.answers && (
                <>
                  <span className="eyebrow mt-2">You told it</span>
                  <span className="whitespace-pre-line text-muted">{r.answers}</span>
                </>
              )}
            </blockquote>
            <div className="grid text-read">
              <Card>{body}</Card>
            </div>
          </div>
        </WithRail>
        {/* Ask, the page wide under the report: about the report and its sources */}
        <AskBox
          app="research"
          refId={id}
          title="Ask about this report"
          placeholder="Ask about the report or its sources"
          starters={["What is the main point, in two lines?", "Which sources disagree?", "What should I read next?"]}
        />
        {/* the rare action last, at the page's foot */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-danger"
            disabled={drop.isPending}
            onClick={async () => {
              if (await sure(deleteAnswer(rep.title, rep.refs.length > 0))) drop.mutate();
            }}
          >
            Delete this answer
          </button>
          {drop.isError && (
            <span className="text-detail text-red">The delete didn't land: {(drop.error as Error).message}</span>
          )}
        </div>
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
  // one row: About me and its context files, what it is under it (a phone keeps the short half, so the line stays
  // one line beside the button), and its one action at the end
  return (
    <List>
      <ListRow
        title={
          <>
            About me
            {files > 0 && (
              <span className="font-normal text-muted">
                {" "}
                · <span className="font-mono">{files}</span> context {plural(files, "file")}
              </span>
            )}
          </>
        }
        line={
          open.isError ? (
            <span className="text-red">{sentence((open.error as Error).message)}</span>
          ) : (
            <>
              Read before each answer<span className="pointer-coarse:hidden">, kept out of searches</span>
            </>
          )
        }
        end={
          <button type="button" className="btn btn-sm" disabled={open.isPending} onClick={() => open.mutate()}>
            {open.isPending ? "Opening…" : "Edit in Notes →"}
          </button>
        }
      />
    </List>
  );
}
