// A price over time, small: one stepped line (a price holds until the next reading), its last point a dot in the
// verdict's tone with a ring of the ground around it and its value beside it, the regular price as a dashed line and
// my target as a solid one, each named where it sits; the first and the last day under it. One series, so no legend:
// the heading over it names it. Hover, a touch or the arrow keys move a hairline along the readings, and a tip says
// the day and the price there; every value is also in the readings the page lists under it, so the tip never gates
// one. The look lives in styles.css (.price-line); the positions reach it as variables (--x, --y, in % of the plot).
import { type CSSProperties, type KeyboardEvent, type PointerEvent, useState } from "react";
import { cx } from "./cx.ts";
import type { Tone } from "./pills.tsx";

export type PricePoint = { at: string; value: number };

// a day as the axis says it: Nov 25
const dayOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const at = (x: number, y?: number) =>
  ({ "--x": x.toFixed(2), ...(y === undefined ? {} : { "--y": y.toFixed(2) }) }) as CSSProperties;

export function PriceLine({
  points,
  regular = null,
  target = null,
  format,
  tone,
  label,
  until,
}: {
  // the readings, oldest first
  points: PricePoint[];
  // the regular price, dashed; my target, solid
  regular?: number | null;
  target?: number | null;
  // a value as the page says it ($449)
  format: (n: number) => string;
  // the last point's dot: the verdict's tone
  tone?: Tone;
  // what it shows, read out: "The lowest price read, over 40 days"
  label: string;
  // the line runs on to this time (now), the last price holding
  until?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return null;
  const t0 = Date.parse(points[0].at);
  const t1 = Math.max(Date.parse(until ?? points[points.length - 1].at), Date.parse(points[points.length - 1].at));
  const values = [...points.map((p) => p.value), ...(regular ? [regular] : []), ...(target ? [target] : [])];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo || hi || 1) * 0.12;
  const [y0, y1] = [lo - pad, hi + pad];
  // x and y in % of the plot: time left to right, the price bottom to top
  const x = (t: number) => (t1 === t0 ? 100 : ((t - t0) / (t1 - t0)) * 100);
  const y = (v: number) => (1 - (v - y0) / (y1 - y0)) * 100;
  const xs = points.map((p) => x(Date.parse(p.at)));
  // the stepped path: each price runs flat to the next reading, then moves; the last runs on to the end
  let d = `M ${xs[0]} ${y(points[0].value)}`;
  for (let i = 1; i < points.length; i++) d += ` H ${xs[i]} V ${y(points[i].value)}`;
  d += " H 100";
  const last = points[points.length - 1];
  const low = Math.min(...points.map((p) => p.value));
  const shown = hover === null ? null : points[hover];
  const nearest = (fx: number) => xs.reduce((best, v, i) => (Math.abs(v - fx) < Math.abs(xs[best] - fx) ? i : best), 0);
  const onMove = (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(nearest(((e.clientX - r.left) / r.width) * 100));
  };
  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    const i = hover ?? points.length - 1;
    const next =
      e.key === "ArrowLeft"
        ? Math.max(0, i - 1)
        : e.key === "ArrowRight"
          ? Math.min(points.length - 1, i + 1)
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? points.length - 1
              : null;
    if (e.key === "Escape") setHover(null);
    if (next === null) return;
    e.preventDefault();
    setHover(next);
  };
  const summary = `${label}: from ${format(points[0].value)} on ${dayOf(points[0].at)} to ${format(last.value)} now; lowest ${format(low)}${regular ? `; regular ${format(regular)}` : ""}${target ? `; my target ${format(target)}` : ""}`;
  return (
    <div className="price-line">
      <figure
        className="price-line-plot"
        aria-label={summary}
        // the arrow keys walk the readings; the tip says each one
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the plot takes the keyboard so its readings can be walked
        tabIndex={0}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKey}
        onBlur={() => setHover(null)}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {regular !== null && <line className="price-line-regular" x1="0" x2="100" y1={y(regular)} y2={y(regular)} />}
          {target !== null && <line className="price-line-target" x1="0" x2="100" y1={y(target)} y2={y(target)} />}
          <path className="price-line-path" d={d} />
        </svg>
        {regular !== null && (
          <span className="price-line-ref" style={at(0, y(regular))}>
            Regular {format(regular)}
          </span>
        )}
        {target !== null && (
          // under its line when the regular price's name sits close above it
          <span
            className={cx(
              "price-line-ref price-line-ref-target",
              regular !== null && Math.abs(y(regular) - y(target)) < 16 && y(target) > y(regular) && "price-line-under",
            )}
            style={at(0, y(target))}
          >
            My target {format(target)}
          </span>
        )}
        <span className={cx("price-line-dot", tone && `tone-${tone}`)} style={at(100, y(last.value))} />
        {/* its value beside the last dot: above it, or under it when the dot sits near the top */}
        <span className={cx("price-line-now", y(last.value) < 22 && "price-line-under")} style={at(100, y(last.value))}>
          {format(last.value)}
        </span>
        {shown && hover !== null && (
          <>
            <span className="price-line-cross" style={at(xs[hover])} />
            <span className="price-line-dot price-line-dot-here" style={at(xs[hover], y(shown.value))} />
            <span className="price-line-tip" style={at(Math.min(88, Math.max(12, xs[hover])))} role="status">
              <b>{format(shown.value)}</b> {dayOf(shown.at)}
            </span>
          </>
        )}
      </figure>
      <div className="price-line-axis" aria-hidden="true">
        <span>{dayOf(points[0].at)}</span>
        <span>{until ? "Now" : dayOf(last.at)}</span>
      </div>
    </div>
  );
}
