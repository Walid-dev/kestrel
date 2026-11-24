// The news on Home: one small card under the figures, the whole card one link to the page. Its head says when the
// brief was written and how many stories it holds; under it the day's three biggest headlines, each on one line with
// its source at the end. While a brief is written, or when today's failed, one line says so above the last brief's
// headlines; before any brief, one quiet line says when the first comes.
import { Link } from "react-router";
import { localDay, plural, sentence, useNews, writtenAt } from "./data.ts";

// a newspaper, drawn by hand on the icons' grid (the dock's News)
export const NEWS_ICON = (
  <svg
    viewBox="0 0 24 24"
    width="22"
    height="22"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4.5 5.5h11V18a1.5 1.5 0 0 0 1.5 1.5H6A1.5 1.5 0 0 1 4.5 18z" />
    <path d="M15.5 9h3v9a1.5 1.5 0 0 1-3 0" />
    <path d="M7.5 9h5M7.5 12.5h5M7.5 16h3" />
  </svg>
);

export function NewsCard() {
  const news = useNews();
  const d = news.data;
  if (!d) return null;
  const shown = d.brief;
  const stories = shown?.brief?.stories ?? [];
  const running = d.run?.state === "running" ? d.run : null;
  const failed = d.run?.state === "failed" && d.run.day === localDay() ? d.run : null;
  return (
    <Link to="/news" className="card card-link news-card">
      <span className="news-card-head">
        <span className="eyebrow">News</span>
        {shown && <span className="news-card-when">{writtenAt(shown)}</span>}
        {stories.length > 0 && (
          <span className="news-card-count">
            {stories.length} {plural(stories.length, "story", "stories")}
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
      </span>
      {running && (
        <span className="news-card-state text-muted">
          <span className="dot tone-green pulse" aria-hidden="true" />
          <span className="news-card-truncate">Writing this morning's news · {running.step}</span>
        </span>
      )}
      {failed && (
        <span className="news-card-state text-orange">
          <span className="dot tone-orange" aria-hidden="true" />
          <span className="news-card-truncate">Today's failed: {failed.error}</span>
        </span>
      )}
      {stories.slice(0, 3).map((s) => (
        <span key={s.headline} className="news-card-line">
          <span className="news-card-headline">{s.headline}</span>
          <span className="news-card-src">{s.links[0]?.source}</span>
        </span>
      ))}
      {shown && !stories.length && (
        <span className="news-card-state text-muted">{sentence(shown.brief?.quiet || "a quiet morning")}</span>
      )}
      {!shown && !running && (
        <span className="news-card-state text-muted">
          {d.enabled
            ? `The first brief comes at ${d.time}, or open it to write one now.`
            : "Off in settings: open it to write one now."}
        </span>
      )}
    </Link>
  );
}
