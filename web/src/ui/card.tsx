// A card: the .card ground (a surface, a hairline, room inside), in three uses. Plain: a block of the page. A link:
// the whole card opens a page. With a title: its meta row on top (chips, a date), the title in the heading voice, what
// it holds under it, muted; the title opens it (a page, or something on this page) and stretches over the whole card,
// and the ✕ at the end of the meta row deletes it, the page asking first with Confirm. A tone marks its edge for what
// matters now (needs me, review today).
import type { ReactNode } from "react";
import { Link } from "react-router";
import { cx } from "./cx.ts";
import type { Tone } from "./pills.tsx";

type Base = {
  children?: ReactNode;
  // its edge in a working colour, for what matters now
  tone?: Tone;
  // across the whole row of the grid it sits in
  wide?: boolean;
  // on its way out (a delete being saved): dimmed
  busy?: boolean;
};
type Block = Base & {
  // the whole card opens this page
  to?: string;
  title?: undefined;
};
type Titled = Base & {
  title: ReactNode;
  // chips, a date: the row over the title
  meta?: ReactNode;
  // the title opens a page (to) or something on this page (onOpen)
  to?: string;
  onOpen?: () => void;
  // the ✕, and what it does by name for a screen reader ("Delete “Bees”"); the page asks first, with Confirm
  onRemove?: () => void;
  removeLabel?: string;
};

export function Card(props: Block | Titled) {
  const { children, tone, wide = false, busy = false } = props;
  const look = (opens: boolean) =>
    cx("card", opens && "card-link", tone && `tone-${tone} card-tone`, wide && "card-wide", busy && "busy");
  // a block keeps one rhythm inside: its parts stacked 12 px apart
  if (props.title === undefined)
    return props.to ? (
      <Link to={props.to} className={cx(look(true), "card-stack")}>
        {children}
      </Link>
    ) : (
      <div className={cx(look(false), "card-stack")}>{children}</div>
    );
  const { title, meta, to, onOpen, onRemove, removeLabel = "Delete" } = props;
  return (
    <div className={cx(look(Boolean(to || onOpen)), "card-titled")}>
      {(meta || onRemove) && (
        <div className="card-meta">
          <div className="card-meta-main">{meta}</div>
          {onRemove && (
            <button
              type="button"
              className="card-remove"
              aria-label={removeLabel}
              title={removeLabel}
              onClick={onRemove}
            >
              ✕
            </button>
          )}
        </div>
      )}
      <h3 className="card-title">
        {to ? (
          <Link to={to} className="card-open">
            {title}
          </Link>
        ) : onOpen ? (
          <button type="button" className="card-open" onClick={onOpen}>
            {title}
          </button>
        ) : (
          title
        )}
      </h3>
      {children && <div className="card-body">{children}</div>}
    </div>
  );
}
