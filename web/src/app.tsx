// The frame every screen sits in: the bar with the app's name and the health chip, and the asleep banner when the
// computer doesn't answer (the service worker then serves the last copies).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { useChatLink } from "./chats.tsx";
import { useEvents } from "./events.ts";
import { APP_COLOR, ICONS, STROKE } from "./home.tsx";
import { Mark } from "./mark.tsx";

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

export function App() {
  const health = useHealth();
  const busy = useBusy();
  return (
    <div className="mx-auto min-h-dvh w-full max-w-xl px-4 pb-28 md:max-w-4xl md:px-6 md:pb-16 lg:max-w-[1440px] lg:px-10 2xl:max-w-[1760px]">
      <header className="flex items-center gap-2.5 py-5">
        <Link to="/" className="flex items-center gap-2.5" aria-label="Home">
          <Mark size={26} />
          <h1 className="font-cond text-2xl font-bold tracking-tight">kestrel</h1>
        </Link>
        <Link
          to="/live"
          className="font-mono ml-auto flex items-center gap-2 rounded-full px-2.5 py-1 text-xs"
          style={{
            color: busy.working || busy.waiting ? "var(--strong)" : "var(--muted)",
            background: busy.working || busy.waiting ? "var(--surface)" : undefined,
            border: busy.working || busy.waiting ? "1px solid var(--line)" : "1px solid transparent",
          }}
          aria-label="Live: what runs now"
        >
          <span
            aria-hidden="true"
            className={`block h-2.5 w-2.5 rounded-full ${busy.working && !health.isError ? "pulse" : ""}`}
            style={{ background: health.isError ? "var(--warn)" : busy.waiting ? "var(--pink)" : "var(--ok)" }}
          />
          {health.isError
            ? "asleep"
            : busy.working
              ? `live · ${busy.working} working`
              : busy.waiting
                ? `${busy.waiting} need${busy.waiting === 1 ? "s" : ""} me`
                : "up"}
        </Link>
      </header>
      {health.isError && (
        <p
          className="mb-4 rounded-xl border px-4 py-3 text-sm"
          style={{ borderColor: "var(--line)", background: "var(--warn-soft)", color: "var(--text)" }}
        >
          Computer asleep since {asleepSince()}. You are reading the last copies; nothing can be saved right now.
        </p>
      )}
      <Outlet />
      <Dock live={busy} />
      {/* on a phone, the main places one tap away under the thumb: Home is always the first */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t px-1 pt-1.5 md:hidden"
        style={{
          background: "color-mix(in srgb, var(--bg) 92%, transparent)",
          backdropFilter: "blur(10px)",
          borderColor: "var(--line)",
          paddingBottom: "max(8px, env(safe-area-inset-bottom))",
        }}
        aria-label="The main places"
      >
        {BAR.map((b) => (
          <NavLink
            key={b.to}
            to={b.to}
            end={b.to === "/"}
            className="flex min-w-14 flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[10.5px]"
            style={({ isActive }) => ({ color: isActive ? "var(--accent)" : "var(--muted)" })}
          >
            <span className="relative">
              {b.icon}
              {b.to === "/live" && (busy.working > 0 || busy.waiting > 0) && (
                <span
                  className={`absolute -top-0.5 -right-1 block h-2 w-2 rounded-full ${busy.working ? "pulse" : ""}`}
                  style={{ background: busy.waiting ? "var(--pink)" : "var(--green)" }}
                />
              )}
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

// on a computer, every app at the screen's right edge, the old pages' dock: the pointer at the edge slides it in, a
// click goes there, leaving lets it slide away. Each app sits on a tile of its own colour (Home's). Phones keep the
// bottom bar.
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
              style={{ "--app": APP_COLOR[d.label] } as React.CSSProperties}
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
              style={{ "--app": APP_COLOR[d.label] } as React.CSSProperties}
            >
              <span className="relative grid place-items-center">
                {d.to === "/" ? BAR[0].icon : d.to === "/live" ? BAR[4].icon : d.icon}
                {d.to === "/live" && (live.working > 0 || live.waiting > 0) && (
                  <span
                    className={`absolute -top-0.5 -right-1 block h-2 w-2 rounded-full ${live.working ? "pulse" : ""}`}
                    style={{ background: live.waiting ? "var(--pink)" : "var(--green)" }}
                  />
                )}
              </span>
              <span className="dock-label">{d.label}</span>
            </NavLink>
          ),
        )}
      </nav>
    </div>
  );
}
