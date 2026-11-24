// Home's live line: what needs me and what runs now, fed by the events stream, with a phone notification when
// something new lands in needs-me (if I allowed it on this device). Hidden when nothing is happening. One row of a
// list: each meaning keeps its one colour, as everywhere (needs me pink, with its edge; anything at work now green),
// the queue's count quiet at its end. The row opens Live, where each step shows.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useEvents } from "./events.ts";
import { cx } from "./ui/cx.ts";
import { List, Row } from "./ui/list.tsx";

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
  const applying = c.applying ?? 0;
  const queued = c.queued ?? 0;
  // one row of a list, as Home's apps are: what needs me first, in pink with its edge; else what works now, in green;
  // else the queue alone. What comes after the first is a quiet count at the row's end
  const rest = [
    needs > 0 && applying > 0 && `${applying} applying`,
    (needs > 0 || applying > 0) && queued > 0 && `${queued} queued`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className={cx("home-live", needs > 0 && "home-live-needs")}>
      <List label="Live">
        <Row
          to="/live"
          title={
            needs > 0 ? (
              <span className="text-pink">
                {needs} need{needs === 1 ? "s" : ""} me
              </span>
            ) : applying > 0 ? (
              <span className="inline-flex items-center gap-2 text-green">
                <span className="dot tone-green pulse" />
                {applying} applying now
              </span>
            ) : (
              <span className="text-muted">{queued} queued to apply</span>
            )
          }
          end={rest ? <span className="font-mono text-small text-muted">{rest}</span> : undefined}
        />
      </List>
    </div>
  );
}
