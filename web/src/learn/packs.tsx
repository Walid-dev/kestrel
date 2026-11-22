// Learn's front page, and Interview prep's: what to review today and what is new, the way to learn here, a search,
// the packs as chips; a guide pack opens as its contents, parts folded, each topic ticked when done. A pack moves
// between Learn and Interview prep with one tap, so nothing has to be decided for good.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { STATE_CHIP } from "./lesson.tsx";

type Pack = {
  id: string;
  name: string;
  kind: string;
  area: string;
  group: string;
  lessons: number;
  due: number;
  known: number;
};
type Row = {
  id: string;
  title: string;
  pack: string;
  short: string;
  part: string;
  eyebrow: string;
  state: string;
  position: number;
};
type Overview = {
  summary: { due: number; new: number; learning: number; known: number };
  packs: Pack[];
  lessons: Row[];
};

export const titled = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function LessonCard({ l }: { l: Row }) {
  const [chip, tone] = STATE_CHIP[l.state] ?? STATE_CHIP.new;
  return (
    <Link to={`/learn/lesson/${encodeURIComponent(l.id)}`} className="card card-link grid content-start gap-2">
      <span className={`chip ${tone} justify-self-start`}>{chip}</span>
      <span className="text-[16.5px] font-semibold leading-snug" style={{ color: "var(--strong)" }}>
        {l.title}
      </span>
      {l.short && (
        <span className="line-clamp-3 text-[14px] leading-relaxed" style={{ color: "var(--muted)" }}>
          {l.short}
        </span>
      )}
    </Link>
  );
}

function TopicRow({ r, mark }: { r: Row; mark: string }) {
  const done = r.state === "known" || r.state === "learning";
  return (
    <Link to={`/learn/lesson/${encodeURIComponent(r.id)}`} className="card card-link flex items-center gap-4 !py-3">
      <span className="font-cond w-10 text-[17px] font-bold" style={{ color: "var(--muted)" }}>
        {mark}
      </span>
      <span className="flex-1">{r.title}</span>
      {r.state === "due" && <span className="chip tone-yellow">Review today</span>}
      {done && <span style={{ color: "var(--green)" }}>✓</span>}
    </Link>
  );
}

function GuideContents({ rows }: { rows: Row[] }) {
  const parts: { name: string; rows: Row[] }[] = [];
  for (const r of rows) {
    const last = parts[parts.length - 1];
    if (last && last.name === r.part) last.rows.push(r);
    else parts.push({ name: r.part, rows: [r] });
  }
  const done = (r: Row) => r.state === "known" || r.state === "learning";
  const topics = rows.filter((r) => r.part);
  const next = topics.find((r) => !done(r));
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {next && (
          <Link to={`/learn/lesson/${encodeURIComponent(next.id)}`} className="btn btn-primary">
            Continue: {next.title}
          </Link>
        )}
        <span className="chip tone-muted font-mono">
          {topics.filter(done).length} of {topics.length} done
        </span>
      </div>
      {parts.map((p) =>
        p.name ? (
          <details key={p.name} className="group" open={p.rows.some((r) => r.id === next?.id)}>
            <summary
              className="flex cursor-pointer list-none items-baseline gap-3 py-2.5"
              style={{ borderBottom: "1px solid var(--line)" }}
            >
              <span className="text-[10px] transition-transform group-open:rotate-90" style={{ color: "var(--muted)" }}>
                ▶
              </span>
              <span className="eyebrow">{p.name.split(" · ")[0]}</span>
              <span className="font-cond text-[19px] font-bold" style={{ color: "var(--strong)" }}>
                {p.name.split(" · ").slice(1).join(" · ")}
              </span>
              <span className="font-mono ml-auto text-xs" style={{ color: "var(--muted)" }}>
                {p.rows.filter(done).length}/{p.rows.length}
              </span>
            </summary>
            <div className="grid gap-2 pt-3">
              {p.rows.map((r) => (
                <TopicRow key={r.id} r={r} mark={r.eyebrow.match(/Topic (\S+)/)?.[1] ?? "·"} />
              ))}
            </div>
          </details>
        ) : (
          <div key={`loose-${p.rows[0].id}`} className="grid gap-2">
            {p.rows.map((r) => (
              <TopicRow key={r.id} r={r} mark={r.title === "Glossary" ? "A–Z" : r.title === "References" ? "↗" : "·"} />
            ))}
          </div>
        ),
      )}
    </div>
  );
}

export function LearnPacks({ area = "learn" }: { area?: "learn" | "interview" }) {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const pick = params.get("pack") ?? "";
  const pickGroup = params.get("group") ?? "";
  const [q, setQ] = useState("");
  const overview = useQuery({
    queryKey: ["learn-overview", area],
    queryFn: async () => {
      const res = await fetch(`/api/learn/overview?area=${area}`);
      if (!res.ok) throw new Error(`the lessons didn't load (${res.status})`);
      return (await res.json()) as Overview;
    },
  });
  const found = useQuery({
    queryKey: ["learn-search", area, q],
    queryFn: async () => {
      const res = await fetch(`/api/learn/search?area=${area}&q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error(`${res.status}`);
      return (await res.json()) as { lessons: Row[] };
    },
    enabled: q.trim().length > 1,
  });
  const move = useMutation({
    mutationFn: async (input: { id: string; to: string }) => {
      const res = await fetch(`/api/learn/packs/${encodeURIComponent(input.id)}/area`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ area: input.to }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `${res.status}`);
    },
    onSuccess: () => {
      setParams({});
      queryClient.invalidateQueries({ queryKey: ["learn-overview"] });
    },
  });

  const regroup = useMutation({
    mutationFn: async (input: { id: string; group: string }) => {
      const res = await fetch(`/api/learn/packs/${encodeURIComponent(input.id)}/group`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ group: input.group }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `${res.status}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["learn-overview"] }),
  });
  const o = overview.data;
  const s = o?.summary ?? { due: 0, new: 0, learning: 0, known: 0 };
  const total = s.due + s.new + s.learning + s.known || 1;
  const packs = o?.packs ?? [];
  const chosen = packs.find((p) => p.id === pick);
  const inGroup = new Set(packs.filter((p) => p.group === pickGroup).map((p) => p.id));
  const rows = (o?.lessons ?? []).filter((l) => (pick ? l.pack === pick : pickGroup ? inGroup.has(l.pack) : true));
  // the packs under their parents, in the order each parent first appears; packs with none come last
  const parents: [string, Pack[]][] = [];
  for (const p of packs) {
    const at = parents.find(([g]) => g === p.group);
    if (at) at[1].push(p);
    else parents.push([p.group, [p]]);
  }
  parents.sort((a, b) => (a[0] === "" ? 1 : b[0] === "" ? -1 : a[0].localeCompare(b[0])));
  const known = [...new Set(packs.map((p) => p.group).filter(Boolean))];
  const isGuide = rows.some((r) => r.part);
  const groups = ["due", "new", "learning", "known"].map((st) => ({ st, rows: rows.filter((r) => r.state === st) }));
  const other = area === "learn" ? "interview" : "learn";
  const stateOf = new Map((o?.lessons ?? []).map((l) => [l.id, l.state]));

  return (
    <main className="grid gap-6 lg:grid-cols-[330px_minmax(0,1fr)]">
      <aside className="grid content-start gap-4">
        <section className="card grid gap-3">
          <p className="m-0 text-[17px]" style={{ color: "var(--strong)" }}>
            <b className="font-cond text-2xl">{s.due}</b> to review today, and <b>{s.new}</b> new.
          </p>
          <Link to={`/learn/practice?area=${area}`} className="btn btn-primary justify-self-start">
            Start the review
          </Link>
          <div className="flex h-1.5 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
            <span style={{ width: `${(s.known / total) * 100}%`, background: "var(--green)" }} />
            <span style={{ width: `${((s.learning + s.due) / total) * 100}%`, background: "var(--accent)" }} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]" style={{ color: "var(--muted)" }}>
            <span className="flex items-center gap-1.5">
              <span className="dot tone-green" /> {s.known} known
            </span>
            <span className="flex items-center gap-1.5">
              <span className="dot tone-accent" /> {s.learning + s.due} learning
            </span>
            <span className="flex items-center gap-1.5">
              <span className="dot tone-muted" /> {s.new} new
            </span>
          </div>
        </section>
        <details className="card" open={area === "learn"}>
          <summary className="font-cond cursor-pointer text-lg font-bold">How to learn here</summary>
          <ol className="mt-2 mb-0 grid gap-1.5 pl-5 text-[14.5px] leading-relaxed">
            <li>Read the lesson once, slowly.</li>
            <li>
              Tap <b>Listen</b>. Then say each sentence with the voice.
            </li>
            <li>
              Tap <b>Record me</b>, say it alone, then play it back and compare.
            </li>
            <li>Answer the question before you look at the answer.</li>
            <li>
              Come back when a lesson says <b>Review today</b>. Short and often works best.
            </li>
          </ol>
        </details>
        <input
          type="search"
          className="btn"
          placeholder="Search the lessons"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="grid gap-3">
          <button
            type="button"
            className="pill justify-self-start"
            aria-pressed={!pick && !pickGroup}
            onClick={() => setParams({})}
          >
            All
          </button>
          {parents.map(([g, list]) => (
            <div key={g || "none"} className="grid gap-1.5">
              <button
                type="button"
                className="eyebrow justify-self-start text-left"
                style={{
                  color: pickGroup === g && !pick && g ? "var(--accent)" : undefined,
                  cursor: g ? "pointer" : "default",
                }}
                onClick={() => g && setParams({ group: g })}
              >
                {g || "Not grouped yet"}
              </button>
              <div className="flex flex-wrap gap-2">
                {list.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="pill"
                    aria-pressed={pick === p.id}
                    onClick={() => setParams({ pack: p.id })}
                  >
                    {p.due > 0 && <span className="dot tone-yellow" />}
                    {titled(p.name)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {area === "learn" ? (
          <Link to="/interview" className="card card-link grid gap-1">
            <span className="font-cond text-lg font-bold">Interview prep →</span>
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              Answers to say for a job or a project, and the helper that finds them while you're asked.
            </span>
          </Link>
        ) : (
          <Link to="/interview/helper" className="card card-link grid gap-1">
            <span className="font-cond text-lg font-bold">The interview helper →</span>
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              Hold while the question is asked; the nearest prepared answer shows large.
            </span>
          </Link>
        )}
      </aside>

      <section className="grid content-start gap-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="font-cond m-0 text-[26px] font-bold">
            {chosen ? titled(chosen.name) : pickGroup || (area === "learn" ? "Learn" : "Interview prep")}
          </h2>
          {chosen && (
            <>
              <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
                {chosen.lessons} lessons · {chosen.known} known
              </span>
              <label className="ml-auto flex items-center gap-2 text-[13px]" style={{ color: "var(--muted)" }}>
                Under
                <input
                  className="btn w-36"
                  list="learn-groups"
                  defaultValue={chosen.group}
                  key={chosen.id}
                  placeholder="a parent"
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  onBlur={(e) =>
                    e.target.value.trim() !== chosen.group && regroup.mutate({ id: chosen.id, group: e.target.value })
                  }
                />
                <datalist id="learn-groups">
                  {known.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </label>
              <button
                type="button"
                className="btn btn-quiet"
                disabled={move.isPending}
                onClick={() => move.mutate({ id: chosen.id, to: other })}
              >
                Move to {other === "learn" ? "Learn" : "Interview prep"}
              </button>
            </>
          )}
        </div>
        {[overview, move, regroup].map((x) =>
          x.isError ? (
            <p key={String(x.error)} className="m-0 text-sm" style={{ color: "var(--red)" }}>
              {String((x.error as Error).message)}
            </p>
          ) : null,
        )}
        {q.trim().length > 1 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(found.data?.lessons ?? []).map((l) => (
              <LessonCard key={l.id} l={{ ...l, state: stateOf.get(l.id) ?? "new" }} />
            ))}
            {found.data && found.data.lessons.length === 0 && (
              <p className="m-0 text-sm" style={{ color: "var(--muted)" }}>
                No lesson has those words.
              </p>
            )}
          </div>
        ) : isGuide && chosen ? (
          <GuideContents rows={[...rows].sort((a, b) => a.position - b.position)} />
        ) : (
          groups
            .filter((g) => g.rows.length > 0)
            .map((g) =>
              g.st === "known" ? (
                <details key={g.st}>
                  <summary className="font-cond cursor-pointer text-xl font-bold">
                    Known{" "}
                    <span className="font-mono text-sm" style={{ color: "var(--green)" }}>
                      {g.rows.length}
                    </span>
                  </summary>
                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {g.rows.map((l) => (
                      <LessonCard key={l.id} l={l} />
                    ))}
                  </div>
                </details>
              ) : (
                <div key={g.st} className="grid gap-3">
                  <h3 className="font-cond m-0 text-xl font-bold">
                    {STATE_CHIP[g.st][0]}{" "}
                    <span
                      className="font-mono text-sm"
                      style={{ color: g.st === "due" ? "var(--yellow)" : "var(--muted)" }}
                    >
                      {g.rows.length}
                    </span>
                  </h3>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {g.rows.map((l) => (
                      <LessonCard key={l.id} l={l} />
                    ))}
                  </div>
                </div>
              ),
            )
        )}
        {o && rows.length === 0 && (
          <p className="m-0 text-sm" style={{ color: "var(--muted)" }}>
            {area === "learn" ? "No lessons here yet." : "Nothing in Interview prep yet: move a pack here from Learn."}
          </p>
        )}
      </section>
    </main>
  );
}

// the old pack page's address opens the front page with that pack picked
export function LearnPack() {
  const id = decodeURIComponent(location.pathname.split("/").pop() ?? "");
  location.replace(`/learn?pack=${encodeURIComponent(id)}`);
  return null;
}
