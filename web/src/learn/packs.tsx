// Learn's front door: the packs, a search across lessons, and Practice when something is due.
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";

type Pack = { id: string; name: string; kind: string; lessons: number };
type LessonRow = { id: string; pack: string; title: string };

export function LearnPacks() {
  const [q, setQ] = useState("");
  const packs = useQuery({
    queryKey: ["packs"],
    queryFn: async () => (await (await fetch("/api/learn/packs")).json()) as { packs: Pack[] },
  });
  const due = useQuery({
    queryKey: ["due"],
    queryFn: async () => (await (await fetch("/api/learn/due")).json()) as { lessons: { id: string }[] },
  });
  const found = useQuery({
    queryKey: ["learn-search", q],
    queryFn: async () =>
      (await (await fetch(`/api/learn/search?q=${encodeURIComponent(q)}`)).json()) as { lessons: LessonRow[] },
    enabled: q.trim().length > 1,
  });
  return (
    <main className="grid gap-3.5">
      <div className="flex items-center gap-3">
        <h2 className="font-cond text-xl font-bold">Learn</h2>
        {(due.data?.lessons.length ?? 0) > 0 && (
          <Link to="/learn/practice" className="btn btn-primary ml-auto">
            Practice · {due.data?.lessons.length} due
          </Link>
        )}
      </div>
      <input
        type="search"
        className="btn"
        placeholder="a word from any lesson"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {q.trim().length > 1 &&
        (found.data?.lessons ?? []).map((l) => (
          <Link key={l.id} to={`/learn/lesson/${l.id}`} className="card">
            <span className="font-cond font-bold">{l.title}</span>
          </Link>
        ))}
      {q.trim().length <= 1 &&
        (packs.data?.packs ?? []).map((p) => (
          <Link
            key={p.id}
            to={`/learn/pack/${p.id}`}
            className="card flex items-baseline gap-3 transition-all duration-200 hover:-translate-y-px"
          >
            <span className="font-cond text-lg font-bold">{p.name}</span>
            <span className="font-mono ml-auto text-xs" style={{ color: "var(--muted)" }}>
              {p.lessons} lesson{p.lessons === 1 ? "" : "s"}
              {p.kind === "answer-pack" ? " · answers" : ""}
            </span>
          </Link>
        ))}
      {packs.data && packs.data.packs.length === 0 && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No packs yet. The import brings the old lessons; new ones land through the doors.
        </p>
      )}
    </main>
  );
}

export function LearnPack() {
  const id = location.pathname.split("/").pop() ?? "";
  const lessons = useQuery({
    queryKey: ["pack", id],
    queryFn: async () =>
      (await (await fetch(`/api/learn/packs/${id}`)).json()) as { lessons: (LessonRow & { checks: number })[] },
  });
  return (
    <main className="grid gap-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--muted)" }}>
        <Link to="/learn" style={{ color: "var(--accent)" }}>
          ← Learn
        </Link>
      </p>
      {(lessons.data?.lessons ?? []).map((l, i) => (
        <Link key={l.id} to={`/learn/lesson/${l.id}`} className="card flex items-baseline gap-3">
          <span className="font-mono w-6 text-right text-xs" style={{ color: "var(--muted)" }}>
            {i + 1}
          </span>
          <span className="font-cond font-bold">{l.title}</span>
          {l.checks > 0 && (
            <span className="font-mono ml-auto text-[11px]" style={{ color: "var(--muted)" }}>
              {l.checks} check{l.checks === 1 ? "" : "s"}
            </span>
          )}
        </Link>
      ))}
    </main>
  );
}
