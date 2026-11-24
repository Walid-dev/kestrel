// Practice: what is due, one check at a time — say your answer, show the real one, grade yourself honestly. The head
// counts this page's own queue (the lessons it can ask), so its number never names a lesson the page won't show.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "../ui/card.tsx";
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
  return (
    <Page
      width="reading"
      back={area === "interview" ? { to: "/interview", label: "Interview prep" } : { to: "/learn", label: "Learn" }}
      title="Practice"
      line={asking}
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
        next && (
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow min-w-0">{next.title}</span>
              {state && <span className={`chip chip-caps tone-${state.tone} ml-auto`}>{state.label}</span>}
            </div>
            <p className="font-cond m-0 text-head text-strong">{next.body.check[0].q}</p>
            {shown ? (
              <>
                <p className="m-0">{next.body.check[0].a}</p>
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
                    className="btn btn-primary"
                    disabled={grade.isPending}
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
          </Card>
        )
      )}
    </Page>
  );
}
