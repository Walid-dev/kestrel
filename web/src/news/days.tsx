// All days: the news' history, in two views, Days and Starred, a Seg at the top (the view stays in the address, so
// Back finds it). Days: every day with a brief, newest first, by month: each row its first headline, its day and its
// count, as the rail's rows, opening the day; its ✕ deletes the day after the shared Confirm. A hundred days come at a
// time, Show older for the next. At the top, the find: a story by words of its headline or its text, across every
// brief kept, each match opening its day at the story. The words stay in the address, so Back from a day finds the
// matches as they were. Starred: every story starred, the newest starred first, each row its headline, its section's
// chip, its day and its first source, opening its day at the story while that day's page shows it, else the copy its
// star kept, in a box; its ★ (the card's, alone at the row's end) unstars it (after Confirm when that copy is all that
// is left).
import { useEffect, useRef, useState } from "react";
import { Link, useNavigationType, useSearchParams } from "react-router";
import { type NewsDay, type NewsStar, SECTIONS, type Section } from "../../../src/shared/news.ts";
import { useConfirm } from "../ui/confirm.tsx";
import { cx } from "../ui/cx.ts";
import { Dialog } from "../ui/dialog.tsx";
import { EmptyState } from "../ui/empty.tsx";
import { Field } from "../ui/field.tsx";
import { List, Row } from "../ui/list.tsx";
import { Page } from "../ui/page.tsx";
import { Seg } from "../ui/seg.tsx";
import { Star } from "../ui/star.tsx";
import {
  dayName,
  plural,
  SECTION_TONE,
  sentence,
  useAllDays,
  useDeleteDay,
  useFind,
  useStar,
  useStars,
} from "./data.ts";
import { Links, STAR_HINT } from "./story.tsx";

const thisYear = (day: string) => day.startsWith(String(new Date().getFullYear()));
// "November 2026"
const monthName = (month: string) =>
  new Date(`${month}-01T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
// a day as the find says it: with its year when it isn't this year's
const dayOf = (day: string) =>
  thisYear(day)
    ? dayName(day)
    : new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
// "Sep 14", the first day kept
const since = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: thisYear(day) ? undefined : "numeric",
  });
// a story's section, as its chip says it
const SectionChip = ({ section }: { section: Section }) => (
  <span className={`chip chip-caps tone-${SECTION_TONE[section]}`}>
    {SECTIONS.find((s) => s.key === section)?.short}
  </span>
);

type View = "days" | "starred";

export function NewsDays() {
  const [params, setParams] = useSearchParams();
  const view: View = params.get("view") === "starred" ? "starred" : "days";
  // the words live in the box's own state, so a keyboard that composes (Android's) never waits for the router; the
  // address follows a quarter second after the last key, for Back (the view kept beside them)
  const [words, setWords] = useState(() => params.get("q") ?? "");
  useEffect(() => {
    if ((params.get("q") ?? "") === words) return;
    const t = setTimeout(
      () =>
        setParams(
          (p) => {
            const next = new URLSearchParams(p);
            if (words) next.set("q", words);
            else next.delete("q");
            return next;
          },
          { replace: true },
        ),
      250,
    );
    return () => clearTimeout(t);
  }, [words, params, setParams]);
  // a view picked replaces the address, as the words do: Back leaves the page, not the view
  const pick = (v: View) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (v === "starred") next.set("view", "starred");
        else next.delete("view");
        return next;
      },
      { replace: true },
    );
  const finding = words.trim().length >= 2;
  const days = useAllDays();
  const remove = useDeleteDay();
  // opened by a link (the rail's, at the foot of a long page) or by a day deleted at its foot: at the top, once. Back
  // keeps where the browser left it, and the find's words (they replace the address) never move the page
  const how = useNavigationType();
  const arrived = useRef(false);
  useEffect(() => {
    if (arrived.current) return;
    arrived.current = true;
    if (how !== "POP") window.scrollTo(0, 0);
  }, [how]);
  const pages = days.data?.pages ?? [];
  const kept = pages[0];
  // the days by month, newest first
  const months: [string, NewsDay[]][] = [];
  for (const d of pages.flatMap((p) => p.days)) {
    const last = months.at(-1);
    if (last?.[0] === d.day.slice(0, 7)) last[1].push(d);
    else months.push([d.day.slice(0, 7), [d]]);
  }
  return (
    <Page
      back={{ to: "/news", label: "News" }}
      title="All days"
      line={
        kept ? (
          (kept.total > 0 || kept.starred > 0) && (
            <span className="research-line">
              <span>
                <b className="font-mono text-ink">{kept.total}</b> {plural(kept.total, "day")} kept
              </span>
              {kept.since && (
                <span>
                  since <b className="text-ink">{since(kept.since)}</b>
                </span>
              )}
              {kept.starred > 0 && (
                <span>
                  <b className="font-mono text-ink">{kept.starred}</b> starred
                </span>
              )}
            </span>
          )
        ) : days.isError ? (
          <span className="text-red">{sentence((days.error as Error).message)}</span>
        ) : (
          "Opening…"
        )
      }
    >
      {kept && kept.total === 0 && kept.starred === 0 ? (
        <EmptyState
          title="No brief yet."
          line="Each morning's brief is kept here, day by day."
          action={
            <Link to="/news" className="btn">
              Open News
            </Link>
          }
        />
      ) : (
        <>
          <Seg
            label="Show"
            options={[
              { value: "days", label: "Days" },
              { value: "starred", label: "Starred", hint: "Kept for good, even once their day is deleted" },
            ]}
            value={view}
            onChange={pick}
          />
          {view === "starred" ? (
            <Starred />
          ) : kept && kept.total === 0 ? (
            <EmptyState title="No day kept now." line="Each morning's brief comes here, day by day." />
          ) : (
            <>
              <div className="news-find">
                <Field
                  label="Find a story"
                  placeholder="Find a story in every brief"
                  value={words}
                  onChange={setWords}
                />
              </div>
              {finding ? (
                <Found words={words.trim()} />
              ) : (
                <>
                  <div className="news-months">
                    {months.map(([month, list], i) => (
                      <section key={month} className="news-month" aria-labelledby={`news-${month}`}>
                        <h2 id={`news-${month}`} className="font-cond m-0 text-section">
                          {monthName(month)}{" "}
                          {/* the last month may go on in the next hundred days: its count waits for them */}
                          {(i < months.length - 1 || !days.hasNextPage) && (
                            <span className="font-mono text-small text-muted">{list.length}</span>
                          )}
                        </h2>
                        <List label={monthName(month)}>
                          {list.map((d) => (
                            <Row
                              key={d.day}
                              to={`/news?day=${d.day}`}
                              title={<span className="line-clamp-2">{d.lead || "A quiet morning"}</span>}
                              line={
                                <>
                                  {dayName(d.day)} · <span className="font-mono">{d.stories}</span>{" "}
                                  {plural(d.stories, "story", "stories")}
                                  {/* a refused delete says so on its own row, where the eye is: the box named what
                                      would go, so silence would read as done */}
                                  {remove.drop.isError && remove.drop.variables === d.day && (
                                    <span className="block text-red" role="alert">
                                      The delete didn't land: {(remove.drop.error as Error).message}
                                    </span>
                                  )}
                                </>
                              }
                              end={
                                <button
                                  type="button"
                                  className="card-remove"
                                  aria-label={`Delete ${dayName(d.day)}`}
                                  title={`Delete ${dayName(d.day)}`}
                                  disabled={remove.drop.isPending && remove.drop.variables === d.day}
                                  onClick={() => remove.ask(d.day, d.starred)}
                                >
                                  ✕
                                </button>
                              }
                            />
                          ))}
                        </List>
                      </section>
                    ))}
                  </div>
                  {days.hasNextPage && (
                    <button
                      type="button"
                      className="btn justify-self-start"
                      disabled={days.isFetchingNextPage}
                      onClick={() => days.fetchNextPage()}
                    >
                      {days.isFetchingNextPage ? "Opening…" : "Show older days"}
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </Page>
  );
}

// the stories found: each its headline, its section's chip and its day, opening the day at the story. The words are
// asked a quarter second after the last key, and the last matches stay on screen meanwhile
function Found({ words }: { words: string }) {
  const [asked, setAsked] = useState(words);
  useEffect(() => {
    const t = setTimeout(() => setAsked(words), 250);
    return () => clearTimeout(t);
  }, [words]);
  const find = useFind(asked);
  if (find.isError) return <p className="m-0 text-detail text-red">{sentence((find.error as Error).message)}</p>;
  if (!find.data) return <div className="loading-bar" aria-hidden="true" />;
  const { found, more } = find.data;
  if (!found.length)
    return <EmptyState title="No story has those words." line="Each word must be in a story's headline or its text." />;
  return (
    <section className="news-found" aria-labelledby="news-found" aria-busy={find.isFetching}>
      <h2 id="news-found" className="font-cond m-0 text-section">
        Stories <span className="font-mono text-small text-muted">{more ? `${found.length}+` : found.length}</span>
      </h2>
      <List label="Stories found">
        {found.map((f) => (
          <Row
            key={`${f.day}:${f.n}`}
            to={`/news?day=${f.day}#s${f.n}`}
            title={f.headline}
            line={
              <span className="news-found-line">
                <SectionChip section={f.section} />
                {dayOf(f.day)}
              </span>
            }
          />
        ))}
      </List>
      {more && <p className="m-0 text-small text-muted">The {found.length} newest: add a word to narrow it.</p>}
    </section>
  );
}

// the stories starred, the newest starred first. A star whose day's page still shows it opens there, at the story;
// one whose day's page no longer does (the day deleted, or its brief written again by Make it now) opens the copy it
// kept, in a box, and its line says so. Unstarring that one asks first: the copy goes for good. One whose day still
// shows it unstars at once and stays in its place, struck through, until the page is left: its ★ stars it again
const keyOf = (s: { brief: string; n: number }) => `${s.brief}:${s.n}`;
function Starred() {
  const stars = useStars();
  const star = useStar();
  const sure = useConfirm();
  // the kept copy open in the box; the last one stays drawn while the box closes
  const [open, setOpen] = useState<NewsStar | null>(null);
  const [last, setLast] = useState<NewsStar | null>(null);
  if (open && open !== last) setLast(open);
  const shown = open ?? last;
  // the live stars unstarred here, kept in sight until the page is left, and each one's first starred time, so a star
  // given back keeps its place in the list
  const [left, setLeft] = useState<NewsStar[]>([]);
  const [first, setFirst] = useState<Record<string, string>>({});
  const going = (s: NewsStar) => star.isPending && star.variables.brief === s.brief && star.variables.n === s.n;
  const failed = (s: NewsStar) => star.isError && star.variables.brief === s.brief && star.variables.n === s.n;
  const unstar = async (s: NewsStar) => {
    if (
      !s.shown &&
      !(await sure({
        title: "Unstar it?",
        body: "Its day's page no longer shows it, so the copy kept here goes for good.",
        yes: "Unstar",
        danger: true,
      }))
    )
      return;
    // a live one stays in sight from the press on, so the list never drops it while the stars read again
    const drop = () => setLeft((l) => l.filter((x) => keyOf(x) !== keyOf(s)));
    if (s.shown) {
      setLeft((l) => [...l.filter((x) => keyOf(x) !== keyOf(s)), s]);
      setFirst((f) => ({ [keyOf(s)]: s.starred, ...f }));
    }
    star.mutate({ brief: s.brief, n: s.n, on: false }, { onSuccess: () => setOpen(null), onError: drop });
  };
  const restar = (s: NewsStar) =>
    star.mutate(
      { brief: s.brief, n: s.n, on: true },
      { onSuccess: () => setLeft((l) => l.filter((x) => keyOf(x) !== keyOf(s))) },
    );
  if (stars.isError) return <p className="m-0 text-detail text-red">{sentence((stars.error as Error).message)}</p>;
  if (!stars.data) return <div className="loading-bar" aria-hidden="true" />;
  const live = new Set(stars.data.stars.map(keyOf));
  const when = (s: NewsStar) => first[keyOf(s)] ?? s.starred;
  const list = [...stars.data.stars, ...left.filter((s) => !live.has(keyOf(s)))].sort((a, b) =>
    when(b).localeCompare(when(a)),
  );
  if (!list.length)
    return (
      <EmptyState
        title="No story starred yet."
        line="Star a story on its card: it is kept here, even once its day is deleted."
      />
    );
  return (
    <section className="news-starred" aria-label="Starred stories">
      <List label="Starred stories">
        {list.map((s) => {
          const source = s.story.links[0]?.source;
          const on = live.has(keyOf(s));
          return (
            <Row
              key={keyOf(s)}
              {...(s.shown ? { to: `/news?day=${s.day}#s${s.n}` } : { onOpen: () => setOpen(s) })}
              title={<span className={cx("line-clamp-2", !on && "news-unstarred")}>{s.story.headline}</span>}
              line={
                <>
                  <span className="news-found-line">
                    <SectionChip section={s.story.section} />
                    <span>
                      {dayOf(s.day)}
                      {!s.shown && " · its kept copy"}
                      {source && (
                        <>
                          {" "}
                          · <span className="font-mono">{source}</span>
                        </>
                      )}
                    </span>
                  </span>
                  {/* a refused unstar says so on its own row, as a refused delete does */}
                  {failed(s) && (
                    <span className="block text-red" role="alert">
                      The {star.variables?.on ? "star" : "unstar"} didn't land: {(star.error as Error).message}
                    </span>
                  )}
                </>
              }
              end={
                <Star
                  bare
                  on={going(s) ? star.variables?.on === true : on}
                  busy={going(s)}
                  label={`Star “${s.story.headline}”`}
                  hint={STAR_HINT}
                  onPress={() => (on ? unstar(s) : restar(s))}
                />
              }
            />
          );
        })}
      </List>
      <Dialog
        open={Boolean(open)}
        onClose={() => setOpen(null)}
        eyebrow={shown ? `Starred · ${dayOf(shown.day)}` : undefined}
        title={shown?.story.headline ?? ""}
      >
        {shown && <Kept star={shown} going={going(shown)} onUnstar={() => unstar(shown)} />}
      </Dialog>
    </section>
  );
}

// a starred story's kept copy, as its card read: its section's chip, its number, its source and its star (the ★ at
// the top line's right end), the story, its links
function Kept({ star, going, onUnstar }: { star: NewsStar; going: boolean; onUnstar: () => void }) {
  const s = star.story;
  return (
    <div className="news-kept">
      <div className="news-story-meta">
        <SectionChip section={s.section} />
        {s.figure && !s.unsure && (
          <span
            className={cx("money", s.trend === "up" && "tone-great", s.trend === "down" && "tone-poor")}
            title="The number that matters"
          >
            {s.figure}
          </span>
        )}
        {s.links[0] && <span className="news-story-from">{s.links[0].source}</span>}
        <Star bare on={!going} busy={going} label={`Star “${s.headline}”`} hint={STAR_HINT} onPress={onUnstar} />
      </div>
      <p className="m-0 text-body text-ink">{s.text}</p>
      {s.unsure && <p className="m-0 text-small text-muted">A number here wasn't found in its sources.</p>}
      <div className="news-story-foot">
        {s.links.map((l) => (
          <Links key={l.url} link={l} />
        ))}
      </div>
      <p className="m-0 text-small text-muted">Its day's page no longer shows it: this is the copy its star kept.</p>
    </div>
  );
}
