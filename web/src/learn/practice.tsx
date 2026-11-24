// Practice: what is due, one check at a time — say your answer, show the real one, grade yourself honestly. The head
// counts this page's own queue (the lessons it can ask), so its number never names a lesson the page won't show.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { EmptyState } from "../ui/empty.tsx";
import { Page } from "../ui/page.tsx";
import { STATE } from "./lesson.tsx";

type Lesson = { id: string; title: string; body: { check: { q: string; a: string }[] } };
type Overview = { lessons: { id: string; state: string }[] };

// what Practice can ask: the due lessons and the new ones that have a question (guides due are read again on Learn)
const toAsk = (dueN: number, newN: number) =>
  `${[dueN && `${dueN} due`, newN && `${newN} new`].filter(Boolean).join(" and ")} to ask`;

export function LearnPractice() {
  const queryClient = useQueryClient();
  const [shown, setShown] = useState(false);
  const area = new URLSearchParams(location.search).get("area") === "interview" ? "interview" : "learn";
  const due = useQuery({
    queryKey: ["due"],
    queryFn: async () => {
      const res = await fetch(`/api/learn/due?area=${area}`);
      if (!res.ok) throw new Error(`the due list didn't load (${res.status})`);
      return (await res.json()) as { lessons: Lesson[]; due: number; new: number; reread: number };
    },
  });
  // the same query as Learn's front page, for the state chip of the lesson asked
  const overview = useQuery({
    queryKey: ["learn-overview", area],
    queryFn: async () => {
      const res = await fetch(`/api/learn/overview?area=${area}`);
      if (!res.ok) throw new Error(`${res.status}`);
      return (await res.json()) as Overview;
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
      queryClient.invalidateQueries({ queryKey: ["learn-overview"] });
    },
  });
  const next = (due.data?.lessons ?? []).find((l) => l.body.check.length > 0);
  const state = STATE[overview.data?.lessons.find((l) => l.id === next?.id)?.state ?? ""];
  const failed = due.error ?? grade.error;
  const reread = due.data?.reread ?? 0;
  const asking = due.data && due.data.due + due.data.new > 0 ? `${toAsk(due.data.due, due.data.new)}.` : false;
  const home = area === "interview" ? "Interview prep" : "Learn";
  const q = next?.body.check[0];
  return (
    // a question page: the back row, the place in the eyebrow, the question itself as the title
    <Page
      width="reading"
      back={{ to: area === "interview" ? "/interview" : "/learn", label: home }}
      eyebrow={`Practice · ${home}`}
      title={q && !failed ? q.q : "Practice"}
      line={
        q && !failed ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{next?.title}</span>
            {state && <span className={`chip chip-caps tone-${state.tone}`}>{state.label}</span>}
            {asking && <span>· {asking}</span>}
          </span>
        ) : (
          asking
        )
      }
    >
      {failed ? (
        <p className="m-0 text-detail text-red">{String((failed as Error).message)}</p>
      ) : due.data && !next ? (
        reread > 0 ? (
          <EmptyState
            title="No questions due."
            line={`${reread} ${reread === 1 ? "lesson is" : "lessons are"} due to read again: open ${reread === 1 ? "it" : "them"} on Learn.`}
          />
        ) : (
          <EmptyState title="Nothing due." line="Come back tomorrow: a lesson shows here on the day it is due." />
        )
      ) : (
        next &&
        q &&
        (shown ? (
          <div className="grid gap-3">
            <div className="read-box text-body">
              <p className="m-0">{q.a}</p>
            </div>
            {/* two plain buttons: an honest grade, with no nudge toward either */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn"
                disabled={grade.isPending}
                onClick={() => grade.mutate({ lesson: next.id, grade: "again" })}
              >
                Again tomorrow
              </button>
              <button
                type="button"
                className="btn"
                disabled={grade.isPending}
                onClick={() => grade.mutate({ lesson: next.id, grade: "good" })}
              >
                I had it
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn justify-self-start" onClick={() => setShown(true)}>
            Show the answer
          </button>
        ))
      )}
    </Page>
  );
}
