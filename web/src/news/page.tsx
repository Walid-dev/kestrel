// News: the morning brief in plain words. The opening says what the day is about; the stories follow by section (the
// industry and its money, models and research, building with AI, the wider tech day, views), each a card at the
// Searches standard: its section's chip and its source on top, the headline with its key number as a pill, the story
// in a few sentences, then its links as source chips (a lock where a site wants a subscription, the discussion with
// its points) and Look deeper, which hands the headline to Research. On a computer the earlier days and the sources'
// health sit in a rail beside the stories; on a phone they follow them. Listen reads the brief aloud; Make it now, at
// the foot, writes a new one, its five steps in sight while it works, the last brief readable under them.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  type NewsBrief,
  type NewsDay,
  type NewsLink,
  type NewsRun,
  type NewsSourceHealth,
  type NewsStory,
  PHASES,
  SECTIONS,
} from "../../../src/shared/news.ts";
import { type Spoken, useReader } from "../learn/voice.ts";
import { cx } from "../ui/cx.ts";
import { EmptyState } from "../ui/empty.tsx";
import { List, Row } from "../ui/list.tsx";
import { Page } from "../ui/page.tsx";
import {
  ago,
  clock,
  dayName,
  getJson,
  localDay,
  plural,
  points,
  runOf,
  SECTION_TONE,
  sentence,
  shortModel,
  useNews,
} from "./data.ts";

const DAYS_SHOWN = 7;

export function News() {
  const [params] = useSearchParams();
  const day = params.get("day") ?? "";
  // today's own day is the page itself; an earlier one is a child page with its way back
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && day !== localDay() ? <Day day={day} /> : <Today />;
}

// Listen: every line read aloud registers here in reading order, while the page draws it; the line being read is lit
function useSay() {
  const reader = useReader();
  const list = useRef<Spoken[]>([]);
  const spoken: Spoken[] = [];
  list.current = spoken;
  const say = (text: string): ReactNode => {
    const i = spoken.push({ text }) - 1;
    return <span className={reader.at === i ? "reading" : undefined}>{text}</span>;
  };
  const actions = (
    <>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => (reader.reading ? reader.stop() : reader.play(list.current))}
      >
        {reader.reading ? "■ Stop" : "▶ Listen"}
      </button>
      <button
        type="button"
        className="btn"
        aria-pressed={reader.speed < 1}
        onClick={() => reader.setSpeed((s) => (s < 1 ? 1 : 0.8))}
      >
        Slow
      </button>
    </>
  );
  return { say, actions };
}

function Today() {
  const queryClient = useQueryClient();
  const news = useNews();
  const { say, actions } = useSay();
  const make = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/news/run", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? `the server answered ${res.status}`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["news"] }),
  });
  const d = news.data;
  if (!d)
    return (
      <Page
        title="News"
        line={news.isError ? <span className="text-red">{sentence((news.error as Error).message)}</span> : "Opening…"}
      />
    );
  const shown = d.brief;
  const state = runOf(d);
  const running = state?.state === "running" ? state.run : null;
  const failed = state?.state === "failed" ? state : null;
  const body = shown?.brief ? brief(shown.brief, say) : null;
  const busy = Boolean(running) || make.isPending;
  const makeIt = (look: "primary" | "plain" | "small") => (
    <button
      type="button"
      className={cx("btn", look === "primary" && "btn-primary", look === "small" && "btn-sm btn-quiet")}
      disabled={busy}
      onClick={() => make.mutate()}
    >
      {busy ? "Writing…" : "Make it now"}
    </button>
  );
  return (
    <Page
      eyebrow={dayName(shown?.day ?? localDay())}
      title="News"
      line={running ? <Running run={running} /> : shown ? <Facts run={shown} /> : undefined}
      actions={shown?.brief?.stories.length ? actions : undefined}
    >
      <div className="news-layout">
        <div className="news-main">
          {running && <Steps run={running} />}
          {failed && (
            <div className="news-failed" role="status">
              <span className="dot tone-orange news-failed-mark" aria-hidden="true" />
              <p className="m-0">
                {failed.title}: {/[.!?]$/.test(failed.run.error) ? failed.run.error : `${failed.run.error}.`}
                {shown ? (failed.again ? " This morning's is below." : " The last one is below.") : ""}
              </p>
              {/* its fix beside it: the foot's button is a whole brief away on a phone */}
              {shown && makeIt("small")}
            </div>
          )}
          {body}
          {!shown && !running && (
            <EmptyState
              title="No brief yet."
              line={
                d.enabled
                  ? `The first one is written at ${d.time}, or now.`
                  : "The morning news is off in the settings; one can still be written now."
              }
              action={makeIt("primary")}
              detail={d.enabled ? undefined : '"news": { "enabled": true }'}
            />
          )}
          {!shown && make.isError && (
            <p className="m-0 text-detail text-red">{sentence((make.error as Error).message)}</p>
          )}
        </div>
        <aside className="news-rail" aria-label="Earlier days and the sources">
          <EarlierDays except={shown?.day} />
          <SourcesFold />
        </aside>
      </div>
      {/* the rare action last, at the page's foot */}
      {shown && (
        <div className="news-foot">
          {makeIt("plain")}
          <span className="text-small text-muted">
            Reads the sources again and writes a new brief: a few minutes on the computer's model
          </span>
          {make.isError && <span className="text-small text-red">{sentence((make.error as Error).message)}</span>}
        </div>
      )}
    </Page>
  );
}

// an earlier day's brief: the same page as a child of today's, nothing to make
function Day({ day }: { day: string }) {
  const news = useNews(day);
  const { say, actions } = useSay();
  const back = { to: "/news", label: "News" };
  const run = news.data?.brief;
  if (!run?.brief)
    return (
      <Page
        back={back}
        title={dayName(day)}
        line={news.isError ? sentence((news.error as Error).message) : "Opening…"}
      />
    );
  const body = brief(run.brief, say);
  return (
    <Page
      back={back}
      title={dayName(day)}
      line={<Facts run={run} />}
      actions={run.brief.stories.length ? actions : undefined}
    >
      <div className="news-layout">
        <div className="news-main">{body}</div>
        <aside className="news-rail" aria-label="Earlier days">
          <EarlierDays except={day} />
        </aside>
      </div>
    </Page>
  );
}

// the brief itself: the opening, then each section that has stories, in the brief's order. A plain function, not a
// component: every line it reads aloud registers in the page's own render, in the order it is drawn
function brief(b: NewsBrief, say: (text: string) => ReactNode): ReactNode {
  return (
    <>
      {b.opening.length > 0 && (
        <p className="news-opening m-0 text-read text-ink">
          {b.opening.map((s, i) => (
            <Fragment key={s}>
              {i > 0 && " "}
              {say(s)}
            </Fragment>
          ))}
        </p>
      )}
      {!b.stories.length && <p className="m-0 text-body text-muted">{b.quiet || "A quiet morning."}</p>}
      {SECTIONS.map((sec) => {
        const stories = b.stories.map((s, at) => ({ s, at })).filter(({ s }) => s.section === sec.key);
        if (!stories.length) return null;
        return (
          <section key={sec.key} className="news-section" aria-labelledby={`news-${sec.key}`}>
            <h2 id={`news-${sec.key}`} className="news-section-head font-cond text-section">
              <span className={`dot tone-${SECTION_TONE[sec.key]}`} aria-hidden="true" />
              {sec.label}
            </h2>
            <div className="news-stories">
              {stories.map(({ s, at }) => (
                <Story key={s.headline} n={at + 1} story={s} headline={say(s.headline)} text={say(s.text)} />
              ))}
            </div>
          </section>
        );
      })}
      {b.quiet && b.stories.length > 0 && <p className="m-0 text-small text-muted">{b.quiet}</p>}
    </>
  );
}

const LOCK = (
  <svg
    viewBox="0 0 24 24"
    width="11"
    height="11"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

// a story's links: the article's site (a lock when it wants a subscription), and where it is discussed, with its points
function Links({ link }: { link: NewsLink }) {
  const thread = link.thread && link.thread !== link.url ? link.thread : null;
  return (
    <>
      <a
        className="news-src"
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        title={`${link.paywall ? "Paywalled · " : ""}${link.title}`}
      >
        {link.paywall && LOCK}
        {link.paywall && <span className="sr-only">Paywalled: </span>}
        <span className="news-src-name">{link.host}</span>
        {link.score != null && !thread && <b className="news-src-count">{points(link.score)}</b>}
      </a>
      {thread && (
        <a
          className="news-src"
          href={thread}
          target="_blank"
          rel="noopener noreferrer"
          title={`The discussion${link.threadBy ? ` on ${link.threadBy}` : ""}`}
        >
          <span className="news-src-name">{link.threadBy || "Discussion"}</span>
          {link.score != null && <b className="news-src-count">{points(link.score)}</b>}
        </a>
      )}
    </>
  );
}

// one story, at the Searches standard: section chip and source on top, the headline with its figure, the story, its
// links and Look deeper last
function Story({ n, story, headline, text }: { n: number; story: NewsStory; headline: ReactNode; text: ReactNode }) {
  const navigate = useNavigate();
  const deeper = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: story.headline, level: "quick" }),
      });
      const j = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !j.id) throw new Error(j.error ?? `the server answered ${res.status}`);
      return j.id;
    },
    onSuccess: (id) => navigate(`/research?open=${encodeURIComponent(id)}`),
  });
  const main = story.links[0];
  const tone = SECTION_TONE[story.section];
  return (
    <article id={`s${n}`} className="card news-story">
      <div className="news-story-meta">
        <span className={`chip chip-caps tone-${tone}`}>{SECTIONS.find((s) => s.key === story.section)?.short}</span>
        {main && (
          <span className="news-story-from">
            {main.source} · {ago(main.at)}
          </span>
        )}
      </div>
      <div className="news-story-head">
        <h3 className="news-story-title font-cond text-head">{headline}</h3>
        {story.figure && !story.unsure && (
          <span
            className={cx("money", story.trend === "up" && "tone-great", story.trend === "down" && "tone-poor")}
            title={story.trend === "none" ? "The number that matters" : `The number that matters: ${story.trend}`}
          >
            {story.figure}
          </span>
        )}
      </div>
      <p className="m-0 text-body text-ink">{text}</p>
      {story.unsure && <p className="m-0 text-small text-muted">A number here wasn't found in its sources.</p>}
      <div className="news-story-foot">
        {story.links.map((l) => (
          <Links key={l.url} link={l} />
        ))}
        <button
          type="button"
          className="btn btn-sm btn-quiet news-deeper"
          disabled={deeper.isPending}
          title="Research this story on the web, quickly"
          onClick={() => deeper.mutate()}
        >
          {deeper.isPending ? "Starting…" : "Look deeper →"}
        </button>
      </div>
      {deeper.isError && <p className="m-0 text-small text-red">{sentence((deeper.error as Error).message)}</p>}
    </article>
  );
}

// the head's line for a brief written: its count as the chip, then the facts, values bold
function Facts({ run }: { run: NewsRun }) {
  const m = run.meta;
  const n = run.brief?.stories.length ?? 0;
  const minutes = run.finished
    ? Math.max(1, Math.round((Date.parse(run.finished) - Date.parse(run.started)) / 60_000))
    : null;
  return (
    <span className="research-line">
      <span className={`chip chip-caps ${n ? "tone-green" : "tone-muted"}`}>
        {n ? `${n} ${plural(n, "story", "stories")}` : "Quiet"}
      </span>
      <span>
        <b className="font-mono text-ink">{clock(run.finished ?? run.started)}</b>
      </span>
      {m && (
        <span>
          <b className="font-mono text-ink">{m.read}</b> of {m.sources} sources
        </span>
      )}
      {/* the sources that were down for this brief, named: their reasons in the title */}
      {m && m.failed.length > 0 && (
        <span className="text-orange" title={m.failed.map((f) => `${f.name}: ${f.why}`).join("; ")}>
          down:{" "}
          {m.failed.length > 3
            ? `${m.failed
                .slice(0, 2)
                .map((f) => f.name)
                .join(", ")} and ${m.failed.length - 2} more`
            : m.failed.map((f) => f.name).join(", ")}
        </span>
      )}
      {m && m.items > 0 && (
        <span>
          <b className="font-mono text-ink">{m.items}</b> items
        </span>
      )}
      {(m?.model || minutes != null) && (
        <span>
          {m?.model && <span className="font-mono">{shortModel(m.model)}</span>}
          {m?.model && minutes != null && ", "}
          {minutes != null && (
            <>
              <b className="font-mono text-ink">{minutes}</b> min
            </>
          )}
        </span>
      )}
    </span>
  );
}

// the head's line while a brief is written: the working chip, the step, the time so far (a second's tick of its own)
function Running({ run }: { run: NewsRun }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(run.started)) / 1000));
  return (
    <span className="research-line">
      <span className="chip chip-caps tone-green">
        <span className="dot pulse" aria-hidden="true" />
        Writing
      </span>
      <span>{run.step || "Starting"}</span>
      <span className="font-mono">
        {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
      </span>
    </span>
  );
}

// the five steps of a run, each done, now or next; what a step said shows once it has said it
function Steps({ run }: { run: NewsRun }) {
  return (
    <div className="card card-tone tone-green news-running" role="status">
      <ol className="news-steps" aria-label="Where it stands">
        {PHASES.map((name, i) => {
          const said = run.steps.filter((s) => s.phase === i).at(-1)?.text ?? "";
          const state = i < run.phase ? "done" : i === run.phase ? "now" : "next";
          return (
            <li key={name} className="news-step" data-state={state} title={said || name}>
              <span className="news-step-mark" aria-hidden="true">
                {state === "done" ? "✓" : state === "now" ? <span className="dot tone-green pulse" /> : "○"}
              </span>
              {state !== "next" && said ? said : name}
            </li>
          );
        })}
      </ol>
      <div className="loading-bar" aria-hidden="true" />
    </div>
  );
}

// each earlier day's brief, newest first: its first headline, its day and count; seven, then all
function EarlierDays({ except }: { except?: string }) {
  const days = useQuery({
    queryKey: ["news-days"],
    queryFn: () => getJson<{ days: NewsDay[] }>("/api/news/days"),
  });
  const [all, setAll] = useState(false);
  const list = (days.data?.days ?? []).filter((d) => d.day !== except);
  if (!list.length) return null;
  return (
    <section className="news-rail-part" aria-labelledby="news-days">
      <h2 id="news-days" className="eyebrow m-0">
        Earlier days
      </h2>
      <List>
        {(all ? list : list.slice(0, DAYS_SHOWN)).map((d) => (
          <Row
            key={d.day}
            to={`/news?day=${d.day}`}
            title={<span className="block truncate">{d.lead || "A quiet morning"}</span>}
            line={
              <>
                {dayName(d.day)} · <span className="font-mono">{d.stories}</span>{" "}
                {plural(d.stories, "story", "stories")}
              </>
            }
          />
        ))}
      </List>
      {list.length > DAYS_SHOWN && (
        <button type="button" className="btn btn-sm btn-quiet justify-self-start" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${list.length}`}
        </button>
      )}
    </section>
  );
}

// when a source last answered: the time today, else its day ("Sat 21")
const lastSeen = (iso: string) => {
  const d = new Date(iso);
  return localDay(d) === localDay()
    ? clock(iso)
    : `${d.toLocaleDateString(undefined, { weekday: "short" })} ${d.getDate()}`;
};

// how each source's reads go, folded: what it brought in the last 36 hours, when it last answered, OK or down (and
// since when, once that passes three days)
function SourcesFold() {
  const q = useQuery({
    queryKey: ["news-sources"],
    queryFn: () => getJson<{ sources: NewsSourceHealth[] }>("/api/news/sources"),
  });
  const list = q.data?.sources ?? [];
  if (!list.length) return null;
  const read = list.filter((s) => s.lastTry);
  const up = read.filter((s) => !s.error).length;
  return (
    <details className="news-fold">
      <summary className="disclosure">
        Sources{" "}
        <span className="font-mono text-small text-muted">
          {read.length ? `${up} of ${list.length} up now` : list.length}
        </span>
      </summary>
      <div className="card news-sources">
        <table className="news-table">
          <thead>
            <tr>
              <th scope="col" className="news-th">
                Source
              </th>
              <th scope="col" className="news-th news-num">
                New
              </th>
              <th scope="col" className="news-th">
                Last
              </th>
              <th scope="col" className="news-th">
                <span className="sr-only">State</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((s) => {
              const down = Boolean(s.error);
              const long = down && s.downSince && Date.now() - Date.parse(s.downSince) >= 3 * 86_400_000;
              return (
                <tr key={s.id}>
                  <td className="news-td" title={s.name}>
                    {s.short}
                    {down && (
                      <span className={cx("news-table-why", long ? "text-orange" : "text-muted")}>
                        {long && s.downSince ? `down since ${lastSeen(s.downSince)} · ${s.error}` : s.error}
                      </span>
                    )}
                  </td>
                  <td className="news-td news-num">{s.fresh}</td>
                  <td className="news-td news-time font-mono">{s.lastOk ? lastSeen(s.lastOk) : "–"}</td>
                  <td className="news-td">
                    <span className={`chip chip-caps tone-${down ? "red" : s.lastOk ? "green" : "muted"}`}>
                      {down ? "Down" : s.lastOk ? "OK" : "Not yet"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}
