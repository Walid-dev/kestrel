// Quiz: questions from my lessons — their own Check yourself first, a written one for a lesson without — one at a
// time. I answer in my words; the computer's model marks the meaning and says why, with the right answer, code shown
// as code. What I missed lately comes back first; the end lists what to read again.
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { Code, Inline } from "./learn/blocks.tsx";

type Area = "learn" | "interview";
type Item = { lesson: string; title: string; packName: string; q: string | null; a: string | null };
type Line = string | { code: string };
type Mark = { verdict: "right" | "partly" | "wrong"; why: string; correct: Line[] };
type Pack = { id: string; name: string; group: string };

const VERDICT: Record<Mark["verdict"], [string, string]> = {
  right: ["✓ Right", "tone-green"],
  partly: ["Partly", "tone-yellow"],
  wrong: ["Not quite", "tone-red"],
};

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error ?? `${res.status}`);
  return j;
}

export function Quiz() {
  const [area, setArea] = useState<Area>("learn");
  const [from, setFrom] = useState(""); // "" everything, "group:<name>" or "pack:<id>"
  const [count, setCount] = useState(10);
  const [items, setItems] = useState<Item[] | null>(null);
  const [at, setAt] = useState(0);
  const [answer, setAnswer] = useState("");
  const [marks, setMarks] = useState<(Mark | null)[]>([]);

  const packs = useQuery({
    queryKey: ["learn-packs", area],
    queryFn: async () => {
      const res = await fetch(`/api/learn/packs?area=${area}`);
      if (!res.ok) throw new Error(`${res.status}`);
      return (await res.json()) as { packs: Pack[] };
    },
  });
  const groups = [...new Set((packs.data?.packs ?? []).map((p) => p.group).filter(Boolean))];

  const start = useMutation({
    mutationFn: async () => {
      const q = new URLSearchParams({ area, count: String(count) });
      if (from.startsWith("group:")) q.set("group", from.slice(6));
      if (from.startsWith("pack:")) q.set("pack", from.slice(5));
      const res = await fetch(`/api/learn/quiz?${q}`);
      if (!res.ok) throw new Error(`The quiz didn't load (${res.status})`);
      return ((await res.json()) as { items: Item[] }).items;
    },
    onSuccess: (got) => {
      if (!got.length) return; // nothing there: the start says so
      setItems(got);
      setAt(0);
      setAnswer("");
      setMarks(got.map(() => null));
    },
  });
  const item = items?.[at] ?? null;
  // a lesson without its own check gets a question written for it, once
  const made = useQuery({
    queryKey: ["quiz-make", item?.lesson],
    queryFn: () => post<{ q: string; a: string }>("/api/learn/quiz/make", { lesson: item?.lesson }),
    enabled: Boolean(item && !item.q),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const question = item?.q ?? made.data?.q ?? "";
  const expected = item?.a ?? made.data?.a ?? "";
  const grade = useMutation({
    mutationFn: () =>
      post<Mark>("/api/learn/quiz/grade", { lesson: item?.lesson, question, expected, answer: answer.trim() }),
    onSuccess: (m) => setMarks((all) => all.map((x, i) => (i === at ? m : x))),
  });
  const mark = marks[at] ?? null;
  const next = () => {
    setAt((n) => n + 1);
    setAnswer("");
    grade.reset();
  };

  // the end: the score and what to read again
  if (items && at >= items.length) {
    const right = marks.filter((m) => m?.verdict === "right").length;
    const partly = marks.filter((m) => m?.verdict === "partly").length;
    return (
      <main className="grid max-w-3xl gap-4">
        <h2 className="font-cond m-0 text-[34px] font-bold uppercase leading-none tracking-tight">Quiz</h2>
        <section className="card grid gap-1">
          <span className="font-cond text-[44px] font-bold leading-none" style={{ color: "var(--strong)" }}>
            {right} of {items.length}
          </span>
          <span style={{ color: "var(--muted)" }}>
            right{partly ? `, ${partly} partly` : ""}. The ones to read again are below.
          </span>
        </section>
        <section className="grid gap-2">
          {items.map((it, i) => {
            const m = marks[i];
            const [label, tone] = m ? VERDICT[m.verdict] : ["Skipped", "tone-muted"];
            return (
              <Link
                // biome-ignore lint/suspicious/noArrayIndexKey: a quiz's list is fixed once it ends; a lesson can come twice
                key={`${it.lesson}-${i}`}
                to={`/learn/lesson/${encodeURIComponent(it.lesson)}`}
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
        <button type="button" className="btn btn-primary justify-self-start" onClick={() => setItems(null)}>
          Another quiz
        </button>
      </main>
    );
  }

  // one question at a time
  if (items && item) {
    const done = marks.filter(Boolean).length;
    return (
      <main className="grid max-w-3xl gap-4">
        <div className="flex items-center gap-3">
          <button type="button" className="btn btn-quiet" onClick={() => setItems(null)}>
            ← Stop
          </button>
          <span className="eyebrow">
            Question {at + 1} of {items.length}
          </span>
          <span className="eyebrow ml-auto">
            {marks.filter((m) => m?.verdict === "right").length} of {done} right
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${(at / items.length) * 100}%`, background: "var(--accent)", transition: "width .2s" }}
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
          {!mark && (
            <>
              <textarea
                className="btn min-h-[110px] text-[15px] leading-relaxed"
                placeholder="Your answer, in your own words"
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
                  className="btn btn-primary"
                  disabled={!answer.trim() || !question || grade.isPending}
                  onClick={() => grade.mutate()}
                >
                  {grade.isPending ? "Marking…" : "Check my answer"}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={!question || grade.isPending}
                  onClick={() =>
                    setMarks((all) =>
                      all.map((x, i) =>
                        i === at ? { verdict: "wrong", why: "You didn't know it yet.", correct: [expected] } : x,
                      ),
                    )
                  }
                >
                  I don't know
                </button>
              </div>
              {(grade.isError || made.isError) && (
                <p className="m-0 text-sm" style={{ color: "var(--red)" }}>
                  {((grade.error ?? made.error) as Error).message}
                </p>
              )}
            </>
          )}
          {mark && (
            <div className="grid gap-3">
              {answer.trim() && (
                <p className="m-0 text-[14.5px]" style={{ color: "var(--muted)" }}>
                  You said: {answer.trim()}
                </p>
              )}
              <div className={`read-box ${VERDICT[mark.verdict][1]} grid gap-2`}>
                <span className={`chip chip-caps ${VERDICT[mark.verdict][1]} justify-self-start`}>
                  {VERDICT[mark.verdict][0]}
                </span>
                {mark.why && <p className="m-0 text-[15px] leading-relaxed">{mark.why}</p>}
              </div>
              <div className="grid gap-1">
                <span className="eyebrow" style={{ color: "var(--accent)" }}>
                  The answer
                </span>
                {mark.correct.map((l, i) =>
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
              </div>
              <button type="button" className="btn btn-primary justify-self-start" onClick={next}>
                {at + 1 < items.length ? "Next question →" : "See my score"}
              </button>
            </div>
          )}
        </section>
      </main>
    );
  }

  // the start: where the questions come from and how many
  return (
    <main className="grid max-w-3xl gap-4">
      <header className="grid gap-1">
        <h2 className="font-cond m-0 text-[34px] font-bold uppercase leading-none tracking-tight">Quiz</h2>
        <p className="m-0 text-[15px]" style={{ color: "var(--muted)" }}>
          Questions from your lessons. Answer in your own words; the computer's model marks the meaning and says why.
        </p>
      </header>
      <section className="card grid gap-3">
        <span className="eyebrow">From</span>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["learn", "Learn"],
              ["interview", "Interview prep"],
            ] as [Area, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className="pill"
              aria-pressed={area === k}
              onClick={() => {
                setArea(k);
                setFrom("");
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="pill" aria-pressed={from === ""} onClick={() => setFrom("")}>
            Everything
          </button>
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              className="pill"
              aria-pressed={from === `group:${g}`}
              onClick={() => setFrom(`group:${g}`)}
            >
              {g}
            </button>
          ))}
          <select
            className="btn"
            value={from.startsWith("pack:") ? from : ""}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="One pack"
          >
            <option value="">One pack…</option>
            {(packs.data?.packs ?? []).map((p) => (
              <option key={p.id} value={`pack:${p.id}`}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <span className="eyebrow">How many</span>
        <div className="flex flex-wrap items-center gap-2">
          {[5, 10, 20].map((n) => (
            <button key={n} type="button" className="pill" aria-pressed={count === n} onClick={() => setCount(n)}>
              {n} questions
            </button>
          ))}
          <button
            type="button"
            className="btn btn-primary ml-auto"
            disabled={start.isPending}
            onClick={() => start.mutate()}
          >
            {start.isPending ? "Picking…" : "Start"}
          </button>
        </div>
        {start.isError && (
          <p className="m-0 text-sm" style={{ color: "var(--red)" }}>
            {(start.error as Error).message}
          </p>
        )}
        {start.data && start.data.length === 0 && (
          <p className="m-0 text-sm" style={{ color: "var(--muted)" }}>
            No lessons there yet.
          </p>
        )}
      </section>
    </main>
  );
}
