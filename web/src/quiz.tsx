// Quiz: questions from my lessons — their own Check yourself first, a written one for a lesson without — one at a
// time. I answer in my words; the computer's model marks the meaning and says why. Then the answer explained, like a
// small lesson (the fast model writes it while I answer, kept for next time; Listen reads it), and Ask, to talk it
// through with the model. A quiz is kept as I take it: leaving loses nothing, a started quiz waits on this page to be
// continued, and an ended one opens again on its score, each question a tap away. What I missed comes back first.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Ask } from "./ask.tsx";
import { block, Code, Inline, type Say } from "./learn/blocks.tsx";
import { type Spoken, useReader } from "./learn/voice.ts";

type Area = "learn" | "interview";
type Item = { lesson: string; title: string; packName: string; q: string | null; a: string | null };
type Line = string | { code: string };
type Answer = { answer: string; verdict: "right" | "partly" | "wrong"; why: string; correct: Line[]; skipped: boolean };
type QuizData = {
  id: string;
  area: Area;
  scope: string;
  items: Item[];
  answers: (Answer | null)[];
  place: number;
  started: string;
  updated: string;
  finished: string | null;
};
type Summary = Omit<QuizData, "items" | "answers"> & { total: number; answered: number; right: number; partly: number };
type Explained = { blocks: Record<string, unknown>[]; remember: string; kept: boolean };
type Pack = { id: string; name: string; group: string; lessons?: number; due?: number };

const VERDICT: Record<Answer["verdict"], [string, string]> = {
  right: ["✓ Right", "tone-green"],
  partly: ["Partly", "tone-yellow"],
  wrong: ["Not quite", "tone-red"],
};

async function call<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error ?? `${res.status}`);
  return j;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
const named = (q: { area: Area; scope: string }) => `${q.area === "interview" ? "Interview prep · " : ""}${q.scope}`;
// a score's colour on the money scale: most right is great, few is poor
const scoreTone = (right: number, total: number) => {
  const r = total ? right / total : 0;
  return r >= 0.8 ? "tone-great" : r >= 0.6 ? "tone-good" : r >= 0.4 ? "tone-fair" : "tone-poor";
};

// the start (my ask, 2026-11-23: "simple, but polished and modern"): the quiz I started, large, to continue; a new
// one in three choices — where from, on what (each topic with its lessons and what is due), how many — and one button
// that says what it starts; the ones I ended with their score. A computer shows the new quiz beside the rest.
export function Quiz() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [area, setArea] = useState<Area>("learn");
  const [from, setFrom] = useState(""); // "" everything, "group:<name>" or "pack:<id>"
  const [count, setCount] = useState(10);

  const packs = useQuery({
    queryKey: ["learn-packs", area],
    queryFn: () => call<{ packs: Pack[] }>(`/api/learn/packs?area=${area}`),
  });
  const all = packs.data?.packs ?? [];
  const sum = (ps: Pack[]) => ({
    lessons: ps.reduce((n, p) => n + (p.lessons ?? 0), 0),
    due: ps.reduce((n, p) => n + (p.due ?? 0), 0),
  });
  const topics = [
    { key: "", name: "Everything", ...sum(all) },
    ...[...new Set(all.map((p) => p.group).filter(Boolean))].map((g) => ({
      key: `group:${g}`,
      name: g,
      ...sum(all.filter((p) => p.group === g)),
    })),
  ];
  const picked = from.startsWith("pack:")
    ? all.find((p) => `pack:${p.id}` === from)?.name
    : from
      ? topics.find((t) => t.key === from)?.name
      : "";
  const quizzes = useQuery({
    queryKey: ["quizzes"],
    queryFn: () => call<{ quizzes: Summary[] }>("/api/learn/quizzes"),
  });
  const start = useMutation({
    mutationFn: () =>
      call<{ quiz: QuizData }>("/api/learn/quizzes", "POST", {
        area,
        count,
        ...(from.startsWith("group:") ? { group: from.slice(6) } : {}),
        ...(from.startsWith("pack:") ? { pack: from.slice(5) } : {}),
      }),
    onSuccess: (got) => {
      queryClient.setQueryData(["quiz", got.quiz.id], got);
      queryClient.invalidateQueries({ queryKey: ["quizzes"] });
      navigate(`/quiz/${got.quiz.id}`);
    },
  });
  const drop = useMutation({
    mutationFn: (id: string) => call(`/api/learn/quizzes/${id}`, "DELETE"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["quizzes"] }),
  });
  const failing = [start, drop, quizzes].find((x) => x.isError);
  const started = (quizzes.data?.quizzes ?? []).filter((q) => !q.finished);
  const ended = (quizzes.data?.quizzes ?? []).filter((q) => q.finished);
  const due = topics[0].due;

  return (
    <main className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start lg:gap-x-8">
      <header className="grid gap-2 lg:col-span-2">
        <h2 className="font-cond m-0 text-[40px] font-bold uppercase leading-none tracking-tight">Quiz</h2>
        <p className="m-0 max-w-2xl text-[16px] leading-relaxed" style={{ color: "var(--muted)" }}>
          Questions from your lessons, answered in your own words. The computer's model marks the meaning and explains
          it, and your place is kept.
          {due > 0 && (
            <>
              {" "}
              <b style={{ color: "var(--teal)" }}>{due}</b> lessons are due for review.
            </>
          )}
        </p>
      </header>

      {started.length > 0 && (
        <section className="grid content-start gap-3 lg:col-start-2 lg:row-start-2">
          <span className="eyebrow">Pick up where you left off</span>
          {started.map((q) => (
            <article key={q.id} className="card grid gap-4 !p-5">
              <Link to={`/quiz/${q.id}`} className="flex items-center gap-4">
                <Ring part={q.total ? q.answered / q.total : 0}>
                  {q.answered}/{q.total}
                </Ring>
                <span className="grid min-w-0 flex-1 gap-1">
                  <span
                    className="font-cond truncate text-[22px] font-bold leading-tight"
                    style={{ color: "var(--strong)" }}
                  >
                    {named(q)}
                  </span>
                  <span className="text-[14px]" style={{ color: "var(--text)" }}>
                    Question {Math.min(q.place + 1, q.total)} of {q.total} · {q.right} right
                    {q.partly ? ` · ${q.partly} partly` : ""}
                  </span>
                  <span className="text-[13px]" style={{ color: "var(--muted)" }}>
                    {when(q.updated)}
                  </span>
                </span>
              </Link>
              <div className="flex items-center gap-2">
                <Link to={`/quiz/${q.id}`} className="btn btn-primary btn-big flex-1 text-center">
                  Continue
                </Link>
                <button
                  type="button"
                  className="btn btn-quiet btn-big"
                  onClick={() => {
                    if (confirm("Drop this quiz? What you answered still counts for what comes back first."))
                      drop.mutate(q.id);
                  }}
                >
                  Drop
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      <section className="card grid content-start gap-6 !p-5 md:!p-6 lg:col-start-1 lg:row-span-2 lg:row-start-2">
        <h3 className="font-cond m-0 text-[26px] font-bold leading-none" style={{ color: "var(--strong)" }}>
          {started.length ? "A new quiz" : "Start a quiz"}
        </h3>
        <div className="grid gap-2.5">
          <span className="eyebrow">From</span>
          <fieldset className="seg" aria-label="From">
            {(
              [
                ["learn", "Lessons"],
                ["interview", "Interview prep"],
              ] as [Area, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={area === k}
                onClick={() => {
                  setArea(k);
                  setFrom("");
                }}
              >
                {label}
              </button>
            ))}
          </fieldset>
        </div>
        <div className="grid gap-2.5">
          <span className="eyebrow">On</span>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {topics.map((t) => (
              <button
                key={t.key}
                type="button"
                className="tile"
                aria-pressed={from === t.key}
                onClick={() => setFrom(t.key)}
              >
                <b>{t.name}</b>
                <span>
                  {t.lessons} lesson{t.lessons === 1 ? "" : "s"}
                  {t.due ? ` · ${t.due} due` : ""}
                </span>
              </button>
            ))}
          </div>
          <select
            className="btn w-full !rounded-xl !px-4 !py-3 !text-[15px]"
            value={from.startsWith("pack:") ? from : ""}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="Or one pack"
          >
            <option value="">Or one pack…</option>
            {all.map((p) => (
              <option key={p.id} value={`pack:${p.id}`}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2.5">
          <span className="eyebrow">How many</span>
          <fieldset className="seg" aria-label="How many">
            {(
              [
                [5, "quick"],
                [10, "a round"],
                [20, "a long one"],
              ] as const
            ).map(([n, size]) => (
              <button key={n} type="button" aria-pressed={count === n} onClick={() => setCount(n)}>
                {n}
                <small>{size}</small>
              </button>
            ))}
          </fieldset>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-big inline-flex w-full items-center justify-center gap-2"
          disabled={start.isPending}
          onClick={() => start.mutate()}
        >
          {start.isPending && <span className="spin" />}
          {start.isPending ? "Picking the questions" : `Start ${count} questions${picked ? ` on ${picked}` : ""}`}
        </button>
        {failing && (
          <p className="m-0 text-sm" style={{ color: "var(--red)" }}>
            {(failing.error as Error).message}
          </p>
        )}
      </section>

      {ended.length > 0 && (
        <section className="grid content-start gap-3 lg:col-start-2">
          <span className="eyebrow">Done</span>
          <div className="card grid overflow-hidden !p-0">
            {ended.map((q, i) => (
              <Link
                key={q.id}
                to={`/quiz/${q.id}`}
                className="quiz-done flex items-center gap-3 px-4 py-3.5"
                style={{ borderTop: i ? "1px solid var(--line)" : undefined }}
              >
                <span className={`chip ${scoreTone(q.right, q.total)} !px-2.5 !py-1.5 !text-[13px]`}>
                  {q.right}/{q.total}
                </span>
                <span className="truncate text-[15px] font-semibold" style={{ color: "var(--strong)" }}>
                  {named(q)}
                </span>
                <span className="ml-auto shrink-0 text-[13px]" style={{ color: "var(--muted)" }}>
                  {when(q.finished ?? q.updated)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

// how far a started quiz is, as a ring in the quiz's colour with the count inside
function Ring({ part, children }: { part: number; children: ReactNode }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid h-14 w-14 shrink-0 place-items-center">
      <svg viewBox="0 0 56 56" className="absolute inset-0" aria-hidden="true">
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="5" />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke="var(--teal)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${Math.max(0.001, c * part)} ${c}`}
          transform="rotate(-90 28 28)"
        />
      </svg>
      <span className="font-mono text-[12.5px] font-semibold" style={{ color: "var(--strong)" }}>
        {children}
      </span>
    </span>
  );
}

// my answer as I type it, kept in this browser per question: a reload or a step away keeps the words
function useDraft(id: string, at: number): [string, (v: string) => void] {
  const k = `quiz-draft:${id}:${at}`;
  const [value, setValue] = useState("");
  useEffect(() => {
    try {
      setValue(localStorage.getItem(k) ?? "");
    } catch {
      setValue(""); // storage closed (a private window): the box starts empty
    }
  }, [k]);
  const set = (next: string) => {
    setValue(next);
    try {
      if (next) localStorage.setItem(k, next);
      else localStorage.removeItem(k);
    } catch {
      // storage closed: the words live only on the page
    }
  };
  return [value, set];
}

// one quiz: the question I'm on (or, with ?q=<n>, one looked at again from the score), or its score once it ended
export function QuizRun() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const review = params.get("q");
  const queryClient = useQueryClient();
  const key = ["quiz", id];
  const loaded = useQuery({ queryKey: key, queryFn: () => call<{ quiz: QuizData }>(`/api/learn/quizzes/${id}`) });
  const keep = (got: { quiz: QuizData }) => {
    queryClient.setQueryData(key, got);
    queryClient.invalidateQueries({ queryKey: ["quizzes"] });
  };
  const quiz = loaded.data?.quiz;
  const at = review !== null ? Number(review) : (quiz?.place ?? 0);
  const item = quiz?.items[at];
  const mark = quiz?.answers[at] ?? null;
  const [answer, setAnswer] = useDraft(id, at);

  // a lesson without its own check gets its question written, once, and kept in the quiz
  const made = useQuery({
    queryKey: ["quiz-make", id, at],
    queryFn: async () => {
      keep(await call<{ quiz: QuizData }>(`/api/learn/quizzes/${id}/make`, "POST", { index: at }));
      return true;
    },
    enabled: Boolean(item && !item.q),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const question = item?.q ?? "";
  const expected = item?.a ?? "";
  // the explanation is written while I think: ready, most times, when my answer is marked
  const explained = useQuery({
    queryKey: ["quiz-explain", item?.lesson, question],
    queryFn: () => call<Explained>("/api/learn/quiz/explain", "POST", { lesson: item?.lesson, question, expected }),
    enabled: Boolean(item && question && expected),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const grade = useMutation({
    mutationFn: () =>
      call<{ quiz: QuizData }>(`/api/learn/quizzes/${id}/answer`, "POST", { index: at, answer: answer.trim() }),
    onSuccess: (got) => {
      keep(got);
      setAnswer("");
    },
  });
  const skip = useMutation({
    mutationFn: () => call<{ quiz: QuizData }>(`/api/learn/quizzes/${id}/skip`, "POST", { index: at }),
    onSuccess: keep,
  });
  const move = useMutation({
    mutationFn: (place: number) => call<{ quiz: QuizData }>(`/api/learn/quizzes/${id}/place`, "POST", { place }),
    onSuccess: (got) => {
      keep(got);
      window.scrollTo(0, 0);
    },
  });
  // a new question starts clean: what failed on the last one stays with it
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a change of question resets them
  useEffect(() => {
    grade.reset();
    skip.reset();
  }, [id, at]);

  if (loaded.isError)
    return (
      <main className="grid max-w-3xl gap-3">
        <p className="m-0 text-sm" style={{ color: "var(--red)" }}>
          {(loaded.error as Error).message}
        </p>
        <Link to="/quiz" className="btn justify-self-start">
          ← Quizzes
        </Link>
      </main>
    );
  if (!quiz) return null;
  if (review === null && quiz.place >= quiz.items.length) return <QuizEnd quiz={quiz} />;
  if (!item)
    return (
      <main className="grid max-w-3xl gap-3">
        <p className="m-0 text-sm" style={{ color: "var(--muted)" }}>
          No such question in this quiz.
        </p>
        <Link to={`/quiz/${quiz.id}`} className="btn justify-self-start">
          ← The quiz
        </Link>
      </main>
    );

  const answered = quiz.answers.filter(Boolean).length;
  const right = quiz.answers.filter((m) => m?.verdict === "right").length;
  const looking = review !== null; // a question looked at again: no answering, back to the score
  const failed = [grade, skip, move, made].find((x) => x.isError);
  return (
    <main className="grid max-w-3xl gap-4">
      <div className="flex items-center gap-3">
        <Link to={looking ? `/quiz/${quiz.id}` : "/quiz"} className="btn btn-quiet">
          {looking ? "← The score" : "← Quizzes"}
        </Link>
        <span className="eyebrow">
          Question {at + 1} of {quiz.items.length}
        </span>
        <span className="eyebrow ml-auto">
          {right} of {answered} right
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${(answered / quiz.items.length) * 100}%`,
            background: "var(--good)",
            transition: "width .2s",
          }}
        />
      </div>
      <section className="card grid gap-3">
        <Link
          to={`/learn/lesson/${encodeURIComponent(item.lesson)}`}
          className="eyebrow hover:underline"
          style={{ color: "var(--accent)" }}
        >
          {item.packName} · {item.title}
        </Link>
        <p className="font-cond m-0 text-[22px] font-bold leading-snug" style={{ color: "var(--strong)" }}>
          {question ? <Inline text={question} /> : made.isError ? "No question this time." : "Writing a question…"}
        </p>

        {!mark && !looking && (
          <>
            <textarea
              className="btn min-h-[110px] text-[15px] leading-relaxed"
              placeholder="Your answer, in your own words"
              aria-label="Your answer"
              value={answer}
              disabled={!question || grade.isPending}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && answer.trim()) grade.mutate();
              }}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary inline-flex items-center gap-2"
                disabled={!answer.trim() || !question || grade.isPending}
                onClick={() => grade.mutate()}
              >
                {grade.isPending && <span className="spin" />}
                {grade.isPending ? "Marking" : "Check my answer"}
              </button>
              <button
                type="button"
                className="btn"
                disabled={!question || grade.isPending || skip.isPending}
                onClick={() => skip.mutate()}
              >
                I don't know
              </button>
              {made.isError && (
                <button type="button" className="btn ml-auto" onClick={() => move.mutate(at + 1)}>
                  Move on →
                </button>
              )}
            </div>
          </>
        )}

        {(mark || looking) && (
          <div className="grid gap-3">
            {mark?.answer && (
              <p className="m-0 text-[14.5px]" style={{ color: "var(--muted)" }}>
                You said: {mark.answer}
              </p>
            )}
            {mark ? (
              <div className={`read-box ${VERDICT[mark.verdict][1]} grid gap-2`}>
                <span className={`chip chip-caps ${VERDICT[mark.verdict][1]} justify-self-start`}>
                  {mark.skipped ? "You didn't know it yet" : VERDICT[mark.verdict][0]}
                </span>
                {mark.why && <p className="m-0 text-[15px] leading-relaxed">{mark.why}</p>}
              </div>
            ) : (
              <p className="m-0 text-[14.5px]" style={{ color: "var(--muted)" }}>
                You didn't answer this one.
              </p>
            )}
            <div className="grid gap-1">
              <span className="eyebrow" style={{ color: "var(--accent)" }}>
                The answer
              </span>
              <p className="m-0 text-[15.5px] leading-relaxed" style={{ color: "var(--strong)" }}>
                <Inline text={expected} />
              </p>
            </div>
            {explained.data ? (
              <Explanation e={explained.data} />
            ) : explained.isError ? (
              // no explanation this time: the mark's own lines stand in
              <div className="grid gap-1">
                {(mark?.correct ?? []).map((l, i) =>
                  typeof l === "string" ? (
                    // biome-ignore lint/suspicious/noArrayIndexKey: the answer's lines are fixed once marked
                    <p key={i} className="m-0 text-[15px] leading-relaxed">
                      <Inline text={l} />
                    </p>
                  ) : (
                    // biome-ignore lint/suspicious/noArrayIndexKey: the answer's lines are fixed once marked
                    <Code key={i} text={l.code} />
                  ),
                )}
                <p className="m-0 text-[13px]" style={{ color: "var(--muted)" }}>
                  The explanation didn't come: {(explained.error as Error).message}
                </p>
              </div>
            ) : (
              <div className="grid gap-2">
                <span className="eyebrow inline-flex items-center gap-2" style={{ color: "var(--purple)" }}>
                  <span className="spin" /> Writing the explanation
                </span>
                {["w1", "w2", "w3"].map((k) => (
                  <div key={k} className="skeleton h-4 rounded" style={{ width: k === "w3" ? "60%" : "100%" }} />
                ))}
              </div>
            )}
            {!looking && (
              <button
                type="button"
                className="btn btn-primary inline-flex items-center gap-2 justify-self-start"
                disabled={move.isPending}
                onClick={() => move.mutate(at + 1)}
              >
                {move.isPending && <span className="spin" />}
                {at + 1 < quiz.items.length ? "Next question →" : "See my score"}
              </button>
            )}
          </div>
        )}
        {failed && (
          <p className="m-0 text-sm" style={{ color: "var(--red)" }}>
            {(failed.error as Error).message}
          </p>
        )}
      </section>

      {/* Ask: talk the question through with the model, once it's answered; kept with the quiz */}
      {(mark || looking) && question && (
        <Ask
          app="quiz"
          refId={`${quiz.id}:${at}`}
          title="Ask about this question"
          placeholder="Ask anything about this answer"
          starters={
            mark?.verdict === "right"
              ? ["Go one level deeper", "Give me a real-world example", "Quiz me on it another way"]
              : [
                  !mark || mark.skipped ? "Explain it from the start" : "Why was my answer not right?",
                  "Explain it another way",
                  "Give me a real-world example",
                  "Quiz me on it another way",
                ]
          }
        />
      )}
    </main>
  );
}

// the end: the score, and every question a tap away to read again (and ask about)
function QuizEnd({ quiz }: { quiz: QuizData }) {
  const right = quiz.answers.filter((m) => m?.verdict === "right").length;
  const partly = quiz.answers.filter((m) => m?.verdict === "partly").length;
  return (
    <main className="grid max-w-3xl gap-4">
      <div className="flex items-center gap-3">
        <Link to="/quiz" className="btn btn-quiet">
          ← Quizzes
        </Link>
        <span className="eyebrow truncate">{named(quiz)}</span>
      </div>
      <section className="card grid gap-1">
        <span className="font-cond text-[44px] font-bold leading-none" style={{ color: "var(--strong)" }}>
          {right} of {quiz.items.length}
        </span>
        <span style={{ color: "var(--muted)" }}>
          right{partly ? `, ${partly} partly` : ""}. Tap a question to read it again and ask about it.
        </span>
      </section>
      <section className="grid gap-2">
        {quiz.items.map((it, i) => {
          const m = quiz.answers[i];
          const [label, tone] = m
            ? m.skipped
              ? ["Didn't know", "tone-red"]
              : VERDICT[m.verdict]
            : ["Skipped", "tone-muted"];
          return (
            <Link
              // biome-ignore lint/suspicious/noArrayIndexKey: a quiz's list is fixed once it ends; a lesson can come twice
              key={`${it.lesson}-${i}`}
              to={`/quiz/${quiz.id}?q=${i}`}
              className="card card-link flex items-center gap-3 !py-3"
            >
              <span className={`chip chip-caps ${tone}`}>{label}</span>
              <span className="truncate font-semibold" style={{ color: "var(--strong)" }}>
                {it.title}
              </span>
              <span className="eyebrow ml-auto hidden truncate md:inline">{it.packName}</span>
            </Link>
          );
        })}
      </section>
      <Link to="/quiz" className="btn btn-primary justify-self-start">
        Another quiz
      </Link>
    </main>
  );
}

// the answer explained: the lesson's blocks (subheads, lines, the analogy, code in colour, tables), Listen to hear it
function Explanation({ e }: { e: Explained }) {
  const reader = useReader();
  const list = useRef<Spoken[]>([]);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const spoken: Spoken[] = [];
  list.current = spoken;
  const say: Say = {
    add: (text, opts) => spoken.push({ text, pause: opts?.pause }) - 1,
    spoken: reader.at,
    from: (i) => reader.play(list.current, i),
    isOpen: (k) => opened.has(k),
    open: (k) => setOpened((s) => new Set(s).add(k)),
  };
  const body = e.blocks.map((b, i) => block(b, say, `x${i}`));
  const remember = e.remember ? say.add(e.remember) : -1;
  return (
    <section
      className="grid gap-3 rounded-2xl border p-4"
      style={{ borderColor: "var(--line)", background: "var(--bg)" }}
    >
      <div className="flex items-center gap-2">
        <span className="eyebrow" style={{ color: "var(--purple)" }}>
          Explained
        </span>
        <button
          type="button"
          className="btn ml-auto !py-1 text-[13px]"
          onClick={() => (reader.reading ? reader.stop() : reader.play(list.current))}
        >
          {reader.reading ? "■ Stop" : "▶ Listen"}
        </button>
      </div>
      <div className="grid gap-2.5 text-[15.5px] leading-relaxed">{body}</div>
      {e.remember && (
        <div className={`callout tone-green grid gap-1 ${reader.at === remember ? "reading" : ""}`}>
          <span className="eyebrow" style={{ color: "var(--green)" }}>
            Remember
          </span>
          <p className="m-0 font-semibold" style={{ color: "var(--strong)" }}>
            <Inline text={e.remember} />
          </p>
        </div>
      )}
    </section>
  );
}
