// The frame every screen sits in: the bar with the app's name and the health chip, and the asleep banner when the
// computer doesn't answer (the service worker then serves the last copies). The places: the bottom bar on a touch
// screen, the dock at the right edge under a mouse (styles.css chooses by the pointer, never by the width).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { useChatLink } from "./chats.tsx";
import { useEvents } from "./events.ts";
import { ICONS, STROKE } from "./home.tsx";
import { Mark } from "./mark.tsx";
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
        // storage can be off; the banner then has no time to show
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

// how much works right now: the header's dot glows while anything runs, and opens Live
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
  });
  const d = live.data;
  return {
    working: d?.now.length ?? 0,
    waiting: d?.apps.filter((a) => a.state === "needs-me").length ?? 0,
  };
}

// one Confirm for every page: any screen asks with useConfirm, the box itself lives here
export function App() {
  return (
    <ConfirmProvider>
      <Shell />
    </ConfirmProvider>
  );
}

// a dot on Live's icon while anything works (green, glowing) or waits for me (pink, the one colour of needs me)
function LiveBadge({ live }: { live: { working: number; waiting: number } }) {
  if (live.working === 0 && live.waiting === 0) return null;
  return (
    <span
      aria-hidden="true"
      className={cx("dot nav-badge", live.waiting ? "tone-pink" : "tone-green", live.working > 0 && "pulse")}
    />
  );
}

function Shell() {
  const health = useHealth();
  const busy = useBusy();
  const lit = busy.working > 0 || busy.waiting > 0;
  // one colour per meaning: asleep is a warning, waiting for me is pink, all well is green
  const tone = health.isError ? "tone-orange" : busy.waiting ? "tone-pink" : "tone-green";
  return (
    <div className="shell">
      <header className="shell-head">
        <Link to="/" className="head-home" aria-label="Home">
          <Mark size={26} />
          kestrel
        </Link>
        <Link to="/live" className="head-live" aria-label="Live: what runs now">
          <span className={cx("head-chip", lit && "head-chip-on")}>
            <span aria-hidden="true" className={cx("dot", tone, busy.working > 0 && !health.isError && "pulse")} />
            {health.isError
              ? "asleep"
              : busy.working
                ? `live · ${busy.working} working`
                : busy.waiting
                  ? `${busy.waiting} need${busy.waiting === 1 ? "s" : ""} me`
                  : "up"}
          </span>
        </Link>
      </header>
      {health.isError && (
        <p className="mb-4 rounded-xl border border-line bg-warn-soft px-4 py-3 text-detail text-ink">
          Computer asleep since {asleepSince()}. You are reading the last copies; nothing can be saved right now.
        </p>
      )}
      <Outlet />
      <Dock live={busy} />
      {/* on a touch screen, the main places one tap away under the thumb: Home is always the first */}
      <nav className="tabbar" aria-label="The main places">
        {BAR.map((b) => (
          <NavLink key={b.to} to={b.to} end={b.to === "/"} className="tabbar-item">
            <span className="relative">
              {b.icon}
              {b.to === "/live" && <LiveBadge live={busy} />}
            </span>
            {b.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

const BAR = [
  {
    to: "/",
    label: "Home",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...STROKE}>
        <path d="M4 11.5 12 5l8 6.5" />
        <path d="M6.5 10v9h11v-9" />
      </svg>
    ),
  },
  { to: "/searches", label: "Searches", icon: ICONS.Searches },
  { to: "/chats", label: "Chat", icon: ICONS.Chat },
  { to: "/learn", label: "Learn", icon: ICONS.Learn },
  {
    to: "/live",
    label: "Live",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...STROKE}>
        <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />
      </svg>
    ),
  },
];

// under a mouse or a trackpad, every app at the screen's right edge, the old pages' dock: the pointer at the edge
// slides it in, a click goes there, leaving lets it slide away. Touch screens keep the bottom bar.
const DOCK: { to: string; label: string; icon: React.ReactNode }[] = [
  { to: "/", label: "Home", icon: null },
  { to: "/searches", label: "Searches", icon: ICONS.Searches },
  { to: "/chats", label: "Chat", icon: ICONS.Chat },
  { to: "/learn", label: "Learn", icon: ICONS.Learn },
  { to: "/notes", label: "Notes", icon: ICONS.Notes },
  { to: "/tasks", label: "Tasks", icon: ICONS.Tasks },
  { to: "/research", label: "Research", icon: ICONS.Research },
  { to: "/quiz", label: "Quiz", icon: ICONS.Quiz },
  { to: "/applications", label: "Applications", icon: ICONS.Applications },
  { to: "/writing", label: "Writing", icon: ICONS.Writing },
  { to: "/interview", label: "Interview prep", icon: ICONS["Interview prep"] },
  { to: "/live", label: "Live", icon: null },
];

function Dock({ live }: { live: { working: number; waiting: number } }) {
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
              className="dock-item"
              onClick={() => setShown(false)}
              title={d.label}
            >
              <span className="relative grid place-items-center">
                {d.to === "/" ? BAR[0].icon : d.to === "/live" ? BAR[4].icon : d.icon}
                {d.to === "/live" && <LiveBadge live={live} />}
              </span>
              <span className="dock-label">{d.label}</span>
            </NavLink>
          ),
        )}
      </nav>
    </div>
  );
}
