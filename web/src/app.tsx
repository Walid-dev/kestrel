// The frame every screen sits in, with no bar on top: each page starts at its own title. The places: the tab bar on a
// touch screen, the dock at the right edge under a mouse (styles.css chooses by the pointer, never by the width); the
// wolf is Home in both, their first item. What runs and what waits shows where the eye goes for it: the Live tab's
// badge on touch, the Live item's in the dock, and under a mouse a small pip in the bottom-right corner, only while
// something works, waits for me or the computer sleeps (never on Live itself, which it opens). When the computer
// doesn't answer, the asleep strip leads every page (the service worker then serves the last copies).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { useChatLink } from "./chats.tsx";
import { useEvents } from "./events.ts";
import { Mark } from "./mark.tsx";
import { APPS, type AppName, appTone } from "./ui/apps.tsx";
import { ConfirmProvider } from "./ui/confirm.tsx";
import { cx } from "./ui/cx.ts";

const LAST_SEEN = "kestrel-last-seen";

function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const res = await fetch("/api/health", { signal: AbortSignal.timeout(2500) });
      if (!res.ok) throw new Error(`health ${res.status}`);
      try {
        localStorage.setItem(LAST_SEEN, new Date().toISOString());
      } catch {
        // storage can be off; the strip then has no time to show
      }
      return (await res.json()) as { ok: boolean };
    },
    refetchInterval: 30_000,
    retry: 1,
  });
}

function asleepSince(): string {
  try {
    const iso = localStorage.getItem(LAST_SEEN);
    if (!iso) return "a while";
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "a while";
  }
}

// how much works right now and how much waits for me, from Live's own data
function useBusy() {
  const queryClient = useQueryClient();
  const live = useQuery({
    queryKey: ["live"],
    queryFn: async () => {
      const res = await fetch("/api/live");
      if (!res.ok) throw new Error(`${res.status}`);
      return (await res.json()) as { now: unknown[]; apps: { state: string }[] };
    },
    refetchInterval: 15_000,
  });
  useEvents((p) => {
    if (p.kind === "live" || p.kind === "apply") queryClient.invalidateQueries({ queryKey: ["live"] });
    // a news brief that starts or ends (the morning's own, Make it now on another device) shows at once, on Home's
    // card as on the page
    if (p.kind === "live")
      for (const key of ["news", "news-days", "news-sources"]) queryClient.invalidateQueries({ queryKey: [key] });
  });
  const d = live.data;
  return {
    working: d?.now.length ?? 0,
    waiting: d?.apps.filter((a) => a.state === "needs-me").length ?? 0,
  };
}

// The one status, by priority: the computer asleep, then what needs me, then what works; up is all well and shows
// nothing. One colour per meaning: asleep orange, needs me pink, at work green.
export type Status =
  | { kind: "up" }
  | { kind: "asleep" }
  | { kind: "needs"; n: number }
  | { kind: "working"; n: number };

function useStatus(): Status {
  const health = useHealth();
  const busy = useBusy();
  if (health.isError) return { kind: "asleep" };
  if (busy.waiting > 0) return { kind: "needs", n: busy.waiting };
  if (busy.working > 0) return { kind: "working", n: busy.working };
  return { kind: "up" };
}

export const words = (s: Status): string =>
  s.kind === "asleep"
    ? "asleep"
    : s.kind === "needs"
      ? `${s.n} need${s.n === 1 ? "s" : ""} me`
      : s.kind === "working"
        ? `live · ${s.n} working`
        : "up";
export const TONE = { asleep: "tone-orange", needs: "tone-pink", working: "tone-green", up: "" } as const;

// one Confirm for every page: any screen asks with useConfirm, the box itself lives here
export function App() {
  return (
    <ConfirmProvider>
      <Shell />
    </ConfirmProvider>
  );
}

// Live's badge, on its tab and its dock item: a dot when asleep or at work (pulsing), the count of what needs me
export function LiveBadge({ status }: { status: Status }) {
  if (status.kind === "up") return null;
  if (status.kind === "needs")
    return (
      <span aria-hidden="true" className="nav-badge nav-count tone-pink">
        {status.n > 9 ? "9+" : status.n}
      </span>
    );
  return (
    <span aria-hidden="true" className={cx("nav-badge", TONE[status.kind], status.kind === "working" && "pulse")} />
  );
}

// the status, read out after the place's name, since the badge is only seen (after "Live", at work needs no "live")
function StatusWords({ status }: { status: Status }) {
  if (status.kind === "up") return null;
  return <span className="sr-only">, {status.kind === "working" ? `${status.n} working` : words(status)}</span>;
}

// the pip's inside: the badge's mark (a dot, or the count of what needs me), then its words, which open to the left
export function PipBody({ status }: { status: Status }) {
  if (status.kind === "up") return null;
  return (
    <>
      <span aria-hidden="true" className="pip-mark">
        {status.kind === "needs" ? (
          <span className="pip-count tone-pink">{status.n > 9 ? "9+" : status.n}</span>
        ) : (
          <span className={cx("dot", TONE[status.kind], status.kind === "working" && "pulse")} />
        )}
      </span>
      <span className="pip-words">{words(status)}</span>
    </>
  );
}

// under a mouse, the status in the corner while it says something; Live itself shows it all, so not there
function Pip({ status }: { status: Status }) {
  const where = useLocation();
  if (status.kind === "up" || where.pathname === "/live") return null;
  return (
    <Link to="/live" className="pip" title="Open Live">
      <PipBody status={status} />
    </Link>
  );
}

function Shell() {
  const status = useStatus();
  return (
    <div className="shell">
      {status.kind === "asleep" && (
        <p className="asleep" role="status">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path d="M20.4 14.6A8.6 8.6 0 0 1 9.4 3.6a8.6 8.6 0 1 0 11 11Z" />
          </svg>
          <span>
            Computer asleep since {asleepSince()}. You are reading the last copies; nothing can be saved right now.
          </span>
        </p>
      )}
      <Outlet />
      <Dock status={status} />
      <Pip status={status} />
      {/* on a touch screen, the main places one tap away under the thumb: Home, the wolf, is always the first */}
      <nav className="tabbar" aria-label="The main places">
        {BAR.map((b) => (
          <NavLink key={b.to} to={b.to} end={b.to === "/"} className={cx("tabbar-item", b.tone)}>
            <span className="nav-icon">
              {b.icon}
              {b.to === "/live" && <LiveBadge status={status} />}
            </span>
            {b.label}
            {b.to === "/live" && <StatusWords status={status} />}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

// a place in the tab bar or the dock: an app from the map (its address, icon and colour: the open one's icon takes its
// colour), or Home, the wolf cropped to its own shape and centred, so it weighs what the line icons beside it weigh,
// pink as on Home's title
type Place = { to: string; label: string; icon: React.ReactNode; tone: string };
const HOME: Place = { to: "/", label: "Home", icon: <Mark size={22} fill="currentColor" tight />, tone: "tone-pink" };
const place = (app: AppName): Place => ({ to: APPS[app].to, label: app, icon: APPS[app].icon, tone: appTone(app) });

const BAR: Place[] = [HOME, ...(["Searches", "Chat", "Learn", "Live"] as const).map(place)];

// under a mouse or a trackpad, every app at the screen's right edge, the old pages' dock: the pointer at the edge
// slides it in, a click goes there, leaving lets it slide away. The wolf first, as Home; Live last, with its badge.
// Touch screens keep the tab bar.
const DOCK: Place[] = [
  HOME,
  ...(
    [
      "Searches",
      "Chat",
      "Learn",
      "Notes",
      "Tasks",
      "Research",
      "News",
      "Shopping",
      "Quiz",
      "Applications",
      "Writing",
      "Interview prep",
      "Live",
    ] as const
  ).map(place),
];

function Dock({ status }: { status: Status }) {
  const chat = useChatLink();
  const [shown, setShown] = useState(false);
  const leave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = () => {
    if (leave.current) clearTimeout(leave.current);
    setShown(true);
  };
  const hide = () => {
    if (leave.current) clearTimeout(leave.current);
    leave.current = setTimeout(() => setShown(false), 350);
  };
  useEffect(
    () => () => {
      if (leave.current) clearTimeout(leave.current);
    },
    [],
  );
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the edge only reveals the dock under the pointer; the keyboard reaches its links by Tab, and focus shows it
    <div className="dock-zone" onMouseEnter={show} onMouseLeave={hide}>
      <nav className={`dock ${shown ? "dock-shown" : ""}`} aria-label="Every app" onFocus={show} onBlur={hide}>
        {DOCK.map((d) =>
          d.to === "/chats" && chat.external ? (
            <a
              key={d.to}
              href={chat.href}
              target="_blank"
              rel="noopener noreferrer"
              className="dock-item"
              title={d.label}
              onClick={() => setShown(false)}
            >
              {d.icon}
              <span className="dock-label">{d.label}</span>
            </a>
          ) : (
            <NavLink
              key={d.to}
              to={d.to}
              end={d.to === "/"}
              className={cx("dock-item", d.tone)}
              onClick={() => setShown(false)}
              title={d.label}
            >
              <span className="nav-icon">
                {d.icon}
                {d.to === "/live" && <LiveBadge status={status} />}
              </span>
              <span className="dock-label">{d.label}</span>
              {d.to === "/live" && <StatusWords status={status} />}
            </NavLink>
          ),
        )}
      </nav>
    </div>
  );
}
