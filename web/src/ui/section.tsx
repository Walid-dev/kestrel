// A section's heading, one way on every page: its words on the section step in the condensed face, how many it holds
// beside them in small muted mono (All days' months), a dot in the section's tone before the words when the colour
// means something (News' sections, a lesson's state), and a quiet hint under it when the section needs one line of
// why. A rail's part is headed by an eyebrow instead (RailPart, web/src/ui/rail.tsx).
import type { ReactNode } from "react";
import type { Tone } from "./pills.tsx";

export function SectionHead({
  title,
  count,
  tone,
  hint,
  id,
  as: H = "h2",
}: {
  title: ReactNode;
  count?: number | string;
  tone?: Tone;
  hint?: ReactNode;
  // for the section's aria-labelledby
  id?: string;
  as?: "h2" | "h3";
}) {
  const head = (
    <H id={id} className="section-head font-cond text-section">
      {tone && <span className={`dot tone-${tone}`} aria-hidden="true" />}
      <span className="min-w-0">{title}</span>
      {count !== undefined && <span className="section-count">{count}</span>}
    </H>
  );
  if (!hint) return head;
  return (
    <div className="section-head-hinted">
      {head}
      <p className="section-hint">{hint}</p>
    </div>
  );
}
