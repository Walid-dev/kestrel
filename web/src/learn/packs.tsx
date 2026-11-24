// Learn's front page, and Interview prep's: what to review today and what is new, the way to learn here, a search,
// the packs as pills; a guide pack opens as its contents, parts folded, each topic ticked when done. A pack moves
// between Learn and Interview prep with one tap, so nothing has to be decided for good.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Card } from "../ui/card.tsx";
import { EmptyState } from "../ui/empty.tsx";
import { Field } from "../ui/field.tsx";
import { List, Row as ListRow } from "../ui/list.tsx";
import { Page } from "../ui/page.tsx";
import { Pills, type Tone } from "../ui/pills.tsx";
import { STATE, titled } from "./lesson.tsx";

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

const lessonPath = (id: string) => `/learn/lesson/${encodeURIComponent(id)}`;
// a part of the progress bar: its length is data, so it reaches the class as a variable
const share = (n: number, total: number) => ({ "--part": `${(n / total) * 100}%` }) as CSSProperties;

function StateChip({ state }: { state: string }) {
  const s = STATE[state] ?? STATE.new;
  return <span className={`chip chip-caps tone-${s.tone}`}>{s.label}</span>;
}

// the lessons as one list of rows: the title, its short line under it, the state's chip at the end; two columns on a
// computer once there are two rows to fill them
function Lessons({ rows, label }: { rows: Row[]; label: string }) {
  return (
    <List cols={rows.length > 1} label={label}>
      {rows.map((l) => (
        <ListRow
          key={l.id}
          to={lessonPath(l.id)}
          title={l.title}
          line={l.short ? <span className="line-clamp-2">{l.short}</span> : undefined}
          end={<StateChip state={l.state} />}
        />
      ))}
    </List>
  );
}

// a guide's topic: its number before the title, in the numbers' voice; a ✓ once it is read
function TopicRow({ r, mark }: { r: Row; mark: string }) {
  const done = r.state === "known" || r.state === "learning";
  return (
    <ListRow
      to={lessonPath(r.id)}
      title={
        <span className="flex items-baseline gap-3">
          <span className="font-mono w-8 shrink-0 text-small text-muted tabular-nums">{mark}</span>
          <span className="min-w-0">{r.title}</span>
        </span>
      }
      end={
        r.state === "due" ? (
          <StateChip state="due" />
        ) : done ? (
          <span className="text-green" role="img" aria-label="Done">
            ✓
          </span>
        ) : undefined
      }
    />
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
          <Link to={lessonPath(next.id)} className="btn">
            Continue: {next.title}
          </Link>
        )}
        <span className="chip tone-muted font-mono">
          {topics.filter(done).length} of {topics.length} done
        </span>
      </div>
      {parts.map((p) =>
        p.name ? (
          <details key={p.name} open={p.rows.some((r) => r.id === next?.id)}>
            <summary className="disclosure">
              {/* the part's number and its name on one baseline; the ▶ (the fold-out's own) centred beside them */}
              <span className="flex min-w-0 items-baseline gap-3">
                <span className="eyebrow">{p.name.split(" · ")[0]}</span>
                <span>{p.name.split(" · ").slice(1).join(" · ")}</span>
              </span>
              <span className="font-mono ml-auto text-small text-muted">
                {p.rows.filter(done).length}/{p.rows.length}
              </span>
            </summary>
            <div className="pt-2">
              <List label={p.name}>
                {p.rows.map((r) => (
                  <TopicRow key={r.id} r={r} mark={r.eyebrow.match(/Topic (\S+)/)?.[1] ?? "·"} />
                ))}
              </List>
            </div>
          </details>
        ) : (
          <List key={`loose-${p.rows[0].id}`}>
            {p.rows.map((r) => (
              <TopicRow key={r.id} r={r} mark={r.title === "Glossary" ? "A–Z" : r.title === "References" ? "↗" : "·"} />
            ))}
          </List>
        ),
      )}
    </div>
  );
}

// each parent's own colour, so the packs read at a glance: the personal packs green, AI purple, the platform blue
const GROUP_TONE: Record<string, Tone> = { Personal: "green", AI: "purple", Platform: "accent" };
const groupTone = (g: string): Tone => GROUP_TONE[g] ?? (g ? "cyan" : "muted");

export function LearnPacks({ area = "learn" }: { area?: "learn" | "interview" }) {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const pick = params.get("pack") ?? "";
  const pickGroup = params.get("group") ?? "";
  const [q, setQ] = useState("");
  const [showPacks, setShowPacks] = useState(() => {
    try {
      return localStorage.getItem("kestrel-learn-packs") !== "folded";
    } catch {
      return true;
    }
  });
  const foldPacks = (v: boolean) => {
    setShowPacks(v);
    try {
      localStorage.setItem("kestrel-learn-packs", v ? "open" : "folded");
    } catch {
      // storage off: the packs show each visit
    }
  };
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
  parents.sort((a, b) => (a[0] === "" ? 1 : b[0] === "" ? -1 : 0));
  const known = [...new Set(packs.map((p) => p.group).filter(Boolean))];
  const isGuide = rows.some((r) => r.part);
  const groups = ["due", "new", "learning", "known"].map((st) => ({ st, rows: rows.filter((r) => r.state === st) }));
  const other = area === "learn" ? "interview" : "learn";
  const stateOf = new Map((o?.lessons ?? []).map((l) => [l.id, l.state]));
  // a pack's count means what the summary means: its lessons to review today, never the new ones
  const dueIn = (pack: string) => (o?.lessons ?? []).filter((l) => l.pack === pack && l.state === "due").length;
  // the pick, one value across the rows of pills: everything, a parent, or a pack
  const picked = pick ? `pack:${pick}` : pickGroup ? `group:${pickGroup}` : "all";
  const choose = (v: string) =>
    setParams(v === "all" ? {} : v.startsWith("group:") ? { group: v.slice(6) } : { pack: v.slice(5) });
  const home = area === "learn" ? "Learn" : "Interview prep";

  const homePath = area === "learn" ? "/learn" : "/interview";
  const otherName = other === "learn" ? "Learn" : "Interview prep";

  return (
    <Page
      title={chosen ? titled(chosen.name) : pickGroup || home}
      // a pack or a parent is a page under the area's front: its back row, and its title a step down
      back={chosen || pickGroup ? { to: homePath, label: home } : undefined}
      line={
        chosen ? (
          // the pack's parent sits in its line: a small label and the box, where Enter or leaving the box saves it
          <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span>
              {chosen.lessons} lessons · {chosen.known} known
            </span>
            <label className="flex items-center gap-2">
              <span className="text-small">Under</span>
              <input
                className="input w-50 max-w-full"
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
          </span>
        ) : pickGroup ? (
          `${inGroup.size} pack${inGroup.size === 1 ? "" : "s"} under ${pickGroup}`
        ) : undefined
      }
    >
      {[overview, move, regroup].map((x) =>
        x.isError ? (
          <p key={String(x.error)} className="m-0 text-detail text-red">
            {String((x.error as Error).message)}
          </p>
        ) : null,
      )}
      <div className="grid gap-6 lg:grid-cols-[330px_minmax(0,1fr)]">
        <aside className="grid content-start gap-4">
          {/* the review: how many today, in the numbers' voice, the page's one filled button, where the lessons stand */}
          <Card>
            <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-body text-ink">
              <b className="font-mono text-lead font-medium text-strong tabular-nums">{s.due}</b>
              <span>
                to review today, and <b className="text-strong">{s.new}</b> new.
              </span>
            </p>
            <Link to={`/learn/practice?area=${area}`} className="btn btn-primary justify-self-start">
              Start the review
            </Link>
            {/* each state in its one colour, the same as on its chips */}
            <div className="meter" aria-hidden="true">
              <span className="tone-green" style={share(s.known, total)} />
              <span className="tone-purple" style={share(s.learning, total)} />
              <span className="tone-cyan" style={share(s.due, total)} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-small text-muted">
              <span className="flex items-center gap-1.5">
                <span className="dot tone-green" /> {s.known} known
              </span>
              <span className="flex items-center gap-1.5">
                <span className="dot tone-purple" /> {s.learning} learning
              </span>
              <span className="flex items-center gap-1.5">
                <span className="dot tone-cyan" /> {s.due} to review
              </span>
              <span className="flex items-center gap-1.5">
                <span className="dot tone-muted" /> {s.new} new
              </span>
            </div>
          </Card>
          <details>
            <summary className="disclosure">How to learn here</summary>
            <ol className="mt-1 mb-0 grid gap-1.5 pl-5 text-detail">
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
          <Field label="Search the lessons" value={q} onChange={setQ} />
          {/* everything, then each parent with its packs; the packs fold away */}
          <div className="grid gap-2 pointer-coarse:gap-3">
            <div className="flex items-center gap-2">
              <Pills label="Every lesson" options={[{ value: "all", label: "All" }]} value={picked} onChange={choose} />
              <button
                type="button"
                className="btn btn-quiet ml-auto shrink-0"
                aria-expanded={showPacks}
                onClick={() => foldPacks(!showPacks)}
              >
                {showPacks ? "Hide the packs" : "Show the packs"}
              </button>
            </div>
            {showPacks &&
              parents.map(([g, list]) => (
                <Pills
                  key={g || "none"}
                  label={g || "Not grouped"}
                  showLabel={!g}
                  options={[
                    ...(g ? [{ value: `group:${g}`, label: g }] : []),
                    ...list.map((p) => ({
                      value: `pack:${p.id}`,
                      label: titled(p.name),
                      tone: groupTone(g),
                      count: dueIn(p.id) || undefined,
                    })),
                  ]}
                  value={picked}
                  onChange={choose}
                />
              ))}
          </div>
          <List>
            {area === "learn" ? (
              <ListRow
                to="/interview"
                title="Interview prep"
                line="Answers to say for a job or a project, and the helper that finds them while you're asked."
              />
            ) : (
              <ListRow
                to="/interview/helper"
                title="The interview helper"
                line="Hold while the question is asked; the nearest prepared answer shows large."
              />
            )}
          </List>
        </aside>

        <section className="grid content-start gap-6">
          {q.trim().length > 1 ? (
            found.data && found.data.lessons.length === 0 ? (
              <EmptyState title="No lesson has those words." line="Try another word, or fewer of them." />
            ) : (
              <Lessons
                label="Lessons found"
                rows={(found.data?.lessons ?? []).map((l) => ({ ...l, state: stateOf.get(l.id) ?? "new" }))}
              />
            )
          ) : isGuide && chosen ? (
            <GuideContents rows={[...rows].sort((a, b) => a.position - b.position)} />
          ) : (
            groups
              .filter((g) => g.rows.length > 0)
              .map((g) =>
                g.st === "known" ? (
                  <details key={g.st}>
                    <summary className="disclosure">
                      Known · <span className="font-mono tabular-nums">{g.rows.length}</span>
                    </summary>
                    <div className="mt-2">
                      <Lessons label="Known" rows={g.rows} />
                    </div>
                  </details>
                ) : (
                  <div key={g.st} className="grid gap-3">
                    <h2 className="font-cond m-0 text-section">
                      {STATE[g.st].label} ·{" "}
                      <span className={`font-mono tabular-nums ${g.st === "due" ? "text-cyan" : "text-muted"}`}>
                        {g.rows.length}
                      </span>
                    </h2>
                    <Lessons label={STATE[g.st].label} rows={g.rows} />
                  </div>
                ),
              )
          )}
          {o &&
            rows.length === 0 &&
            (area === "learn" ? (
              <EmptyState title="No lessons here yet." line="A pack's lessons show here once it is added." />
            ) : (
              <EmptyState
                title="Nothing in Interview prep yet."
                line="Open a pack in Learn, then Move to Interview prep."
                action={
                  <Link to="/learn" className="btn">
                    Open Learn
                  </Link>
                }
              />
            ))}
        </section>
      </div>
      {/* a rare action, at the page's foot: the pack moves to the other area, and the page goes back to this one */}
      {chosen && (
        <div>
          <button
            type="button"
            className="btn btn-quiet"
            disabled={move.isPending}
            onClick={() => move.mutate({ id: chosen.id, to: other })}
          >
            Move to {otherName}
          </button>
        </div>
      )}
    </Page>
  );
}

// the old pack page's address opens the front page with that pack picked
export function LearnPack() {
  const id = decodeURIComponent(location.pathname.split("/").pop() ?? "");
  location.replace(`/learn?pack=${encodeURIComponent(id)}`);
  return null;
}
