// All days: the news' history. Every day with a brief, newest first, by month: each row its first headline, its day
// and its count, as the rail's rows, opening the day; its ✕ deletes the day after the shared Confirm. A hundred days
// come at a time, Show older for the next. At the top, the find: a story by words of its headline or its text, across
// every brief kept, each match opening its day at the story. The words stay in the address, so Back from a day finds
// the matches as they were.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigationType, useSearchParams } from "react-router";
import { type NewsDay, SECTIONS } from "../../../src/shared/news.ts";
import { EmptyState } from "../ui/empty.tsx";
import { Field } from "../ui/field.tsx";
import { List, Row } from "../ui/list.tsx";
import { Page } from "../ui/page.tsx";
import { dayName, plural, SECTION_TONE, sentence, useAllDays, useDeleteDay, useFind } from "./data.ts";

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

export function NewsDays() {
  const [params, setParams] = useSearchParams();
  // the words live in the box's own state, so a keyboard that composes (Android's) never waits for the router; the
  // address follows a quarter second after the last key, for Back
  const [words, setWords] = useState(() => params.get("q") ?? "");
  useEffect(() => {
    if ((params.get("q") ?? "") === words) return;
    const t = setTimeout(() => setParams(words ? { q: words } : {}, { replace: true }), 250);
    return () => clearTimeout(t);
  }, [words, params, setParams]);
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
          kept.total > 0 && (
            <span className="research-line">
              <span>
                <b className="font-mono text-ink">{kept.total}</b> {plural(kept.total, "day")} kept
              </span>
              {kept.since && (
                <span>
                  since <b className="text-ink">{since(kept.since)}</b>
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
      {kept && kept.total === 0 ? (
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
          <div className="news-find">
            <Field label="Find a story" placeholder="Find a story in every brief" value={words} onChange={setWords} />
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
                              onClick={() => remove.ask(d.day)}
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
                <span className={`chip chip-caps tone-${SECTION_TONE[f.section]}`}>
                  {SECTIONS.find((s) => s.key === f.section)?.short}
                </span>
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
