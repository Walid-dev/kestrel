// Learn's front page, and Interview prep's, in one column as wide as the page: the switch between the two in the head,
// the figures (to review, new, learning, known) over the progress bar with Start the review, one filter card (the
// search, the packs as pills under their parents), the lessons by state, the way to learn here at the
// foot. A pack (or a parent) is a page under it: its own figures with Continue, its lessons in order (a guide's as its
// contents, parts folded), and its settings at the foot (its parent, the move to the other area), so nothing has to
// be decided for good.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, type ReactNode, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Card } from "../ui/card.tsx";
import { EmptyState } from "../ui/empty.tsx";
import { Field } from "../ui/field.tsx";
import { List, Row as ListRow } from "../ui/list.tsx";
import { Page } from "../ui/page.tsx";
import { Pills, type Tone } from "../ui/pills.tsx";
import { Seg } from "../ui/seg.tsx";
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
type Counts = { due: number; new: number; learning: number; known: number };
type Overview = { summary: Counts; packs: Pack[]; lessons: Row[] };
type Area = "learn" | "interview";

const AREA_NAME: Record<Area, string> = { learn: "Learn", interview: "Interview prep" };
const AREA_PATH: Record<Area, string> = { learn: "/learn", interview: "/interview" };
const lessonPath = (id: string) => `/learn/lesson/${encodeURIComponent(id)}`;
// a part of the progress bar: its length is data, so it reaches the class as a variable
const share = (n: number, total: number) => ({ "--part": `${(n / total) * 100}%` }) as CSSProperties;
const countOf = (rows: Row[]): Counts => {
  const n = (st: string) => rows.filter((r) => r.state === st).length;
  return { due: n("due"), new: n("new"), learning: n("learning"), known: n("known") };
};
// a guide's topic is done once read (learning or known)
const done = (r: Row) => r.state === "known" || r.state === "learning";
const plural = (n: number, one: string) => `${one}${n === 1 ? "" : "s"}`;

// a value in a muted line: only the value is bold, so the eye scans the values and skips the words
function V({ children }: { children: ReactNode }) {
  return <b className="text-ink tabular-nums">{children}</b>;
}

function StateChip({ state }: { state: string }) {
  const s = STATE[state] ?? STATE.new;
  return <span className={`chip chip-caps tone-${s.tone}`}>{s.label}</span>;
}

// the figures: each state in its one colour (the same as its chip and its part of the bar), the number in mono under
// its name, the bar under them; the page's one filled button on their right (on touch, under the bar)
const FIGS: { st: keyof Counts; label: string; tone: Tone }[] = [
  { st: "due", label: "To review", tone: "cyan" },
  { st: "new", label: "New", tone: "muted" },
  { st: "learning", label: "Learning", tone: "purple" },
  { st: "known", label: "Known", tone: "green" },
];
function Figures({ counts, action }: { counts: Counts; action?: ReactNode }) {
  const total = counts.due + counts.new + counts.learning + counts.known || 1;
  return (
    // a review waiting today is what matters now: the card takes its edge
    <Card tone={counts.due > 0 ? "cyan" : undefined}>
      <div className="learn-sum">
        <dl className="learn-figs">
          {FIGS.map((f) => (
            <div key={f.st} className="grid gap-1">
              <dt className="eyebrow flex items-center gap-1.5">
                <span className={`dot tone-${f.tone}`} aria-hidden="true" />
                {f.label}
              </dt>
              <dd
                className={`font-mono m-0 text-lead font-medium tabular-nums ${counts[f.st] ? "text-strong" : "text-muted"}`}
              >
                {counts[f.st]}
              </dd>
            </div>
          ))}
        </dl>
        <div className="meter" aria-hidden="true">
          <span className="tone-green" style={share(counts.known, total)} />
          <span className="tone-purple" style={share(counts.learning, total)} />
          <span className="tone-cyan" style={share(counts.due, total)} />
        </div>
        {action && <div className="learn-figs-action">{action}</div>}
      </div>
    </Card>
  );
}

// lessons as one list of rows across the page: the title, one muted line under it (its pack, its short line), and,
// where the list mixes states (a search), the state's chip at the end; two columns on a computer
function Lessons({
  rows,
  label,
  packName,
  chips = false,
}: {
  rows: Row[];
  label: string;
  packName: (id: string) => string;
  chips?: boolean;
}) {
  return (
    <List cols={rows.length > 1} label={label}>
      {rows.map((l) => {
        const line = [packName(l.pack), l.short].filter(Boolean).join(" · ");
        return (
          <ListRow
            key={l.id}
            to={lessonPath(l.id)}
            title={l.title}
            line={line ? <span className="line-clamp-1">{line}</span> : undefined}
            end={chips ? <StateChip state={l.state} /> : undefined}
          />
        );
      })}
    </List>
  );
}

// the lessons under a heading per state (the heading says the state, so the rows carry no chip): to review, new,
// learning; the known ones folded at the end
function ByState({ rows, packName }: { rows: Row[]; packName: (id: string) => string }) {
  return (["due", "new", "learning", "known"] as const)
    .map((st) => ({ st, rows: rows.filter((r) => r.state === st) }))
    .filter((g) => g.rows.length > 0)
    .map((g) =>
      g.st === "known" ? (
        <details key={g.st}>
          <summary className="disclosure">
            Known · <span className="font-mono tabular-nums">{g.rows.length}</span>
          </summary>
          <div className="mt-2">
            <Lessons label="Known" rows={g.rows} packName={packName} />
          </div>
        </details>
      ) : (
        <section key={g.st} className="grid gap-3">
          <h2 className="font-cond m-0 text-section">
            {STATE[g.st].label} ·{" "}
            <span className={`font-mono tabular-nums ${g.st === "due" ? "text-cyan" : "text-muted"}`}>
              {g.rows.length}
            </span>
          </h2>
          <Lessons label={STATE[g.st].label} rows={g.rows} packName={packName} />
        </section>
      ),
    );
}

// a pack's lesson, in the pack's order: its place in mono before the title; at the end its state's chip once it has
// one (a new lesson has none, so the chips that show say something), or, in a guide, a ✓ once the topic is read
function PackRow({ r, mark, guide }: { r: Row; mark: string; guide: boolean }) {
  return (
    <ListRow
      to={lessonPath(r.id)}
      title={
        <span className="flex items-baseline gap-3">
          <span className="font-mono w-8 shrink-0 text-small text-muted tabular-nums">{mark}</span>
          <span className="min-w-0">{r.title}</span>
        </span>
      }
      line={!guide && r.short ? <span className="line-clamp-1 pl-11">{r.short}</span> : undefined}
      end={
        r.state === "new" ? undefined : guide && done(r) ? (
          <span className="text-green" role="img" aria-label="Done">
            ✓
          </span>
        ) : (
          <StateChip state={r.state} />
        )
      }
    />
  );
}

// a guide opens as its contents: each part folded under its number and name, with how many of its topics are done;
// the part that holds the next topic opens
function GuideContents({ rows, next }: { rows: Row[]; next?: Row }) {
  const parts: { name: string; rows: Row[] }[] = [];
  for (const r of rows) {
    const last = parts[parts.length - 1];
    if (last && last.name === r.part) last.rows.push(r);
    else parts.push({ name: r.part, rows: [r] });
  }
  return (
    <div className="grid gap-3">
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
              <List label={p.name} cols={p.rows.length > 1}>
                {p.rows.map((r) => (
                  <PackRow key={r.id} r={r} guide mark={r.eyebrow.match(/Topic (\S+)/)?.[1] ?? "·"} />
                ))}
              </List>
            </div>
          </details>
        ) : (
          <List key={`loose-${p.rows[0].id}`} cols={p.rows.length > 1}>
            {p.rows.map((r) => (
              <PackRow
                key={r.id}
                r={r}
                guide
                mark={r.title === "Glossary" ? "A–Z" : r.title === "References" ? "↗" : "·"}
              />
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

const FOLD = "kestrel-learn-packs";
// the packs show under a mouse and start folded on touch (as Searches' filters do), until I fold or open them
const packsOpenAtFirst = () => {
  try {
    const kept = localStorage.getItem(FOLD);
    if (kept) return kept !== "folded";
  } catch {
    // storage off: the pointer decides each visit
  }
  return !matchMedia("(pointer: coarse)").matches;
};

export function LearnPacks({ area = "learn" }: { area?: Area }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const pick = params.get("pack") ?? "";
  const pickGroup = params.get("group") ?? "";
  const [q, setQ] = useState("");
  const [showPacks, setShowPacks] = useState(packsOpenAtFirst);
  const foldPacks = (v: boolean) => {
    setShowPacks(v);
    try {
      localStorage.setItem(FOLD, v ? "open" : "folded");
    } catch {
      // storage off: the fold lasts the visit
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
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["learn-overview"] }),
  });

  const o = overview.data;
  const packs = o?.packs ?? [];
  const lessons = o?.lessons ?? [];
  const chosen = packs.find((p) => p.id === pick);
  const inGroup = new Set(packs.filter((p) => p.group === pickGroup).map((p) => p.id));
  const rows = lessons.filter((l) => (pick ? l.pack === pick : pickGroup ? inGroup.has(l.pack) : true));
  const packName = (id: string) => titled(packs.find((p) => p.id === id)?.name ?? "");
  // the packs under their parents, in the order each parent first appears; packs with none come last
  const parents: [string, Pack[]][] = [];
  for (const p of packs) {
    const at = parents.find(([g]) => g === p.group);
    if (at) at[1].push(p);
    else parents.push([p.group, [p]]);
  }
  parents.sort((a, b) => (a[0] === "" ? 1 : b[0] === "" ? -1 : 0));
  const known = [...new Set(packs.map((p) => p.group).filter(Boolean))];
  const stateOf = new Map(lessons.map((l) => [l.id, l.state]));
  // a pack's count means what the summary means: its lessons to review today, never the new ones
  const dueIn = (ids: Pack[]) => {
    const set = new Set(ids.map((p) => p.id));
    return lessons.filter((l) => set.has(l.pack) && l.state === "due").length;
  };
  const choose = (v: string) => setParams(v.startsWith("group:") ? { group: v.slice(6) } : { pack: v.slice(5) });
  const other: Area = area === "learn" ? "interview" : "learn";
  const home = AREA_NAME[area];
  const back = { to: AREA_PATH[area], label: home };

  const errors = [overview, move, regroup].map((x) =>
    x.isError ? (
      <p key={String(x.error)} className="m-0 text-detail text-red">
        {String((x.error as Error).message)}
      </p>
    ) : null,
  );
  // the first load: the figures' and the list's places, shimmering
  const loading = !o && overview.isPending && (
    <>
      <div className="card skeleton min-h-26" aria-hidden="true" />
      <div className="card skeleton min-h-65" aria-hidden="true" />
    </>
  );

  // ── a pack: its figures with Continue, its lessons in order, its settings at the foot
  if (pick) {
    if (!chosen)
      return (
        <Page title={o ? "This pack is gone" : ""} back={back}>
          {errors}
          {loading ||
            (o && (
              <EmptyState
                title="It was moved to the other area, or removed."
                action={
                  <Link to={back.to} className="btn">
                    Open {home}
                  </Link>
                }
              />
            ))}
        </Page>
      );
    const ordered = [...rows].sort((a, b) => a.position - b.position);
    const isGuide = rows.some((r) => r.part);
    const topics = ordered.filter((r) => r.part);
    // what Continue opens: a guide's first topic not read yet; another pack's first lesson to review, else its
    // first new one
    const next = isGuide
      ? ordered.find((r) => r.part && !done(r))
      : (ordered.find((r) => r.state === "due") ?? ordered.find((r) => r.state === "new"));
    // the parent shows picked at once, while the change is saved
    const groupNow = regroup.isPending ? regroup.variables.group : chosen.group;
    return (
      <Page
        eyebrow={
          chosen.group ? <span className={`text-tone tone-${groupTone(chosen.group)}`}>{chosen.group}</span> : undefined
        }
        title={titled(chosen.name)}
        back={back}
        // what the figures don't say: a guide's topics read so far, or how many lessons the pack holds
        line={
          isGuide ? (
            <>
              <V>{topics.filter(done).length}</V> of <V>{topics.length}</V> topics read
            </>
          ) : (
            <>
              <V>{chosen.lessons}</V> {plural(chosen.lessons, "lesson")}
            </>
          )
        }
      >
        {errors}
        <Figures
          counts={countOf(rows)}
          action={
            next && (
              <>
                <span className="min-w-0 text-small text-muted">
                  Next <V>{next.title}</V>
                </span>
                <Link to={lessonPath(next.id)} className="btn btn-primary">
                  Continue
                </Link>
              </>
            )
          }
        />
        {isGuide ? (
          <GuideContents rows={ordered} next={next} />
        ) : (
          <List cols={ordered.length > 1} label="Lessons">
            {ordered.map((r, i) => (
              <PackRow key={r.id} r={r} guide={false} mark={String(i + 1)} />
            ))}
          </List>
        )}
        {/* the pack's settings, rare, at the page's foot behind a fold: its parent (a pick, or a new one written in the
            box, saved on Enter or on leaving it), and the move to the other area, after which the page goes back */}
        <details>
          <summary className="disclosure">Pack settings</summary>
          <div className="learn-rows mt-2">
            <span className="eyebrow">Under</span>
            <div className="learn-under">
              <Pills
                label="The pack's parent"
                options={[
                  ...[...new Set([...known, groupNow].filter(Boolean))].map((g) => ({
                    value: g,
                    label: g,
                    tone: groupTone(g),
                  })),
                  { value: "", label: "None" },
                ]}
                value={groupNow}
                onChange={(g) => g !== groupNow && regroup.mutate({ id: chosen.id, group: g })}
              />
              <input
                className="input w-44 max-w-full"
                aria-label="A new parent"
                placeholder="A new parent"
                maxLength={40}
                key={`${chosen.id}-${chosen.group}`}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                onBlur={(e) => {
                  const g = e.target.value.trim();
                  if (g && g !== chosen.group) regroup.mutate({ id: chosen.id, group: g });
                }}
              />
            </div>
            <span className="eyebrow">Area</span>
            <div>
              <button
                type="button"
                className="btn"
                disabled={move.isPending}
                title={`The pack and its lessons move to ${AREA_NAME[other]}; the same button there moves them back`}
                onClick={() => move.mutate({ id: chosen.id, to: other })}
              >
                Move to {AREA_NAME[other]}
              </button>
            </div>
          </div>
        </details>
      </Page>
    );
  }

  // ── a parent: its figures, its packs, its lessons by state
  if (pickGroup) {
    const mine = packs.filter((p) => p.group === pickGroup);
    return (
      <Page
        title={pickGroup}
        back={back}
        line={
          o && (
            <>
              <V>{mine.length}</V> {plural(mine.length, "pack")} · <V>{rows.length}</V> {plural(rows.length, "lesson")}
            </>
          )
        }
      >
        {errors}
        {loading}
        {o && mine.length === 0 && <EmptyState title="No pack is under this parent now." />}
        {o && mine.length > 0 && (
          <>
            <Figures counts={countOf(rows)} />
            <List cols={mine.length > 1} label="Packs">
              {mine.map((p) => {
                const due = dueIn([p]);
                return (
                  <ListRow
                    key={p.id}
                    to={`${AREA_PATH[area]}?pack=${encodeURIComponent(p.id)}`}
                    icon={<span className={`dot tone-${groupTone(p.group)}`} />}
                    title={titled(p.name)}
                    line={
                      <>
                        <V>{p.lessons}</V> {plural(p.lessons, "lesson")} · <V>{p.known}</V> known
                      </>
                    }
                    end={due ? <span className="chip chip-caps tone-cyan">{due} to review</span> : undefined}
                  />
                );
              })}
            </List>
            <ByState rows={rows} packName={packName} />
          </>
        )}
      </Page>
    );
  }

  // ── the front page
  const searching = q.trim().length > 1;
  return (
    <Page
      title={home}
      line={
        o && (
          <>
            <V>{packs.length}</V> {plural(packs.length, "pack")} · <V>{lessons.length}</V>{" "}
            {plural(lessons.length, "lesson")}
          </>
        )
      }
      actions={
        <>
          {/* Learn and Interview prep: one layout, two areas; the switch goes between them */}
          <Seg
            label="Area"
            options={(["learn", "interview"] as const).map((a) => ({ value: a, label: AREA_NAME[a] }))}
            value={area}
            onChange={(a) => navigate(AREA_PATH[a])}
          />
          {area === "interview" && (
            <Link
              to="/interview/helper"
              className="btn"
              title="Hold while the question is asked; the nearest prepared answer shows large"
            >
              The helper
            </Link>
          )}
        </>
      }
    >
      {errors}
      {loading}
      {o && packs.length > 0 && (
        <>
          <Figures
            counts={o.summary}
            action={
              <Link to={`/learn/practice?area=${area}`} className="btn btn-primary">
                Start the review
              </Link>
            }
          />
          {/* every filter in one card, as on Searches: the search (its own ✕ clears it, so no Reset beside it), and the
              packs under their parents (a parent's pill opens the parent, a pack's the pack; a count is the lessons to
              review there) */}
          <section className="card grid gap-3">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Field label="Search the lessons" placeholder="Search" value={q} onChange={setQ} />
              </div>
              <button
                type="button"
                className="btn shrink-0"
                aria-expanded={showPacks}
                onClick={() => foldPacks(!showPacks)}
              >
                {showPacks ? "Hide packs" : `Packs · ${packs.length}`}
              </button>
            </div>
            {showPacks && (
              <div className="learn-rows">
                {parents.map(([g, list]) => (
                  <div key={g || "none"} className="contents">
                    {g ? (
                      <Pills
                        label={`All of ${g}`}
                        options={[{ value: `group:${g}`, label: g, count: dueIn(list) || undefined }]}
                        value={null}
                        onChange={choose}
                      />
                    ) : (
                      <span className="eyebrow">Not grouped</span>
                    )}
                    <Pills
                      label={g ? `The packs under ${g}` : "The packs not grouped"}
                      options={list.map((p) => ({
                        value: `pack:${p.id}`,
                        label: titled(p.name),
                        tone: groupTone(g),
                        count: dueIn([p]) || undefined,
                      }))}
                      value={null}
                      onChange={choose}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
          {searching ? (
            found.data && found.data.lessons.length === 0 ? (
              <EmptyState title="No lesson has those words." line="Try another word, or fewer of them." />
            ) : (
              <section className={found.isFetching ? "grid gap-3 busy" : "grid gap-3"}>
                <h2 className="font-cond m-0 text-section">
                  Found · <span className="font-mono text-muted tabular-nums">{found.data?.lessons.length ?? "…"}</span>
                </h2>
                {found.data && (
                  <Lessons
                    label="Lessons found"
                    packName={packName}
                    chips
                    rows={found.data.lessons.map((l) => ({ ...l, state: stateOf.get(l.id) ?? "new" }))}
                  />
                )}
              </section>
            )
          ) : (
            <ByState rows={rows} packName={packName} />
          )}
        </>
      )}
      {o &&
        packs.length === 0 &&
        (area === "learn" ? (
          <EmptyState title="No lessons here yet." line="A pack's lessons show here once it is added." />
        ) : (
          <EmptyState
            title="Nothing in Interview prep yet."
            line="Open a pack in Learn, then Move to Interview prep in its settings."
            action={
              <Link to="/learn" className="btn">
                Open Learn
              </Link>
            }
          />
        ))}
      {/* the method, read once: at the page's foot, folded */}
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
    </Page>
  );
}

// the old pack page's address opens the front page with that pack picked
export function LearnPack() {
  const id = decodeURIComponent(location.pathname.split("/").pop() ?? "");
  location.replace(`/learn?pack=${encodeURIComponent(id)}`);
  return null;
}
