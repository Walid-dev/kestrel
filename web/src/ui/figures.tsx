// A page's figures, one strip of cells before its detail (Home's morning, Learn's lessons, Cost's period,
// Applications' states): each cell its label as an eyebrow, a dot in its tone and the value in mono, a few quiet words
// beside the value (note) or lines under it (children); a cell with a place to go is a link to it. The cells sit
// behind hairlines in one card (the line shows through a 1 px gap): on a phone three across (two when the cells that
// share rows aren't a multiple of three; a wide cell takes a row of its own), one row from 48rem. tone colours the
// strip's left edge for what matters now (lessons to review); foot is a row under the cells for what reads them
// (Learn's bar and its one action); busy dims the strip while new figures come (another period). The look lives in
// styles.css (.figs).
import { Children, type CSSProperties, isValidElement, type ReactNode } from "react";
import { Link } from "react-router";
import { cx } from "./cx.ts";
import type { Tone } from "./pills.tsx";

export function Figures({
  label,
  tone,
  foot,
  busy = false,
  children,
}: {
  // the strip's name, read out
  label: string;
  tone?: Tone;
  foot?: ReactNode;
  busy?: boolean;
  children: ReactNode;
}) {
  const cells = Children.toArray(children).filter(Boolean);
  // the cells that share a phone's rows: a wide one has its own
  const shared = cells.filter((c) => !(isValidElement<{ wide?: boolean }>(c) && c.props.wide)).length;
  // how many across: every cell in one row from 48rem; on a phone three, or two when three would leave one alone
  const across = { "--figs": cells.length, "--figs-phone": shared % 3 === 0 ? 3 : 2 } as CSSProperties;
  return (
    <section
      className={cx("figs", tone && `figs-tone tone-${tone}`, busy && "busy")}
      style={across}
      aria-label={label}
      aria-busy={busy || undefined}
    >
      {children}
      {foot && <div className="figs-foot">{foot}</div>}
    </section>
  );
}

export function Figure({
  label,
  value,
  tone = "muted",
  note,
  hint,
  to,
  wide = false,
  quiet = false,
  pulse = false,
  children,
}: {
  label: string;
  value: ReactNode;
  // the dot's colour: the figure's meaning (review today cyan, needs me pink); grey when it has none
  tone?: Tone;
  // a few quiet words beside the value ("1 queued")
  note?: ReactNode;
  // what the figure counts, on hover
  hint?: string;
  // the page it opens
  to?: string;
  // across a phone's whole row (a figure whose lines need the room)
  wide?: boolean;
  // nothing to count: the value in muted ink
  quiet?: boolean;
  // at work now: the dot pulses
  pulse?: boolean;
  // lines under the value, quiet
  children?: ReactNode;
}) {
  const body = (
    <>
      <span className="eyebrow fig-label">{label}</span>
      <span className="fig-value">
        <span className={cx("dot", `tone-${tone}`, pulse && "pulse")} aria-hidden="true" />
        <span className={cx("fig-number", quiet ? "text-muted" : "text-strong")}>{value}</span>
        {note && <span className="fig-note">{note}</span>}
      </span>
      {children && <span className="fig-lines">{children}</span>}
    </>
  );
  const look = cx("fig", wide && "fig-wide");
  return to ? (
    <Link to={to} className={cx(look, "fig-link")} title={hint}>
      {body}
    </Link>
  ) : (
    <div className={look} title={hint}>
      {body}
    </div>
  );
}
