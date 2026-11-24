// Many small things as one card of rows instead of a stack of small cards (the apps on Home, the models, the notes,
// the lessons, the tasks): List is the card, Row one line in it. A row is one target: its title opens a page (to), a
// page outside the app in a tab of its own (href) or something on this page (onOpen), stretched over the whole row,
// with a chevron at its end. What sits at its end (a chip, a count, the ✕) stays a target of its own, above it; the ✕
// waits out of sight under a mouse until the row is hovered or focused. cols: two columns on a computer-wide screen,
// the rows running left to right. The look lives in styles.css (.list).
import type { ReactNode } from "react";
import { Link } from "react-router";
import { cx } from "./cx.ts";

export function List({ cols = false, label, children }: { cols?: boolean; label?: string; children: ReactNode }) {
  return (
    <ul className={cx("list", cols && "list-cols")} aria-label={label}>
      {children}
    </ul>
  );
}

export function Row({
  to,
  href,
  onOpen,
  icon,
  title,
  line,
  end,
}: {
  to?: string;
  href?: string;
  onOpen?: () => void;
  // a small icon in its colour, before the words
  icon?: ReactNode;
  title: ReactNode;
  // one quiet line under the title: what it is, a path, a date
  line?: ReactNode;
  // at the row's end, above the row's own target: chips, a count, the ✕
  end?: ReactNode;
}) {
  const opens = Boolean(to || href || onOpen);
  return (
    <li className="list-row">
      {icon && (
        <span className="list-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="list-text">
        {to ? (
          <Link to={to} className="list-title list-open">
            {title}
          </Link>
        ) : href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="list-title list-open">
            {title}
          </a>
        ) : onOpen ? (
          <button type="button" className="list-title list-open" onClick={onOpen}>
            {title}
          </button>
        ) : (
          <span className="list-title">{title}</span>
        )}
        {line && <span className="list-line">{line}</span>}
      </span>
      {end && <span className="list-end">{end}</span>}
      {opens && (
        <svg
          className="list-chevron"
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
      )}
    </li>
  );
}
