// The news on Home: one small card, the page's first, the whole card one link to the page. Its head says News in the
// app's own blue (the indigo), when the brief was written and how many stories it holds, both in mono as the figures
// read; then the day's three biggest headlines, each with its source, in words alone (no colour per section: the
// page has those). On a phone the headlines are lines under the head; on a computer the head and the three headlines
// are one row of columns, as the figures under it are, so the card is no taller than they. While a brief is written,
// or when today's failed, the head says so in place of the time (the card never grows); a new brief that failed after
// this morning's is the page's to say. Before any brief, one quiet line says when the first comes.
import { Link } from "react-router";
import { morningAt, plural, runOf, sentence, useNews, writtenAt } from "./data.ts";

export function NewsCard() {
  const news = useNews();
  const d = news.data;
  if (!d) return null;
  const shown = d.brief;
  const stories = shown?.brief?.stories ?? [];
  const run = runOf(d);
  const note = run && !(run.state === "failed" && run.again) ? run : null;
  return (
    <Link to="/news" className="card card-link news-card">
      <span className="news-card-head">
        <span className="eyebrow tone-indigo">News</span>
        <span className="news-card-sub">
          {note ? (
            <span
              className={`news-card-state ${note.state === "failed" ? "text-orange" : "text-muted"}`}
              title={note.state === "failed" ? `${note.title}: ${note.run.error}` : `${note.title}: ${note.run.step}`}
            >
              <span
                className={`dot ${note.state === "failed" ? "tone-orange" : "tone-green pulse"}`}
                aria-hidden="true"
              />
              <span className="news-card-truncate">{note.state === "failed" ? note.title : "Writing…"}</span>
            </span>
          ) : (
            shown && <span className="news-card-when">{writtenAt(shown)}</span>
          )}
          {stories.length > 0 && (
            <span className="news-card-count">
              <b>{stories.length}</b> {plural(stories.length, "story", "stories")}
            </span>
          )}
        </span>
      </span>
      {stories.slice(0, 3).map((s, i) => (
        <span
          key={s.headline}
          className={i === 2 ? "news-card-line news-card-third" : "news-card-line"}
          title={s.headline}
        >
          <span className="news-card-headline">{s.headline}</span>
          <span className="news-card-src">{s.links[0]?.source}</span>
        </span>
      ))}
      {shown && !stories.length && (
        <span className="news-card-note text-muted">{sentence(shown.brief?.quiet || "a quiet morning")}</span>
      )}
      {!shown && !note && (
        <span className="news-card-note text-muted">
          {d.enabled
            ? `The first brief comes at ${morningAt(d.time)}, or open it to write one now.`
            : "Off in settings: open it to write one now."}
        </span>
      )}
      <svg
        className="news-card-chevron"
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
      </svg>
    </Link>
  );
}
