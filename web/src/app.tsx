// The frame every screen sits in: the bar with the app's name and the health chip, and the asleep banner when the
// computer doesn't answer (the service worker then serves the last copies).
import { useQuery } from "@tanstack/react-query";
import { Outlet } from "react-router";

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

export function App() {
  const health = useHealth();
  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl px-4 pb-16">
      <header className="flex items-center gap-3 py-4">
        <span
          aria-hidden="true"
          className="grid h-9 w-9 place-items-center rounded-xl border"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        >
          <span className="block h-3.5 w-3.5 rounded-full border-4" style={{ borderColor: "var(--accent)" }} />
        </span>
        <h1 className="font-cond text-2xl font-bold tracking-tight">kestrel</h1>
        <span
          className="font-mono ml-auto rounded-full border px-3 py-1 text-xs"
          style={{
            borderColor: "var(--line)",
            background: "var(--surface)",
            color: health.isError ? "var(--warn)" : "var(--ok)",
          }}
        >
          {health.isError ? "asleep" : "up"}
        </span>
      </header>
      {health.isError && (
        <p
          className="mb-4 rounded-lg border border-dashed px-4 py-3 text-sm"
          style={{ borderColor: "var(--warn)", background: "var(--warn-soft)" }}
        >
          Computer asleep since {asleepSince()}. You are reading the last copies; nothing can be saved right now.
        </p>
      )}
      <Outlet />
    </div>
  );
}
