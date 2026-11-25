// What a story's card and a starred story's kept copy share: its links as source chips, and the star. The star is
// Searches' own (the listing sheet's): a pill pressed while starred, a yellow ★ and its word; compact, in a list where
// every row is starred, the ★ alone, its word in its name.
import type { NewsLink } from "../../../src/shared/news.ts";
import { points } from "./data.ts";

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
export function Links({ link }: { link: NewsLink }) {
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

// the star: pressed while starred. busy: a press on its way, already drawn in on; another press meanwhile does
// nothing (the button stays enabled, so the keyboard's focus never drops off it). compact: the ★ alone, label its name
export function Star({
  on,
  busy = false,
  compact = false,
  label = "Starred",
  onPress,
}: {
  on: boolean;
  busy?: boolean;
  compact?: boolean;
  label?: string;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      className="pill"
      aria-pressed={on}
      aria-label={compact ? label : undefined}
      title={on ? "Unstar" : "Keep it under All days › Starred, even once its day is deleted"}
      onClick={() => !busy && onPress()}
    >
      <span className="text-yellow" aria-hidden="true">
        ★
      </span>
      {!compact && (on ? "Starred" : "Star")}
    </button>
  );
}
