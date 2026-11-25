// A page with a rail, News' layout for every page that has secondary things to keep beside its main column (the
// history, the sources, a form, the done ones): on a computer from 64rem the main column (52rem at most) and, on its
// right, a rail of 280 to 340, 32 apart; on a phone one column, the rail after the main one. railFirst, for a page
// whose rail starts the work (a form): the rail is first in the page, so it comes first on a phone and first for the
// keyboard and a screen reader, and it still sits on the right on a computer. The rail's parts are headed by an
// eyebrow, never a section heading, with their count in mono: "Earlier days", "Your notes · 3". className: the page's
// own rules on top (a rail that stays in view while a long main column scrolls). The look lives in styles.css
// (.with-rail).
import type { ReactNode, Ref } from "react";
import { cx } from "./cx.ts";

export function WithRail({
  rail,
  label,
  railFirst = false,
  className,
  children,
}: {
  // the rail's parts (RailPart)
  rail: ReactNode;
  // the rail's name, read out: "Earlier days and the sources"
  label: string;
  railFirst?: boolean;
  className?: string;
  // the main column
  children: ReactNode;
}) {
  const main = <div className="rail-main">{children}</div>;
  const side = (
    <aside className="rail" aria-label={label}>
      {rail}
    </aside>
  );
  return (
    <div className={cx("with-rail", railFirst && "with-rail-first", className)}>
      {railFirst ? side : main}
      {railFirst ? main : side}
    </div>
  );
}

export function RailPart({
  title,
  count,
  id,
  headRef,
  children,
}: {
  title: string;
  count?: number;
  // the heading's id, so the part is named by it
  id: string;
  // the heading takes the focus when what had it goes (a deleted note's card, its ✕ with it): it can be focused
  headRef?: Ref<HTMLHeadingElement>;
  children: ReactNode;
}) {
  return (
    <section className="rail-part" aria-labelledby={id}>
      <h2 id={id} ref={headRef} tabIndex={headRef ? -1 : undefined} className="eyebrow m-0">
        {title}
        {count !== undefined && <span className="rail-count"> · {count}</span>}
      </h2>
      {children}
    </section>
  );
}
