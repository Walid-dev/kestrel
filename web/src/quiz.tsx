// Quiz: questions from my lessons — their own Check yourself first, a written one for a lesson without — one at a
// time. I answer in my words; the computer's model marks the meaning and says why. Then the answer explained, like a
// small lesson (the fast model writes it while I answer, kept for next time; Listen reads it), and Ask, to talk it
// through with the model. A quiz is kept as I take it: leaving loses nothing, a started quiz waits on this page to be
// continued, and an ended one opens again on its score, each question a tap away. What I missed comes back first.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { type QuizLesson, questionsIn } from "../../src/shared/quiz.ts";
import { Ask } from "./ask.tsx";
import { block, Code, Inline, type Say } from "./learn/blocks.tsx";
import { type Spoken, useReader } from "./learn/voice.ts";
import { Card } from "./ui/card.tsx";
import { useConfirm } from "./ui/confirm.tsx";
import { cx } from "./ui/cx.ts";
import { EmptyState } from "./ui/empty.tsx";
import { Field } from "./ui/field.tsx";
import { Page } from "./ui/page.tsx";
import { Pills } from "./ui/pills.tsx";

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
  archived: string | null;
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
// a row's short date: room for the quiz's name beside its Archive and ✕ on a phone
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
// a part of a bar: its length is data, so it reaches the class as a variable
const share = (n: number, total: number) => ({ "--part": `${total ? (n / total) * 100 : 0}%` }) as CSSProperties;
const named = (q: { area: Area; scope: string }) => `${q.area === "interview" ? "Interview prep · " : ""}${q.scope}`;
// a score's colour on the money scale: most right is great, few is poor
const scoreTone = (right: number, total: number) => {
  const r = total ? right / total : 0;
  return r >= 0.8 ? "tone-great" : r >= 0.6 ? "tone-good" : r >= 0.4 ? "tone-fair" : "tone-poor";
};

// the start (my ask, 2026-11-23: "simple, but polished and modern"): the quiz I started, large, to continue; a new
// one in three choices — where from, on what (each topic with its lessons and what is due, then its packs and lessons
// as pills to narrow it), how many — and one button that says what it starts; the ones I ended with their score. A
// quiz I no longer use is archived (Archived shows it again, to restore) or deleted. A computer shows the new quiz
// beside the rest.
export function Quiz() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sure = useConfirm();
  const [area, setArea] = useState<Area>("learn");
  const [from, setFrom] = useState(""); // "" everything, or "group:<name>"
  const [packsPicked, setPacksPicked] = useState<string[]>([]);
  const [lessonsPicked, setLessonsPicked] = useState<string[]>([]);
  const [allLessons, setAllLessons] = useState(false); // a long list starts with the due and the picked ones
  const [count, setCount] = useState(10);
  const [fresh, setFresh] = useState(false); // new questions, each written by the model
  const [allStarted, setAllStarted] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  // "Show all" and "Show fewer" leave the pills; the lesson pill to focus next, so the keyboard stays in the list
  const lessonPills = useRef<HTMLDivElement>(null);
  const focusPill = useRef<number | null>(null);
  useEffect(() => {
    if (focusPill.current === null) return;
    lessonPills.current?.querySelectorAll<HTMLButtonElement>("button.pill")[focusPill.current]?.focus();
    focusPill.current = null;
  });

  const packs = useQuery({
    queryKey: ["learn-packs", area],
    queryFn: () => call<{ packs: Pack[] }>(`/api/learn/packs?area=${area}`),
  });
  const lessonList = useQuery({
    queryKey: ["quiz-lessons", area],
    queryFn: () => call<{ lessons: QuizLesson[] }>(`/api/learn/quiz/lessons?area=${area}`),
  });
  const all = packs.data?.packs ?? [];
  const lessonsOf = lessonList.data?.lessons ?? [];
  // a topic's lessons and what is due, counted from the lessons the pills show: the tile, the header and the pills
  // then say the same (Learn's own lesson state, and what the quiz draws first)
  const sum = (ps: Pack[]) => {
    const ids = new Set(ps.map((p) => p.id));
    const ls = lessonsOf.filter((l) => ids.has(l.pack));
    return { lessons: ls.length, due: ls.filter((l) => l.due).length };
  };
  const topics = [
    { key: "", name: "Everything", ...sum(all) },
    ...[...new Set(all.map((p) => p.group).filter(Boolean))].map((g) => ({
      key: `group:${g}`,
      name: g,
      ...sum(all.filter((p) => p.group === g)),
    })),
  ];
  const group = from.startsWith("group:") ? from.slice(6) : "";
  const topic = topics.find((t) => t.key === from);
  // the topic's packs, then the lessons in the packs picked (all the topic's when none is), then the lessons picked
  const topicPacks = group ? all.filter((p) => p.group === group) : all;
  const packIds = new Set(packsPicked.length ? packsPicked : topicPacks.map((p) => p.id));
  const shown = lessonsOf.filter((l) => packIds.has(l.pack));
  const pool = lessonsPicked.length ? shown.filter((l) => lessonsPicked.includes(l.id)) : shown;
  const questions = lessonList.data ? questionsIn(pool, count, fresh, lessonsPicked.length > 0) : count;
  const longList = shown.length > LONG_LIST;
  const short = shown.filter((l) => l.due || lessonsPicked.includes(l.id));
  const listed = longList && !allLessons ? short : shown;
  const packName = (id: string) => all.find((p) => p.id === id)?.name ?? "";
  // what the quiz draws from, in a few words: the line under the pills and the start button's end
  const drawn = lessonsPicked.length
    ? plural(lessonsPicked.length, "lesson")
    : packsPicked.length
      ? `All ${plural(shown.length, "lesson")} in ${packsPicked.length === 1 ? packName(packsPicked[0]) : plural(packsPicked.length, "pack")}`
      : `All ${plural(shown.length, "lesson")}`;
  const on =
    lessonsPicked.length === 1 || lessonsPicked.length === 2
      ? lessonsPicked.map((id) => shown.find((l) => l.id === id)?.title).join(" + ")
      : lessonsPicked.length
        ? plural(lessonsPicked.length, "lesson")
        : packsPicked.length === 1
          ? packName(packsPicked[0])
          : packsPicked.length
            ? plural(packsPicked.length, "pack")
            : group;
  const pickTopic = (key: string) => {
    setFrom(key);
    setPacksPicked([]);
    setLessonsPicked([]);
    setAllLessons(false);
  };
  const pickPacks = (next: string[]) => {
    setPacksPicked(next);
    // a lesson stays picked only while its pack is still in sight
    const keep = new Set(next.length ? next : topicPacks.map((p) => p.id));
    const inPack = new Map((lessonList.data?.lessons ?? []).map((l) => [l.id, l.pack]));
    setLessonsPicked((ls) => ls.filter((id) => keep.has(inPack.get(id) ?? "")));
  };

  const quizzes = useQuery({
    queryKey: ["quizzes"],
    queryFn: () => call<{ quizzes: Summary[] }>("/api/learn/quizzes"),
  });
  const archivedList = useQuery({
    queryKey: ["quizzes", "archived"],
    queryFn: () => call<{ quizzes: Summary[] }>("/api/learn/quizzes?archived=1"),
  });
  const start = useMutation({
    mutationFn: () =>
      call<{ quiz: QuizData }>("/api/learn/quizzes", "POST", {
        area,
        count,
        fresh,
        ...(group ? { group } : {}),
        ...(packsPicked.length ? { packs: packsPicked } : {}),
        ...(lessonsPicked.length ? { lessons: lessonsPicked } : {}),
      }),
    onSuccess: (got) => {
      queryClient.setQueryData(["quiz", got.quiz.id], got);
      queryClient.invalidateQueries({ queryKey: ["quizzes"] });
      navigate(`/quiz/${got.quiz.id}`);
    },
  });
  // archive, restore, delete: each refreshes both lists (the key ["quizzes"] covers the archived one too). It knows
  // the list it came from and the quiz's name, so a failure shows beside that list, naming the quiz.
  type Change = { id: string; to: "archive" | "restore" | "delete"; list: List; name: string };
  const change = useMutation({
    mutationFn: ({ id, to }: Change) =>
      to === "delete" ? call(`/api/learn/quizzes/${id}`, "DELETE") : call(`/api/learn/quizzes/${id}/${to}`, "POST"),
    onSuccess: (_, { id, to }) => {
      if (to === "delete") queryClient.removeQueries({ queryKey: ["quiz", id] });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["quizzes"] }),
  });
  const isBusy = (id: string) => change.isPending && change.variables?.id === id;
  const act = (q: Summary, to: Change["to"], list: List) => change.mutate({ id: q.id, to, list, name: named(q) });
  const failedIn = (list: List) =>
    change.isError && change.variables?.list === list
      ? `Couldn't ${change.variables.to} “${change.variables.name}”: ${(change.error as Error).message}`
      : null;
  const remove = async (q: Summary, list: List) => {
    const yes = await sure({
      title: "Delete this quiz?",
      body: `“${named(q)}” and what you asked about it are deleted for good. What you missed in it still comes first in new quizzes, for two weeks after you answered.`,
      yes: "Delete",
      danger: true,
    });
    if (yes) act(q, "delete", list);
  };
  // the start's own trouble under its button: the start itself, or the topics and lessons it needs
  const failing = [start, packs, lessonList].find((x) => x.isError);
  const started = (quizzes.data?.quizzes ?? []).filter((q) => !q.finished);
  const ended = (quizzes.data?.quizzes ?? []).filter((q) => q.finished);
  const archived = archivedList.data?.quizzes ?? [];
  const due = topics[0].due;
  const startedShown = allStarted ? started : started.slice(0, STARTED_SHOWN);

  return (
    <Page
      title="Quiz"
      line={
        <>
          Questions from your lessons, answered in your own words. The computer's model marks the meaning and explains
          it, and your place is kept.
          {due > 0 && (
            <>
              {" "}
              <b className="text-cyan">{due}</b> {due === 1 ? "lesson" : "lessons"} to review today.
            </>
          )}
        </>
      }
    >
      {/* the new quiz on the left; on a computer the rest share one column on the right, so no gap opens between
          them. On a phone that column dissolves (contents) and the quiz I started comes first, to continue */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start lg:gap-x-8">
        <Card>
          <div className="grid gap-6">
            <h2 className="font-cond m-0 text-head font-bold">{started.length ? "A new quiz" : "Start a quiz"}</h2>
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
                      pickTopic("");
                    }}
                  >
                    {label}
                  </button>
                ))}
              </fieldset>
            </div>
            <div className="grid gap-2.5">
              <span className="eyebrow">On</span>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5">
                {topics.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className="tile"
                    aria-pressed={from === t.key}
                    onClick={() => pickTopic(t.key)}
                  >
                    <b>{t.name}</b>
                    <span>{plural(t.lessons, "lesson")}</span>
                    {t.due > 0 && <span>{t.due} to review</span>}
                  </button>
                ))}
              </div>
            </div>
            {topic && topic.lessons > 0 && (
              <div className="grid gap-4">
                {topicPacks.length > 1 && (
                  <Pills
                    label="Packs"
                    showLabel
                    multiple
                    options={topicPacks.map((p) => ({ value: p.id, label: p.name, count: p.lessons ?? 0 }))}
                    value={packsPicked}
                    onChange={pickPacks}
                  />
                )}
                {shown.length > 0 && (
                  <div ref={lessonPills}>
                    <Pills
                      label="Lessons"
                      showLabel
                      multiple
                      describedBy="quiz-drawn"
                      options={[
                        ...listed.map((l) => ({
                          value: l.id,
                          label: l.title,
                          ...(l.due ? { tone: "cyan" as const, hint: "to review" } : {}),
                        })),
                        // the rest of a long list, one tap away, and back: an action among the pills, so it wraps
                        // with them
                        ...(longList
                          ? [
                              {
                                value: SHOW_MORE,
                                label: allLessons ? "Show fewer" : `Show all ${shown.length}`,
                                onPress: () => {
                                  // the pill tapped leaves: focus the first lesson that came into sight, or, folding,
                                  // the pill that brings them back (the last one of the short list)
                                  focusPill.current = allLessons
                                    ? short.length
                                    : Math.max(
                                        0,
                                        shown.findIndex((l) => !short.includes(l)),
                                      );
                                  setAllLessons(!allLessons);
                                },
                              },
                            ]
                          : []),
                      ]}
                      value={lessonsPicked}
                      onChange={setLessonsPicked}
                    />
                  </div>
                )}
                <p id="quiz-drawn" className="m-0 text-detail text-muted">
                  {drawn}
                  {lessonsPicked.length || packsPicked.length ? "" : ". Pick some to narrow the quiz."}
                </p>
              </div>
            )}
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
            <div className="grid gap-2.5">
              <span className="eyebrow">Questions</span>
              <fieldset className="seg" aria-label="Questions">
                <button type="button" aria-pressed={!fresh} onClick={() => setFresh(false)}>
                  The lessons' own
                  <small>ready at once</small>
                </button>
                <button type="button" aria-pressed={fresh} onClick={() => setFresh(true)}>
                  New ones
                  <small>the model writes each</small>
                </button>
              </fieldset>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-big inline-flex w-full items-center justify-center gap-2"
              disabled={start.isPending || questions === 0}
              onClick={() => start.mutate()}
            >
              {start.isPending && <span className="spin" />}
              {start.isPending
                ? "Picking the questions"
                : questions === 0
                  ? "No lessons here yet"
                  : `Start ${plural(questions, "question")}${on ? ` on ${on}` : ""}`}
            </button>
            <Failed message={failing ? (failing.error as Error).message : null} />
          </div>
        </Card>

        <div className="contents lg:grid lg:content-start lg:gap-6">
          {(started.length > 0 || failedIn("started") || quizzes.isError) && (
            <section className="-order-1 grid content-start gap-3 lg:order-none">
              <h2 className="eyebrow m-0">Pick up where you left off</h2>
              <Failed message={quizzes.isError ? (quizzes.error as Error).message : failedIn("started")} />
              {startedShown.map((q) => (
                <Card key={q.id} busy={isBusy(q.id)}>
                  <div className="flex items-start gap-2">
                    <Link to={`/quiz/${q.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                      <Ring part={q.total ? q.answered / q.total : 0}>
                        {q.answered}/{q.total}
                      </Ring>
                      <span className="grid min-w-0 flex-1 gap-1">
                        <span className="font-cond truncate text-lead font-bold text-strong">{named(q)}</span>
                        <span className="text-detail text-ink">
                          Question {Math.min(q.place + 1, q.total)} of {q.total} · {q.right} right
                          {q.partly ? ` · ${q.partly} partly` : ""}
                        </span>
                        <span className="text-small text-muted">{when(q.updated)}</span>
                      </span>
                    </Link>
                    <button
                      type="button"
                      className="card-remove"
                      aria-label={`Delete "${named(q)}"`}
                      title="Delete"
                      onClick={() => remove(q, "started")}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link to={`/quiz/${q.id}`} className="btn btn-primary btn-big flex-1 text-center">
                      Continue
                    </Link>
                    <button
                      type="button"
                      className="btn btn-quiet btn-big"
                      aria-label={`Archive "${named(q)}"`}
                      onClick={() => act(q, "archive", "started")}
                    >
                      Archive
                    </button>
                  </div>
                </Card>
              ))}
              {started.length > STARTED_SHOWN && (
                <button type="button" className="btn btn-quiet py-3" onClick={() => setAllStarted(!allStarted)}>
                  {allStarted ? "Show fewer" : `Show all ${started.length}`}
                </button>
              )}
            </section>
          )}

          {(ended.length > 0 || failedIn("done")) && (
            <section className="grid content-start gap-3">
              <h2 className="eyebrow m-0">Done</h2>
              <Failed message={failedIn("done")} />
              <div className="card quiz-list grid overflow-hidden !p-0">
                {(allDone ? ended : ended.slice(0, DONE_SHOWN)).map((q) => (
                  <div
                    key={q.id}
                    className={cx(
                      "quiz-done relative flex items-center gap-3 border-line px-4 py-3.5 [&+&]:border-t",
                      isBusy(q.id) && "busy",
                    )}
                  >
                    <span className={`chip quiz-score ${scoreTone(q.right, q.total)}`}>
                      {q.right}/{q.total}
                    </span>
                    <Link
                      to={`/quiz/${q.id}`}
                      className="card-open min-w-0 flex-1 truncate text-body font-semibold text-strong"
                    >
                      {named(q)}
                    </Link>
                    <span className="shrink-0 text-small text-muted" title={when(q.finished ?? q.updated)}>
                      {day(q.finished ?? q.updated)}
                    </span>
                    <span className="flex shrink-0 items-center">
                      <button
                        type="button"
                        className="card-remove quiz-keep"
                        aria-label={`Archive "${named(q)}"`}
                        title="Archive"
                        onClick={() => act(q, "archive", "done")}
                      >
                        <ArchiveIcon />
                      </button>
                      <button
                        type="button"
                        className="card-remove"
                        aria-label={`Delete "${named(q)}"`}
                        title="Delete"
                        onClick={() => remove(q, "done")}
                      >
                        ✕
                      </button>
                    </span>
                  </div>
                ))}
                {ended.length > DONE_SHOWN && (
                  <button
                    type="button"
                    className="btn btn-quiet !rounded-none !border-x-0 !border-b-0 py-3"
                    onClick={() => setAllDone(!allDone)}
                  >
                    {allDone ? "Show fewer" : `Show all ${ended.length}`}
                  </button>
                )}
              </div>
            </section>
          )}

          {(archived.length > 0 || failedIn("archived") || archivedList.isError) && (
            <section className="grid content-start gap-3">
              <Pills
                label="Archived quizzes"
                multiple
                options={[{ value: "archived", label: "Archived", count: archived.length }]}
                value={archivedOpen ? ["archived"] : []}
                onChange={(v) => setArchivedOpen(v.length > 0)}
              />
              <Failed message={archivedList.isError ? (archivedList.error as Error).message : failedIn("archived")} />
              {archivedOpen && archived.length > 0 && (
                <div className="card quiz-list grid overflow-hidden !p-0">
                  {archived.map((q) => (
                    <div
                      key={q.id}
                      className={cx(
                        "quiz-done relative flex flex-wrap items-center gap-x-3 gap-y-2 border-line px-4 py-3.5 [&+&]:border-t",
                        isBusy(q.id) && "busy",
                      )}
                    >
                      <span className={`chip quiz-score ${q.finished ? scoreTone(q.right, q.total) : "tone-muted"}`}>
                        {q.finished ? q.right : q.answered}/{q.total}
                      </span>
                      <Link
                        to={`/quiz/${q.id}`}
                        className="card-open min-w-[9rem] flex-1 truncate text-body font-semibold text-strong"
                      >
                        {named(q)}
                      </Link>
                      <span className="relative z-[1] ml-auto flex shrink-0 gap-2">
                        <button
                          type="button"
                          className="btn"
                          aria-label={`Restore "${named(q)}"`}
                          onClick={() => act(q, "restore", "archived")}
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          aria-label={`Delete "${named(q)}"`}
                          onClick={() => remove(q, "archived")}
                        >
                          Delete
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </Page>
  );
}

const LONG_LIST = 12; // past this many lessons, the pills start with the due and the picked ones
const SHOW_MORE = "\u0000more"; // the "Show all" / "Show fewer" pill's value: no lesson id can be it
const STARTED_SHOWN = 3; // started quizzes shown before "Show all": the new quiz's form stays near the top
const DONE_SHOWN = 8; // ended quizzes shown before "Show all"
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
type List = "started" | "done" | "archived"; // where an archive, restore or delete was asked from

// what went wrong, in red, where it went wrong
function Failed({ message }: { message: string | null }) {
  return message ? (
    <p className="m-0 text-detail text-red" role="alert">
      {message}
    </p>
  ) : null;
}

// Archive's mark: a box with its lid, the slot on its front
function ArchiveIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="5" rx="1" />
      <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" />
    </svg>
  );
}

// how far a started quiz is, as a ring in the quiz's colour with the count inside
function Ring({ part, children }: { part: number; children: ReactNode }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid h-14 w-14 shrink-0 place-items-center">
      <svg viewBox="0 0 56 56" className="absolute inset-0" aria-hidden="true">
        <circle cx="28" cy="28" r={r} fill="none" className="stroke-surface-2" strokeWidth="5" />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          className="stroke-teal"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${Math.max(0.001, c * part)} ${c}`}
          transform="rotate(-90 28 28)"
        />
      </svg>
      <span className="font-mono text-small font-semibold text-strong">{children}</span>
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
      <Page width="reading" back={{ to: "/quiz", label: "Quiz" }} title="This quiz didn't open">
        <Failed message={(loaded.error as Error).message} />
      </Page>
    );
  if (!quiz) return null;
  if (review === null && quiz.place >= quiz.items.length) return <QuizEnd quiz={quiz} />;
  if (!item)
    return (
      <Page width="reading" back={{ to: `/quiz/${quiz.id}`, label: "The score" }} eyebrow={named(quiz)} title="Quiz">
        <EmptyState
          title="No such question in this quiz."
          action={
            <Link to={`/quiz/${quiz.id}`} className="btn">
              Back to the score
            </Link>
          }
        />
      </Page>
    );

  const answered = quiz.answers.filter(Boolean).length;
  const right = quiz.answers.filter((m) => m?.verdict === "right").length;
  const looking = review !== null; // a question looked at again: no answering, back to the score
  const failed = [grade, skip, move, made].find((x) => x.isError);
  return (
    <Page
      width="reading"
      back={looking ? { to: `/quiz/${quiz.id}`, label: "The score" } : { to: "/quiz", label: "Quiz" }}
      eyebrow={named(quiz)}
      title={`Question ${at + 1} of ${quiz.items.length}`}
      line={`${right} of ${answered} right`}
    >
      {/* how far the quiz is: its length is data, so it reaches the bar as a variable */}
      <div className="meter" aria-hidden="true">
        <span className="tone-good" style={share(answered, quiz.items.length)} />
      </div>
      <ArchivedNote quiz={quiz} />
      <Card>
        <Link
          to={`/learn/lesson/${encodeURIComponent(item.lesson)}`}
          className="eyebrow tone-accent relative justify-self-start hover:underline after:absolute after:inset-x-0 after:-inset-y-2"
        >
          {item.packName} · {item.title}
        </Link>
        <p className="font-cond m-0 text-lead font-bold text-strong">
          {question ? <Inline text={question} /> : made.isError ? "No question this time." : "Writing a question…"}
        </p>

        {!mark && !looking && (
          <>
            {/* the round button checks it; Enter does too */}
            <Field
              label="Your answer"
              placeholder="Your answer, in your own words"
              value={answer}
              onChange={setAnswer}
              onSend={() => grade.mutate()}
              busy={grade.isPending}
              disabled={!question}
              sendLabel="Check my answer"
              hint={grade.isPending ? "Marking your answer…" : "Enter checks it · Shift+Enter for a new line"}
              tall
            />
            <div className="flex flex-wrap gap-2">
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
            {/* what I said beside what the lesson says, each in a lesson's tile */}
            <div className={`grid gap-2.5 ${mark?.answer ? "md:grid-cols-2" : ""}`}>
              {mark?.answer && (
                <div className="quiz-said">
                  <span className="eyebrow">You said</span>
                  <p className="m-0">{mark.answer}</p>
                </div>
              )}
              <div className="quiz-said quiz-answer">
                <span className="eyebrow tone-accent">The answer</span>
                <p className="m-0 text-strong">
                  <Inline text={expected} />
                </p>
              </div>
            </div>
            {mark ? (
              <div className={`read-box ${VERDICT[mark.verdict][1]} grid gap-2`}>
                <span className={`chip chip-caps ${VERDICT[mark.verdict][1]} justify-self-start`}>
                  {mark.skipped ? "You didn't know it yet" : VERDICT[mark.verdict][0]}
                </span>
                {mark.why && <p className="m-0 text-body">{mark.why}</p>}
              </div>
            ) : (
              <p className="m-0 text-detail text-muted">You didn't answer this one.</p>
            )}
            {explained.data ? (
              <Explanation e={explained.data} />
            ) : explained.isError ? (
              // no explanation this time: the mark's own lines stand in
              <div className="grid gap-1">
                {(mark?.correct ?? []).map((l, i) =>
                  typeof l === "string" ? (
                    // biome-ignore lint/suspicious/noArrayIndexKey: the answer's lines are fixed once marked
                    <p key={i} className="m-0 text-body">
                      <Inline text={l} />
                    </p>
                  ) : (
                    // biome-ignore lint/suspicious/noArrayIndexKey: the answer's lines are fixed once marked
                    <Code key={i} text={l.code} />
                  ),
                )}
                <p className="m-0 text-small text-muted">
                  The explanation didn't come: {(explained.error as Error).message}
                </p>
              </div>
            ) : (
              <div className="grid gap-2">
                <span className="eyebrow tone-purple inline-flex items-center gap-2">
                  <span className="spin" /> Writing the explanation
                </span>
                {["w1", "w2", "w3"].map((k) => (
                  <div key={k} className={cx("skeleton h-4 rounded", k === "w3" ? "w-3/5" : "w-full")} />
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
        <Failed message={failed ? (failed.error as Error).message : null} />
      </Card>

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
    </Page>
  );
}

// an archived quiz opened from Archived says so, with Restore one tap away: answering it here doesn't bring it back to
// the list, so I'd otherwise finish a quiz that then shows nowhere but Archived
function ArchivedNote({ quiz }: { quiz: QuizData }) {
  const queryClient = useQueryClient();
  const restore = useMutation({
    mutationFn: () => call<{ quiz: QuizData }>(`/api/learn/quizzes/${quiz.id}/restore`, "POST"),
    onSuccess: (got) => {
      queryClient.setQueryData(["quiz", quiz.id], got);
      queryClient.invalidateQueries({ queryKey: ["quizzes"] });
    },
  });
  if (!quiz.archived) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-detail text-muted">
      <span>This quiz is archived.</span>
      <button
        type="button"
        className="btn btn-quiet quiz-restore"
        disabled={restore.isPending}
        onClick={() => restore.mutate()}
      >
        Restore
      </button>
      <Failed message={restore.isError ? (restore.error as Error).message : null} />
    </div>
  );
}

// the end: the score, and every question a tap away to read again (and ask about)
function QuizEnd({ quiz }: { quiz: QuizData }) {
  const right = quiz.answers.filter((m) => m?.verdict === "right").length;
  const partly = quiz.answers.filter((m) => m?.verdict === "partly").length;
  return (
    <Page
      width="reading"
      back={{ to: "/quiz", label: "Quiz" }}
      eyebrow={named(quiz)}
      title={`${right} of ${quiz.items.length} right`}
      line={`${partly ? `${partly} partly. ` : ""}Tap a question to read it again and ask about it.`}
    >
      <ArchivedNote quiz={quiz} />
      <section className="grid gap-2">
        {quiz.items.map((it, i) => {
          const m = quiz.answers[i];
          const [label, tone] = m
            ? m.skipped
              ? ["Didn't know", "tone-red"]
              : VERDICT[m.verdict]
            : ["Skipped", "tone-muted"];
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: a quiz's list is fixed once it ends; a lesson can come twice
            <Card key={`${it.lesson}-${i}`} to={`/quiz/${quiz.id}?q=${i}`}>
              <span className="flex min-w-0 items-center gap-3">
                <span className={`chip chip-caps ${tone}`}>{label}</span>
                <span className="min-w-0 truncate font-semibold text-strong">{it.title}</span>
                <span className="eyebrow ml-auto hidden truncate md:inline">{it.packName}</span>
              </span>
            </Card>
          );
        })}
      </section>
      <Link to="/quiz" className="btn btn-primary btn-big text-center md:justify-self-start">
        Another quiz
      </Link>
    </Page>
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
    <section className="grid gap-3 rounded-2xl border border-line bg-page p-4">
      <div className="flex items-center gap-2">
        <span className="eyebrow tone-purple">Explained</span>
        <button
          type="button"
          className="btn ml-auto"
          onClick={() => (reader.reading ? reader.stop() : reader.play(list.current))}
        >
          {reader.reading ? "■ Stop" : "▶ Listen"}
        </button>
      </div>
      <div className="grid gap-2.5 text-body">{body}</div>
      {e.remember && (
        <div className={`callout tone-green grid gap-1 ${reader.at === remember ? "reading" : ""}`}>
          <span className="eyebrow tone-green">Remember</span>
          <p className="m-0 font-semibold text-strong">
            <Inline text={e.remember} />
          </p>
        </div>
      )}
    </section>
  );
}
