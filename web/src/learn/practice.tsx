// Practice: what is due, one check at a time — say your answer, show the real one, grade yourself honestly. The head
// counts this page's own queue (the lessons it can ask), so its number never names a lesson the page won't show; the
// eyebrow says how far this sitting is, as a quiz's run does.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, useState } from "react";
import { Link } from "react-router";
import { Card } from "../ui/card.tsx";
import { EmptyState } from "../ui/empty.tsx";
import { Page } from "../ui/page.tsx";
import { STATE } from "./lesson.tsx";

type Lesson = { id: string; title: string; body: { check: { q: string; a: string }[] } };
type Overview = { lessons: { id: string; state: string }[] };

// how far this sitting is, as a share of the bar (the numbers are data, so they reach it as a variable)
const share = (n: number, total: number) => ({ "--part": `${total ? (n / total) * 100 : 0}%` }) as CSSProperties;

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
  const left = due.data ? due.data.due + due.data.new : 0;
  // how far this sitting is: what was left when the page opened, against what is left now. Both come from the list
  // itself, so the place moves with the next question, never before it
  const [start, setStart] = useState<number | null>(null);
  if (due.data && due.isFetchedAfterMount && start === null) setStart(left);
  const total = Math.max(start ?? left, left);
  const done = total - left;
  const home = area === "interview" ? "Interview prep" : "Learn";
  const q = next?.body.check[0];
  const asking = Boolean(q && !failed);
  return (
    // a question page, as a quiz's run is: the back row, the place in the eyebrow with how far this sitting is under
    // it, what is left in the line, then the question in a card
    <Page
      width="reading"
      back={{ to: area === "interview" ? "/interview" : "/learn", label: home }}
      eyebrow={
        asking ? (
          <span className="quiz-place">
            <span className="tabular-nums">
              Question {done + 1} of {total} · {home}
            </span>
            <span className="meter" aria-hidden="true">
              <span className="tone-good" style={share(done, total)} />
            </span>
          </span>
        ) : (
          home
        )
      }
      title="Practice"
      line={
        due.data &&
        left > 0 && (
          // what is left, the numbers bold
          <span className="tabular-nums">
            {[
              due.data.due > 0 && ["due", due.data.due],
              due.data.new > 0 && ["new", due.data.new],
              reread > 0 && ["to read again", reread],
            ]
              .filter((x): x is [string, number] => Boolean(x))
              .map(([what, n], i) => (
                <span key={what}>
                  {i > 0 && " · "}
                  <b className="text-ink">{n}</b> {what}
                </span>
              ))}
          </span>
        )
      }
    >
      {failed ? (
        <p className="m-0 text-detail text-red">{String((failed as Error).message)}</p>
      ) : due.data && !next ? (
        reread > 0 ? (
          <EmptyState
            title={done > 0 ? `${done} done. No questions left.` : "No questions due."}
            line={`${reread} ${reread === 1 ? "lesson is" : "lessons are"} due to read again: open ${reread === 1 ? "it" : "them"} on Learn.`}
          />
        ) : (
          <EmptyState
            title={done > 0 ? `${done} done. Nothing left.` : "Nothing due."}
            line="Come back tomorrow: a lesson shows here on the day it is due."
          />
        )
      ) : (
        next &&
        q && (
          // the card: the lesson's state on the left and the lesson itself on the right, the question, then the
          // answer once shown, and the grades
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              {state && <span className={`chip chip-caps tone-${state.tone}`}>{state.label}</span>}
              <Link to={`/learn/lesson/${encodeURIComponent(next.id)}`} className="btn btn-sm ml-auto">
                {next.title} →
              </Link>
            </div>
            <h2 className="font-cond m-0 text-lead">{q.q}</h2>
            {shown ? (
              <>
                <div className="inner grid gap-1">
                  <span className="eyebrow tone-accent">The answer</span>
                  <p className="m-0 text-body text-strong">{q.a}</p>
                </div>
                {/* two plain buttons: an honest grade, with no nudge toward either */}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn"
                    disabled={grade.isPending}
                    title="It comes back tomorrow"
                    onClick={() => grade.mutate({ lesson: next.id, grade: "again" })}
                  >
                    Again tomorrow
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={grade.isPending}
                    title="It comes back later, a longer gap each time"
                    onClick={() => grade.mutate({ lesson: next.id, grade: "good" })}
                  >
                    I had it
                  </button>
                </div>
              </>
            ) : (
              // the one main action until the answer shows: say it first, then look
              <button type="button" className="btn btn-primary justify-self-start" onClick={() => setShown(true)}>
                Show the answer
              </button>
            )}
          </Card>
        )
      )}
    </Page>
  );
}
