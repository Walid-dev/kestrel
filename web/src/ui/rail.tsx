// A page with a rail, News' layout for every page that has secondary things to keep beside its main column (the
// history, the sources, a form, the done ones): on a computer from 64rem the main column (52rem at most) and, on its
// right, a rail of 280 to 340, 32 apart; on a phone one column, the rail after the main one (railFirst: before it,
// for a page whose rail starts the work, such as a form). The rail's parts are headed by an eyebrow, never a section
// heading, with their count in mono: "Earlier days", "Your notes · 3". The look lives in styles.css (.with-rail).
import type { ReactNode } from "react";
import { cx } from "./cx.ts";

export function WithRail({
  rail,
  label,
  railFirst = false,
  children,
}: {
  // the rail's parts (RailPart)
  rail: ReactNode;
  // the rail's name, read out: "Earlier days and the sources"
  label: string;
  railFirst?: boolean;
  // the main column
  children: ReactNode;
}) {
  return (
    <div className={cx("with-rail", railFirst && "with-rail-first")}>
      <div className="rail-main">{children}</div>
      <aside className="rail" aria-label={label}>
        {rail}
      </aside>
    </div>
  );
}

export function RailPart({
  title,
  count,
  id,
  children,
}: {
  title: string;
  count?: number;
  // the heading's id, so the part is named by it
  id: string;
  children: ReactNode;
}) {
  return (
    <section className="rail-part" aria-labelledby={id}>
      <h2 id={id} className="eyebrow m-0">
        {title}
        {count !== undefined && <span className="rail-count"> · {count}</span>}
      </h2>
      {children}
    </section>
  );
}
