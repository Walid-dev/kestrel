// Practice: what is due, one check at a time — say your answer, show the real one, grade yourself honestly.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";

type Lesson = { id: string; title: string; body: { check: { q: string; a: string }[] } };

// what Practice can ask: the due lessons and the new ones that have a question (guides due are read again on Learn)
const toAsk = (dueN: number, newN: number) =>
  `${[dueN && `${dueN} due`, newN && `${newN} new`].filter(Boolean).join(" and ")} to ask`;

export function LearnPractice() {
  const queryClient = useQueryClient();
  const [shown, setShown] = useState(false);
  const due = useQuery({
    queryKey: ["due"],
    queryFn: async () => {
      const res = await fetch(`/api/learn/due?area=${new URLSearchParams(location.search).get("area") ?? "learn"}`);
      if (!res.ok) throw new Error(`the due list didn't load (${res.status})`);
      return (await res.json()) as { lessons: Lesson[]; due: number; new: number; reread: number };
    },
  });
  const grade = useMutation({
    mutationFn: async (input: { lesson: string; grade: "again" | "good" }) => {
      const res = await fetch("/api/learn/grade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `${res.status}`);
    },
    onSettled: () => {
      setShown(false);
      queryClient.invalidateQueries({ queryKey: ["due"] });
    },
  });
  const next = (due.data?.lessons ?? []).find((l) => l.body.check.length > 0);
  if (due.isError || grade.isError)
    return (
      <main className="grid gap-3">
        <h2 className="font-cond text-xl font-bold">Practice</h2>
        <p className="text-sm" style={{ color: "var(--red)" }}>
          {String(((due.error ?? grade.error) as Error).message)}
        </p>
        <Link to="/learn" className="btn justify-self-start">
          ← Learn
        </Link>
      </main>
    );
  if (due.data && !next)
    return (
      <main className="grid gap-3">
        <h2 className="font-cond text-xl font-bold">Practice</h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {due.data.reread > 0
            ? `No questions due. ${due.data.reread} ${due.data.reread === 1 ? "lesson is" : "lessons are"} due to read again: open ${due.data.reread === 1 ? "it" : "them"} on Learn.`
            : "Nothing due. Come back tomorrow."}
        </p>
        <Link to="/learn" className="btn justify-self-start">
          ← Learn
        </Link>
      </main>
    );
  if (!next) return null;
  const check = next.body.check[0];
  return (
    <main className="grid max-w-2xl gap-4">
      <div className="flex items-center gap-3">
        <h2 className="font-cond text-xl font-bold">Practice</h2>
        <span className="font-mono ml-auto text-xs" style={{ color: "var(--muted)" }}>
          {toAsk(due.data?.due ?? 0, due.data?.new ?? 0)}
        </span>
      </div>
      <section className="card grid gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--muted)" }}>
          {next.title}
        </p>
        <p className="font-cond text-lg font-bold">{check.q}</p>
        {shown ? (
          <>
            <p className="text-[15px] leading-relaxed">{check.a}</p>
            <div className="flex gap-2">
              <button type="button" className="btn" onClick={() => grade.mutate({ lesson: next.id, grade: "again" })}>
                Again tomorrow
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => grade.mutate({ lesson: next.id, grade: "good" })}
              >
                I had it
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="btn justify-self-start" onClick={() => setShown(true)}>
            Show the answer
          </button>
        )}
      </section>
    </main>
  );
}
