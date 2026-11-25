// Learn's front page, and Interview prep's, in one column as wide as the page: the switch between the two in the head,
// the figures (to review, new, learning, known: the shared strip) with the progress bar and Start the review under
// them, one filter card (Searches': the search, a row per parent, its All and its packs as pills), the lessons by
// state, the way to learn here at the foot. A pack (or a parent) is a page under it: its own figures with Continue, its
// lessons in order (a guide's as its contents, parts folded), and its settings at the foot (its parent, the move to
// the other area), so nothing has to be decided for good. Every page's eyebrow is in the area's colour (Learn purple,
// Interview prep green): the area's word on its front page, a pack's parent on a pack.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, type ReactNode, useEffect, useId, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import type { AppName } from "../ui/apps.tsx";
import { EmptyState } from "../ui/empty.tsx";
import { Figure, Figures as Strip } from "../ui/figures.tsx";
import { FilterPanel, FilterRow } from "../ui/filters.tsx";
import { List, Row as ListRow } from "../ui/list.tsx";
import { Page } from "../ui/page.tsx";
import { Pills, type Tone } from "../ui/pills.tsx";
import { SectionHead } from "../ui/section.tsx";
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
// each area's app (its colour on the eyebrows) and the word for what it holds, the front page's eyebrow and the
// eyebrow of a page that sits under no parent
export const AREA_APP: Record<Area, AppName> = { learn: "Learn", interview: "Interview prep" };
export const AREA_WORD: Record<Area, string> = { learn: "Lessons", interview: "Answers to say" };
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

// the figures, the shared strip: each state in its one colour and its one name (the same as its chip, its heading and
// its part of the bar), the number in mono; under them the bar and the page's one filled button (or what Continue
// opens), wrapping under the bar when the row is too narrow. A review waiting today is what matters now: the strip
// takes its edge
const FIGS = ["due", "new", "learning", "known"] as const;
function Figures({ counts, action }: { counts: Counts; action?: ReactNode }) {
  const total = counts.due + counts.new + counts.learning + counts.known || 1;
  return (
    <Strip
      label="The lessons, by state"
      tone={counts.due > 0 ? "cyan" : undefined}
      foot={
        <>
          <div className="meter min-w-40 flex-1" aria-hidden="true">
            <span className="tone-green" style={share(counts.known, total)} />
            <span className="tone-purple" style={share(counts.learning, total)} />
            <span className="tone-cyan" style={share(counts.due, total)} />
          </div>
          {action && <div className="learn-figs-action">{action}</div>}
        </>
      }
    >
      {FIGS.map((st) => (
        <Figure key={st} label={STATE[st].label} tone={STATE[st].tone} value={counts[st]} quiet={!counts[st]} />
      ))}
    </Strip>
  );
}

// lessons as one list of rows across the page: the title, a muted line under it (its pack, its short line, up to two
// lines, so a phone still shows the short line whole), and,
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
            line={line ? <span className="line-clamp-2">{line}</span> : undefined}
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
            Known <span className="font-mono text-small text-muted">{g.rows.length}</span>
          </summary>
          <div className="mt-2">
            <Lessons label="Known" rows={g.rows} packName={packName} />
          </div>
        </details>
      ) : (
        <section key={g.st} className="grid gap-3" aria-labelledby={`learn-${g.st}`}>
          <SectionHead id={`learn-${g.st}`} title={STATE[g.st].label} count={g.rows.length} tone={STATE[g.st].tone} />
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
      line={!guide && r.short ? <span className="line-clamp-2 pl-11">{r.short}</span> : undefined}
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

// a guide opens as its contents, read down in one column as a table of contents is: each part folded under its
// number and name, with how many of its topics are done; the part that holds the next topic opens
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
              <List label={p.name}>
                {p.rows.map((r) => (
                  <PackRow key={r.id} r={r} guide mark={r.eyebrow.match(/Topic (\S+)/)?.[1] ?? "·"} />
                ))}
              </List>
            </div>
          </details>
        ) : (
          <List key={`loose-${p.rows[0].id}`}>
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

// pills that open a page (a parent, a pack): links in the pill's look, so none is read out as a choice left unpicked
function NavPills({
  label,
  items,
}: {
  label: string;
  items: { to: string; label: string; tone?: Tone; count?: number }[];
}) {
  return (
    <ul className="pills-row m-0 p-0" aria-label={label}>
      {items.map((it) => (
        <li key={it.to} className="min-w-0">
          <Link to={it.to} className={`pill ${it.tone ? `tone-${it.tone}` : ""}`}>
            {it.tone && <span className="dot" aria-hidden="true" />}
            <span className="pill-name">{it.label}</span>
            {it.count !== undefined && <b>{it.count}</b>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

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
  // a new parent for the pack, written in its box: Enter saves it, and the box empties and keeps the focus
  const [newGroup, setNewGroup] = useState("");
  const newGroupHint = useId();
  const [showPacks, setShowPacks] = useState(packsOpenAtFirst);
  // the parents folded to their name in the filter card, for this visit
  const [closedRows, setClosedRows] = useState<string[]>([]);
  const flipRow = (g: string) => setClosedRows((all) => (all.includes(g) ? all.filter((x) => x !== g) : [...all, g]));
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
        <Page title={o ? "This pack is gone" : ""} back={back} app={AREA_APP[area]} eyebrow={AREA_WORD[area]}>
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
    // a guide's figures count its topics, as its head line does (the Glossary and the References are no topics)
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
        app={AREA_APP[area]}
        eyebrow={chosen.group || AREA_WORD[area]}
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
          counts={countOf(isGuide ? topics : rows)}
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
            box, saved on Enter), and the move to the other area, after which the page goes back */}
        <details>
          <summary className="disclosure">Pack settings</summary>
          <div className="learn-rows mt-2">
            <div className="learn-group">
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
                <span className="grid gap-1">
                  <input
                    className="input w-44 max-w-full"
                    aria-label="A new parent"
                    aria-describedby={newGroupHint}
                    placeholder="A new parent"
                    maxLength={40}
                    enterKeyHint="done"
                    value={newGroup}
                    onChange={(e) => setNewGroup(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      const g = newGroup.trim();
                      if (g && g !== groupNow) regroup.mutate({ id: chosen.id, group: g });
                      setNewGroup("");
                    }}
                  />
                  <span id={newGroupHint} className="text-small text-muted">
                    Enter saves
                  </span>
                </span>
              </div>
            </div>
            <div className="learn-group">
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
        app={AREA_APP[area]}
        eyebrow={AREA_WORD[area]}
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
      app={AREA_APP[area]}
      eyebrow={AREA_WORD[area]}
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
              Answer helper
            </Link>
          )}
        </>
      }
    >
      {/* a touch screen shows no title: what the helper does, in one quiet line, where it is used most */}
      {area === "interview" && (
        <p className="m-0 hidden text-small text-muted pointer-coarse:block">
          Answer helper: hold while the question is asked; the nearest prepared answer shows large.
        </p>
      )}
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
          {/* every filter in one card, as on Searches: the search with its Reset, then a row per parent, folding to its
              name: its All (opening the parent) first, then its packs (each opening the pack); a count is the lessons
              to review there. The packs not grouped have a row of their own, last */}
          <FilterPanel
            find={{ label: "Search the lessons", value: q, onChange: setQ }}
            changed={q !== ""}
            onReset={() => setQ("")}
            fold={{ shown: showPacks, onToggle: () => foldPacks(!showPacks), name: "Packs", count: packs.length }}
          >
            {parents.map(([g, list]) => (
              <FilterRow
                key={g || "none"}
                label={g || "Not grouped"}
                summary={`${list.length} ${plural(list.length, "pack")}`}
                open={!closedRows.includes(g)}
                onToggle={() => flipRow(g)}
              >
                <NavPills
                  label={g ? `${g}: all of it, and its packs` : "The packs not grouped"}
                  items={[
                    ...(g
                      ? [
                          {
                            to: `${AREA_PATH[area]}?group=${encodeURIComponent(g)}`,
                            label: "All",
                            count: dueIn(list) || undefined,
                          },
                        ]
                      : []),
                    ...list.map((p) => ({
                      to: `${AREA_PATH[area]}?pack=${encodeURIComponent(p.id)}`,
                      label: titled(p.name),
                      tone: groupTone(g),
                      count: dueIn([p]) || undefined,
                    })),
                  ]}
                />
              </FilterRow>
            ))}
          </FilterPanel>
          {searching ? (
            found.data && found.data.lessons.length === 0 ? (
              <EmptyState title="No lesson has those words." line="Try another word, or fewer of them." />
            ) : (
              <section className={found.isFetching ? "grid gap-3 busy" : "grid gap-3"} aria-labelledby="learn-found">
                <SectionHead id="learn-found" title="Found" count={found.data?.lessons.length ?? "…"} />
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

// the old pack page's address opens the pack's page in its area: Interview prep when the pack is there, else Learn
export function LearnPack() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  useEffect(() => {
    let left = false;
    fetch("/api/learn/packs?area=interview")
      .then((res) => (res.ok ? (res.json() as Promise<{ packs: { id: string }[] }>) : { packs: [] }))
      .catch(() => ({ packs: [] }))
      .then(({ packs }) => {
        const area: Area = packs.some((p) => p.id === id) ? "interview" : "learn";
        if (!left) navigate(`${AREA_PATH[area]}?pack=${encodeURIComponent(id)}`, { replace: true });
      });
    return () => {
      left = true;
    };
  }, [id, navigate]);
  return null;
}
