// Every page's frame and head, one way. The head: the back link when the page has a parent, an eyebrow, the title in
// one size and one case, the line under it, the page's own buttons. The frame: one of two widths, wide for lists and
// grids, reading for text; both start at the shell's left edge, under the name kestrel, so a title never jumps
// between pages. A page with a parent works like a phone's navigation bar: the back link on the left, its buttons on
// the right, the title below; a top page has its buttons beside the title. Its buttons take the head's size up from
// the others (styles.css, .page-actions .btn), so a page never sets it.
import type { ReactNode } from "react";
import { Link } from "react-router";
import { cx } from "./cx.ts";

export type HeadProps = {
  title: ReactNode;
  // a few words over the title: where the page sits (a part, a topic)
  eyebrow?: ReactNode;
  // one line under the title: what the page is for, or where things stand
  line?: ReactNode;
  // the page's own buttons
  actions?: ReactNode;
  // the page above this one, by name: "Learn", a pack
  back?: { to: string; label: string };
  // the bar stays on top while the page scrolls, its buttons in reach (a lesson's Listen)
  sticky?: boolean;
  // the title's element: the page's one h1 unless the head is an example inside a page (/design shows two), which
  // keeps the look and leaves the page a single h1
  titleAs?: "h1" | "div";
};

export function PageHead({ title, eyebrow, line, actions, back, sticky = false, titleAs: Title = "h1" }: HeadProps) {
  const bar = Boolean(back) || sticky;
  return (
    <>
      {/* the bar sits beside the head, not in it: a sticky bar stays on top only as far as its parent goes, and the
          page is the parent that lasts */}
      {bar && (
        <div className={cx("page-bar", sticky && "page-bar-sticky")}>
          {back && (
            <Link to={back.to} className="page-back">
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M14.5 5.5 8 12l6.5 6.5" />
              </svg>
              <span>{back.label}</span>
            </Link>
          )}
          {actions && <div className="page-tools">{actions}</div>}
        </div>
      )}
      <header className="page-head">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        {/* read in this order (title, line, buttons), as a phone shows it; a wider screen moves the buttons up beside
            the title (styles.css) */}
        <div className="page-title-row">
          <Title className="page-title">{title}</Title>
          {line && <p className="page-line">{line}</p>}
          {actions && !bar && <div className="page-actions">{actions}</div>}
        </div>
      </header>
    </>
  );
}

// the page itself: its head first (above any side column on a phone), then what it holds, one gap apart
export function Page({
  width = "wide",
  children,
  ...head
}: HeadProps & { width?: "wide" | "reading"; children?: ReactNode }) {
  return (
    <main className={cx("page", width === "reading" && "page-reading")}>
      <PageHead {...head} />
      {children}
    </main>
  );
}
