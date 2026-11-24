// Every page's frame and head, one way, and the top of every page: there is no bar above it. The head: the back link
// when the page has a parent, an eyebrow, the title in one case, the line under it, the page's own buttons (plain
// .btn, no size of their own). A top page's title is the title step; a child page's (it has a back link) a step down,
// so a counter or a file name never outweighs what is under it. A child page works like a phone's navigation bar:
// the back link on the left, its buttons on the right, the title under them; a top page has its buttons beside the
// title under a mouse, and in a row under the line on touch. The frame: one of two widths, wide for lists and grids,
// reading for text; both start at the shell's left edge, so a title never jumps between pages.
import type { ReactNode } from "react";
import { Link } from "react-router";
import { cx } from "./cx.ts";

export type HeadProps = {
  title: ReactNode;
  // a few words over the title: where the page sits (a part, a topic)
  eyebrow?: ReactNode;
  // one line under the title: what the page is for, or where things stand
  line?: ReactNode;
  // a short statement beside the head, as two short lines (Home's "One app, one computer, / local models."): set
  // past a thin rule, its first line level with the eyebrow and its last with the title, at every width. It needs an
  // eyebrow and takes the place of the line; each part stays one line, so keep both a few words
  aside?: [ReactNode, ReactNode];
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

export function PageHead({
  title,
  eyebrow,
  line,
  aside,
  actions,
  back,
  sticky = false,
  titleAs: Title = "h1",
}: HeadProps) {
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
                width="16"
                height="16"
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
      <header className={cx("page-head", aside && "page-head-aside")}>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        {/* read in this order (title, line, buttons), as a phone shows it; a wider screen moves the buttons up beside
            the title (styles.css) */}
        <div className="page-title-row">
          <Title className={cx("page-title", back && "page-title-child")}>{title}</Title>
          {line && <p className="page-line">{line}</p>}
          {actions && !bar && <div className="page-actions">{actions}</div>}
        </div>
        {aside && (
          <p className="page-aside">
            <span>{aside[0]}</span> <span>{aside[1]}</span>
          </p>
        )}
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
