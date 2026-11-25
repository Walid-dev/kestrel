// Each app's own colour and icon, set once and read everywhere: Home's rows, the tab bar and the dock (the open app's
// icon in its colour), a page's eyebrow (PageHead's app) and the Models page's groups. No two apps share a colour;
// Searches is green (my pick), Cost and Models share the models' yellow, and Live has none: its colours are the
// status's. A colour is a tone, so it follows the theme. An icon is a mark, drawn in the tone itself (a mark needs
// 3:1, which every tone has); a word in an app's colour (an eyebrow) takes the text-safe shade (styles.css).
import type { ReactNode } from "react";
import { cx } from "./cx.ts";
import type { Tone } from "./pills.tsx";

// the line icons' pen: 24 grid, 1.7 stroke, round ends
export const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const icon = (paths: ReactNode) => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...STROKE}>
    {paths}
  </svg>
);

export type AppName =
  | "Searches"
  | "Chat"
  | "Learn"
  | "Notes"
  | "Tasks"
  | "News"
  | "Research"
  | "Quiz"
  | "Applications"
  | "Writing"
  | "Interview prep"
  | "Cost"
  | "Models"
  | "Live";

export const APPS: Record<AppName, { tone?: Tone; to: string; icon: ReactNode }> = {
  Searches: {
    tone: "great",
    to: "/searches",
    icon: icon(
      <>
        <circle cx="10.5" cy="10.5" r="6" />
        <path d="m15.2 15.2 5.3 5.3" />
      </>,
    ),
  },
  Chat: {
    tone: "cyan",
    to: "/chats",
    icon: icon(<path d="M4.5 5.5h15v10h-9L6 19v-3.5H4.5z" />),
  },
  Learn: {
    tone: "purple",
    to: "/learn",
    icon: icon(
      <>
        <path d="M12 6c-1.8-1.6-4.4-2-8-2v14.5c3.6 0 6.2.4 8 2 1.8-1.6 4.4-2 8-2V4c-3.6 0-6.2.4-8 2z" />
        <path d="M12 6v14.5" />
      </>,
    ),
  },
  Notes: {
    tone: "accent",
    to: "/notes",
    icon: icon(
      <>
        <path d="M6 3.5h8.5L19 8v12.5H6z" />
        <path d="M14.5 3.5V8H19" />
        <path d="M9 12.5h7M9 16h5" />
      </>,
    ),
  },
  Tasks: {
    tone: "pink",
    to: "/tasks",
    icon: icon(
      <>
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <path d="m8.5 12.5 2.5 2.5 4.5-5" />
      </>,
    ),
  },
  // a newspaper, drawn by hand on the icons' grid
  News: {
    tone: "indigo",
    to: "/news",
    icon: icon(
      <>
        <path d="M4.5 5.5h11V18a1.5 1.5 0 0 0 1.5 1.5H6A1.5 1.5 0 0 1 4.5 18z" />
        <path d="M15.5 9h3v9a1.5 1.5 0 0 1-3 0" />
        <path d="M7.5 9h5M7.5 12.5h5M7.5 16h3" />
      </>,
    ),
  },
  Research: {
    tone: "yellow",
    to: "/research",
    icon: icon(
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.1-3.6-8.5s1.2-6.2 3.6-8.5z" />
      </>,
    ),
  },
  Quiz: {
    tone: "teal",
    to: "/quiz",
    icon: icon(
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6" />
        <path d="M12 16.6v.1" />
      </>,
    ),
  },
  Applications: {
    tone: "orange",
    to: "/applications",
    icon: icon(
      <>
        <path d="m12 3 9 5-9 5-9-5z" />
        <path d="m4.5 12.8 7.5 4.2 7.5-4.2" />
        <path d="m4.5 16.8 7.5 4.2 7.5-4.2" />
      </>,
    ),
  },
  Writing: {
    tone: "magenta",
    to: "/writing",
    icon: icon(
      <>
        <path d="M4 20h4L19 9l-4-4L4 16z" />
        <path d="m13.5 6.5 4 4" />
      </>,
    ),
  },
  "Interview prep": {
    tone: "good",
    to: "/interview",
    icon: icon(
      <>
        <path d="M5 5.5h14v9.5H9.5L5 19z" />
        <path d="M9 9.5h6M9 12h4" />
      </>,
    ),
  },
  Cost: {
    tone: "yellow",
    to: "/cost",
    icon: icon(
      <>
        <circle cx="9" cy="9" r="5.5" />
        <path d="M14.5 9.6a5.5 5.5 0 1 1-4.9 4.9" />
      </>,
    ),
  },
  Models: {
    tone: "yellow",
    to: "/models",
    icon: icon(
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5v4.5l3 2" />
      </>,
    ),
  },
  Live: {
    to: "/live",
    icon: icon(<path d="M3 12h4l2.5-6 4 12 2.5-6H21" />),
  },
};

// an app's colour as a class (tone-purple), or nothing for an app without one (Live)
export const appTone = (app: AppName): string => {
  const tone = APPS[app].tone;
  return tone ? `tone-${tone}` : "";
};

// an app's icon in its colour: a row's icon on Home, an example on /design
export function AppIcon({ app }: { app: AppName }) {
  return <span className={cx("app-mark", appTone(app))}>{APPS[app].icon}</span>;
}
