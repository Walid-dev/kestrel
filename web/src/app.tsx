// The frame every screen sits in: the bar with the app's name and the health chip, and the asleep banner when the
// computer doesn't answer (the service worker then serves the last copies).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet } from "react-router";
import { useEvents } from "./events.ts";
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
    <div className="mx-auto min-h-dvh w-full max-w-xl px-5 pb-16 md:max-w-3xl lg:max-w-6xl lg:px-8">
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
    </div>
  );
}
