// Practice: what is due, one check at a time — say your answer, show the real one, grade yourself honestly. The head
// says where things stand in Learn's own words (to review today, new), so the numbers match on both pages.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "../ui/card.tsx";
import { EmptyState } from "../ui/empty.tsx";
import { Page } from "../ui/page.tsx";
import { STATE } from "./lesson.tsx";

type Lesson = { id: string; title: string; body: { check: { q: string; a: string }[] } };
type Overview = { summary: { due: number; new: number }; lessons: { id: string; state: string }[] };

export function LearnPractice() {
  const queryClient = useQueryClient();
  const [shown, setShown] = useState(false);
  const area = new URLSearchParams(location.search).get("area") === "interview" ? "interview" : "learn";
  const due = useQuery({
    queryKey: ["due"],
    queryFn: async () => {
      const res = await fetch(`/api/learn/due?area=${area}`);
      if (!res.ok) throw new Error(`the due list didn't load (${res.status})`);
      return (await res.json()) as { lessons: Lesson[] };
    },
  });
  // the same query as Learn's front page, so the pair of numbers is the same one
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
  const s = overview.data?.summary;
  const state = STATE[overview.data?.lessons.find((l) => l.id === next?.id)?.state ?? ""];
  const failed = due.error ?? grade.error;
  return (
    <Page
      width="reading"
      back={area === "interview" ? { to: "/interview", label: "Interview prep" } : { to: "/learn", label: "Learn" }}
      title="Practice"
      line={s && `${s.due} to review today, and ${s.new} new.`}
    >
      {failed ? (
        <p className="m-0 text-detail text-red">{String((failed as Error).message)}</p>
      ) : due.data && !next ? (
        <EmptyState title="Nothing due." line="Come back tomorrow: a lesson shows here on the day it is due." />
      ) : (
        next && (
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow min-w-0">{next.title}</span>
              {state && <span className={`chip chip-caps tone-${state.tone} ml-auto`}>{state.label}</span>}
            </div>
            <p className="font-cond m-0 text-head font-bold text-strong">{next.body.check[0].q}</p>
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
