// A card: the .card ground (a surface, a hairline, room inside), in three uses. Plain: a block of the page. A link:
// the whole card opens a page. With a title, the Searches card's anatomy: its top line (the meta on the left, a chip
// first; the date or the source at its right end, the ★ after it; the ✕ last), the title in the heading voice with its
// key number beside it, what it holds under it, muted, then its actions. The title opens it (a page, or something on
// this page) and stretches over the whole card, and the ✕ deletes it, the page asking first with Confirm. A tone marks
// its edge for what matters now (needs me, review today).
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
  // the top line's left: a chip first (the state, the kind), then a muted group
  meta?: ReactNode;
  // the top line's right end: when (in mono) or where from, small and muted
  end?: ReactNode;
  // the ★ (Star bare) at the very end of the top line, where Searches' and News' cards keep theirs
  star?: ReactNode;
  // the key number beside the title (a .money pill, a ring), at the title row's right
  figure?: ReactNode;
  // the card's buttons, last (.btn-sm, .btn-quiet; a plain .btn for the one that matters)
  actions?: ReactNode;
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
  const { title, meta, end, star, figure, actions, to, onOpen, onRemove, removeLabel = "Delete" } = props;
  const heading = (
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
  );
  return (
    <div className={cx(look(Boolean(to || onOpen)), "card-titled")}>
      {(meta || end || star || onRemove) && (
        <div className="card-meta">
          <div className="card-meta-main">{meta}</div>
          {end && <span className="card-end">{end}</span>}
          {star}
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
      {figure ? (
        <div className="card-head">
          {heading}
          {figure}
        </div>
      ) : (
        heading
      )}
      {children && <div className="card-body">{children}</div>}
      {actions && <div className="card-actions">{actions}</div>}
    </div>
  );
}
