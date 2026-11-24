// Cost, the old setup's: everything this computer's models did since oMLX started counting — tokens, requests, compute
// — what the same use would have cost in the cloud at my reference prices, and what it cost in electricity; then the
// tokens of each of the last 30 days, a period with each model apart, and the prices with where they were seen.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";
import { cx } from "./ui/cx.ts";
import { EmptyState } from "./ui/empty.tsx";
import { Page } from "./ui/page.tsx";
import { Seg } from "./ui/seg.tsx";

type Cloud = { id: string; name: string; usd: number | null; unpriced: string[] };
type Figures = {
  requests: number;
  fresh: number;
  reused: number;
  out: number;
  computeHours: number;
  cloud: Cloud[];
  electricity: { kwh: number; cost: number; currency: string } | null;
};
type Model = Omit<Figures, "cloud"> & { model: string; cloud: { id: string; usd: number | null; as: string | null }[] };
type Report = {
  at: string;
  since: string | null;
  total: Figures;
  days: string;
  period: Figures;
  models: Model[];
  daily: { day: string; tokens: number }[];
  prices: {
    about?: string;
    cloud: {
      id: string;
      name: string;
      prices: {
        match?: string;
        model: string;
        input: number;
        cachedInput: number;
        output: number;
        source: string;
        seen: string;
        note?: string;
      }[];
    }[];
    electricity: {
      watts: number;
      wattsSource: string;
      pricePerKwh: number;
      currency: string;
      source: string;
      seen: string;
    };
  } | null;
  pricesError: string | null;
};

const n = (v: number) => Math.round(v).toLocaleString();
const short = (v: number) =>
  v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(Math.round(v));
const usd = (v: number | null) => (v == null ? "no reference price" : `US$${v.toFixed(2)}`);
const PERIODS = [
  { value: "1", label: "Today" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "all", label: "All" },
];
// the server answers 503 when oMLX's table isn't there to read: a set-up step, not a failure. It also answers 503
// when the table is there but locked for a moment; with figures on screen that is only a missed refresh
class NotReady extends Error {}

// one series, so no legend: the title names it. Thin bars from the baseline, 2px apart, the top day labelled, a
// tooltip on each bar, and the same numbers as a table below. The drawing is as wide as its frame, one unit a pixel,
// so its labels keep the label step's size on a phone instead of shrinking with the picture
function Days({ daily }: { daily: Report["daily"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const fit = () => setW(Math.max(300, Math.round(el.clientWidth)));
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  // the whole drawing is about a quarter as tall as it is wide, as main's scaled picture was, so the labels' real size
  // makes no page taller: 18 above the bars for the top day's figure, 18 under the baseline for the dates
  const BAND = 18;
  const H = Math.round(Math.min(192, Math.max(72, W * 0.24))) - BAND;
  const top = Math.max(1, ...daily.map((d) => d.tokens));
  const slot = W / daily.length;
  const bar = Math.max(4, slot - 2);
  const peak = daily.findIndex((d) => d.tokens === top);
  const label = (day: string) =>
    new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return (
    <div ref={frame} className="relative">
      <svg
        viewBox={`0 0 ${W} ${H + BAND}`}
        className="block h-auto w-full"
        role="img"
        aria-label="Tokens a day, the last 30 days"
      >
        <line x1="0" x2={W} y1={H} y2={H} className="stroke-line" />
        {daily.map((d, i) => {
          const h = d.tokens > 0 ? Math.max(2, (d.tokens / top) * (H - BAND)) : 0;
          const x = i * slot + (slot - bar) / 2;
          return (
            <g key={d.day} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
              {/* the hit target is the whole column, wider and taller than the bar */}
              <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${H} V${H - h + 4} a4,4 0 0 1 4,-4 h${bar - 8} a4,4 0 0 1 4,4 V${H} Z`}
                  className={cx("fill-(--chart-bar)", hover !== null && hover !== i && "opacity-55")}
                />
              )}
              {i === peak && d.tokens > 0 && (
                <text x={x + bar / 2} y={H - h - 6} textAnchor="middle" className="fill-strong font-mono text-label">
                  {short(d.tokens)}
                </text>
              )}
              {(i % 7 === 0 && i < daily.length - 4) || i === daily.length - 1 ? (
                <text
                  x={i === 0 ? 0 : i === daily.length - 1 ? W : x + bar / 2}
                  y={H + 14}
                  textAnchor={i === 0 ? "start" : i === daily.length - 1 ? "end" : "middle"}
                  className="fill-muted font-mono text-label"
                >
                  {label(d.day)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {hover !== null && daily[hover] && (
        <div
          className="pointer-events-none absolute top-0 left-(--x) rounded-md border border-line bg-surface-2 px-2 py-1 text-small text-ink"
          // where the pointer is: data, so it reaches the class as a variable
          style={{ "--x": `${Math.min(80, Math.max(0, ((hover + 0.5) / daily.length) * 100 - 10))}%` } as CSSProperties}
        >
          <b className="text-strong">{label(daily[hover].day)}</b> · {n(daily[hover].tokens)} tokens
        </div>
      )}
    </div>
  );
}

export function Cost() {
  const [days, setDays] = useState("30");
  const report = useQuery({
    queryKey: ["cost", days],
    queryFn: async () => {
      const res = await fetch(`/api/cost?days=${days}`);
      const data = (await res.json().catch(() => ({}))) as Report & { error?: string };
      if (res.status === 503) throw new NotReady(data.error ?? "oMLX's figures aren't there yet");
      if (!res.ok) throw new Error(data.error ?? `${res.status}`);
      return data;
    },
    // a set-up step won't come right in a second: say so at once instead of trying three times first
    retry: (count, e) => !(e instanceof NotReady) && count < 2,
    refetchInterval: 12_000, // the count rolls on while a model works
    // a new period keeps the figures and the pills on screen while it loads, so nothing jumps or loses focus
    placeholderData: keepPreviousData,
  });
  const r = report.data;
  const t = r?.total;
  const tokens = t ? t.fresh + t.reused + t.out : 0;
  const daysCounted = r?.since ? Math.max(1, Math.round((Date.parse(r.at) - Date.parse(r.since)) / 86_400_000)) : 0;

  const since = r?.since
    ? new Date(r.since).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : "";
  return (
    <Page
      width="reading"
      title="Cost"
      line={
        r
          ? `Since ${since || "—"} · updated ${new Date(r.at).toLocaleTimeString()}`
          : "What this computer's models did."
      }
    >
      {report.isError && !r ? (
        report.error instanceof NotReady ? (
          <NotSetUp reason={report.error.message} />
        ) : (
          <p className="m-0 text-detail text-red">{String((report.error as Error).message)}</p>
        )
      ) : !r || !t ? (
        // the page's shape while the figures come, so nothing jumps when they land
        <div className="grid gap-4" aria-busy="true">
          <div className="skeleton h-72 rounded-xl" />
          <div className="skeleton h-56 rounded-xl" />
        </div>
      ) : (
        <>
          {report.isError && (
            // the figures stay; the next refresh, 12 seconds on, tries again
            <p className="m-0 text-detail text-muted" role="status">
              The last refresh didn't come through ({(report.error as Error).message}). The next one tries again in a
              few seconds.
            </p>
          )}
          <Counted
            r={r}
            t={t}
            tokens={tokens}
            daysCounted={daysCounted}
            days={days}
            setDays={setDays}
            loading={report.isPlaceholderData}
          />
        </>
      )}
    </Page>
  );
}

// oMLX isn't counting for kestrel yet: what is missing in plain words, the setting it needs small under it. A table
// that is there but can't be read is not a set-up step, so its title says so
function NotSetUp({ reason }: { reason: string }) {
  const setting = reason.match(/\s*\((settings\.json: \w+)\)\s*$/);
  return (
    <EmptyState
      title={reason.includes("can't be read") ? "oMLX's figures can't be read right now." : "Cost isn't set up yet."}
      line={`${setting ? reason.slice(0, setting.index) : reason}.`}
      detail={setting?.[1]}
    />
  );
}

function Counted({
  r,
  t,
  tokens,
  daysCounted,
  days,
  setDays,
  loading,
}: {
  r: Report;
  t: Figures;
  tokens: number;
  daysCounted: number;
  days: string;
  setDays: (d: string) => void;
  loading: boolean;
}) {
  return (
    <>
      <section className="card grid gap-4">
        <p className="m-0 flex flex-wrap items-baseline gap-x-3">
          <span className="font-mono text-lead font-medium text-strong tabular-nums">{n(tokens)}</span>
          <span className="text-body text-muted">tokens</span>
        </p>
        <p className="m-0 text-detail text-muted">{daysCounted} days of this computer's models, counted by oMLX</p>
        <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-line md:grid-cols-5">
          {[
            ["Requests", n(t.requests)],
            ["Fresh in", n(t.fresh)],
            ["Reused in", n(t.reused)],
            ["Out", n(t.out)],
            ["Compute", `${t.computeHours.toFixed(1)} h`],
          ].map(([k, v]) => (
            <div key={k} className="grid gap-1 bg-surface-2 px-3 py-2.5 outline outline-line">
              <span className="text-small text-muted">{k}</span>
              <span className="font-mono text-body font-medium text-strong tabular-nums">{v}</span>
            </div>
          ))}
        </div>
        <p className="m-0 text-small text-muted">
          In: what the models read, fresh or reused from oMLX's cache. Out: what they wrote. Compute: the time they
          worked.
        </p>
        <div className="grid">
          <span className="eyebrow pb-2">The same use in the cloud</span>
          {r.pricesError && <p className="m-0 text-detail text-warn">{r.pricesError}</p>}
          {t.cloud.map((c) => (
            <div key={c.id} className="flex items-baseline gap-3 border-t border-line py-2.5">
              <span className="text-body">{c.name}</span>
              {/* a price is a number, in mono; its absence is words, quiet */}
              <span
                className={cx(
                  "ml-auto",
                  c.usd == null ? "text-detail text-muted" : "font-mono text-body font-medium text-strong tabular-nums",
                )}
              >
                {usd(c.usd)}
              </span>
            </div>
          ))}
          {t.electricity && (
            <p className="m-0 border-t border-line pt-3 text-body">
              Electricity on this computer:{" "}
              <span className="font-mono font-medium text-strong tabular-nums">
                {t.electricity.currency === "CAD" ? "CA$" : `${t.electricity.currency} `}
                {t.electricity.cost.toFixed(2)}
              </span>
              <span className="text-muted">
                {" "}
                · {t.electricity.kwh.toFixed(2)} kWh at {r.prices?.electricity.watts} W
              </span>
            </p>
          )}
        </div>
      </section>

      <section className="card grid gap-3">
        <span className="eyebrow">Tokens a day, the last 30 days</span>
        <Days daily={r.daily} />
        <details>
          <summary className="disclosure">The 30 days as a table</summary>
          <table className="mt-2 w-full text-detail">
            <tbody>
              {r.daily.map((d) => (
                <tr key={d.day} className="border-t border-line">
                  <td className="py-1">{d.day}</td>
                  <td className="font-mono py-1 text-right tabular-nums">{n(d.tokens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <section className="card grid gap-3">
        <Seg label="Period" options={PERIODS} value={days} onChange={setDays} />
        {/* the last period's figures, dimmed, until the new one lands */}
        <div className={cx("grid gap-3", loading && "busy")} aria-busy={loading}>
          <p className="m-0 text-body">
            <b className="font-mono text-lead font-medium text-strong tabular-nums">
              {n(r.period.fresh + r.period.reused + r.period.out)}
            </b>{" "}
            tokens · {n(r.period.requests)} requests · {r.period.computeHours.toFixed(1)} h of compute
          </p>
          {r.models.map((m) => (
            <div key={m.model} className="inner grid gap-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-small text-strong">{m.model}</span>
                <span className="ml-auto text-small text-muted">
                  {short(m.fresh + m.reused + m.out)} tokens · {n(m.requests)} requests · {m.computeHours.toFixed(1)} h
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 text-small text-muted">
                {m.cloud.map((c) => (
                  <span key={c.id}>
                    {r.prices?.cloud.find((x) => x.id === c.id)?.name.split(",")[0]}:{" "}
                    <span className={c.usd == null ? "" : "font-mono font-medium text-ink tabular-nums"}>
                      {usd(c.usd)}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {r.prices && (
        <details className="card">
          <summary className="disclosure">The prices, with where they were seen</summary>
          <div className="grid gap-3 pt-3 text-detail">
            {r.prices.about && <p className="m-0 text-muted">{r.prices.about}</p>}
            {r.prices.cloud.map((c) => (
              <div key={c.id} className="grid gap-1">
                <b className="text-strong">{c.name}</b>
                {c.prices.map((p) => (
                  <p key={`${p.model}-${p.match ?? ""}`} className="m-0 text-muted">
                    {p.match ? `${p.match}: ` : ""}
                    {p.model} — in ${p.input}, cached ${p.cachedInput}, out ${p.output} per million ·{" "}
                    <a href={p.source} target="_blank" rel="noopener noreferrer" className="text-accent">
                      source
                    </a>{" "}
                    ({p.seen})
                  </p>
                ))}
              </div>
            ))}
            <p className="m-0 text-muted">
              Electricity: {r.prices.electricity.watts} W ({r.prices.electricity.wattsSource}) at{" "}
              {r.prices.electricity.pricePerKwh} {r.prices.electricity.currency} per kWh ·{" "}
              <a href={r.prices.electricity.source} target="_blank" rel="noopener noreferrer" className="text-accent">
                source
              </a>{" "}
              ({r.prices.electricity.seen})
            </p>
          </div>
        </details>
      )}
    </>
  );
}
