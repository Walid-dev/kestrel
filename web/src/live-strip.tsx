// Home's live line: what needs me and what runs now, fed by the events stream, with a phone notification when
// something new lands in needs-me (if I allowed it on this device). Hidden when nothing is happening.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { Link } from "react-router";
import { useEvents } from "./events.ts";

export function LiveStrip() {
  const queryClient = useQueryClient();
  const lastNeedsMe = useRef(0);
  const counts = useQuery({
    queryKey: ["apply-counts"],
    queryFn: async () => ((await (await fetch("/api/apply")).json()) as { counts: Record<string, number> }).counts,
  });
  useEvents((p) => {
    if (p.kind !== "apply" || !p.counts) return;
    queryClient.setQueryData(["apply-counts"], p.counts);
    const needs = p.counts["needs-me"] ?? 0;
    if (needs > lastNeedsMe.current && typeof Notification !== "undefined" && Notification.permission === "granted")
      new Notification("kestrel", { body: "an application needs you" });
    lastNeedsMe.current = needs;
  });
  const c = counts.data;
  if (!c || ((c["needs-me"] ?? 0) === 0 && (c.applying ?? 0) === 0 && (c.queued ?? 0) === 0)) return null;
  return (
    <Link
      to="/applications"
      className="card flex flex-wrap items-center gap-3 md:col-span-2"
      style={(c["needs-me"] ?? 0) > 0 ? { borderColor: "var(--warn)" } : undefined}
    >
      {(c["needs-me"] ?? 0) > 0 && (
        <span className="font-cond font-bold" style={{ color: "var(--warn)" }}>
          {c["needs-me"]} need{c["needs-me"] === 1 ? "s" : ""} me
        </span>
      )}
      {(c.applying ?? 0) > 0 && (
        <span className="font-mono flex items-center gap-2 text-xs" style={{ color: "var(--accent)" }}>
          <span className="block h-2 w-2 animate-pulse rounded-full" style={{ background: "var(--accent)" }} />
          {c.applying} applying now
        </span>
      )}
      {(c.queued ?? 0) > 0 && (
        <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
          {c.queued} queued
        </span>
      )}
      <span className="font-mono ml-auto text-[11px]" style={{ color: "var(--muted)" }}>
        open →
      </span>
    </Link>
  );
}
