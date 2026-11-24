// Home's live line: what needs me and what runs now, fed by the events stream, with a phone notification when
// something new lands in needs-me (if I allowed it on this device). Hidden when nothing is happening. Each meaning
// keeps its one colour, as everywhere: needs me is pink, anything at work now is green. The line opens Live, where
// each step shows.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useEvents } from "./events.ts";
import { Card } from "./ui/card.tsx";

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
  const needs = c?.["needs-me"] ?? 0;
  if (!c || (needs === 0 && (c.applying ?? 0) === 0 && (c.queued ?? 0) === 0)) return null;
  return (
    <Card to="/live" tone={needs > 0 ? "pink" : undefined} wide>
      <div className="flex flex-wrap items-center gap-3">
        {needs > 0 && (
          <span className="font-cond font-bold text-pink">
            {needs} need{needs === 1 ? "s" : ""} me
          </span>
        )}
        {(c.applying ?? 0) > 0 && (
          <span className="font-mono flex items-center gap-2 text-label text-green">
            <span className="dot tone-green pulse" />
            {c.applying} applying now
          </span>
        )}
        {(c.queued ?? 0) > 0 && <span className="font-mono text-label text-muted">{c.queued} queued</span>}
        <span className="font-mono ml-auto text-label text-muted">open →</span>
      </div>
    </Card>
  );
}
