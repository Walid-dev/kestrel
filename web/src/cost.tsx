// Cost: what this computer's models did in the period I pick (Today, 7 days, 30 days, All), what the same use would
// have cost in the cloud at my reference prices, and what it cost in electricity. One strip of figures answers that
// at a glance; the tokens of each of the last 30 days sit under it, the period's days lit; then each model in one
// aligned table, with the prices and where they were seen folded at its foot. Labels and hints, no sentences: what a
// figure means is in its title.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { cx } from "./ui/cx.ts";
import { EmptyState } from "./ui/empty.tsx";
import { Page } from "./ui/page.tsx";
import { Seg } from "./ui/seg.tsx";

type Cloud = { id: string; name: string; usd: number | null; unpriced: string[] };
type Power = { kwh: number; cost: number; currency: string };
type Figures = {
  requests: number;
  fresh: number;
  reused: number;
  out: number;
  computeHours: number;
  cloud: Cloud[];
  electricity: Power | null;
};
type Model = Omit<Figures, "cloud"> & { model: string; cloud: { id: string; usd: number | null; as: string | null }[] };
type Price = {
  match?: string;
  model: string;
  input: number;
  cachedInput: number;
  output: number;
  peak?: { offPeakShare: number };
  source: string;
  seen: string;
  note?: string;
};
type Report = {
  at: string;
  since: string | null;
  days: string;
  period: Figures;
  models: Model[];
  daily: { day: string; tokens: number }[];
  prices: {
    about?: string;
    cloud: { id: string; name: string; prices: Price[] }[];
    electricity: {
      watts: number;
      wattsSource: string;
      pricePerKwh: number;
      currency: string;
      source: string;
      seen: string;
      note?: string;
    };
  } | null;
  pricesError: string | null;
};

const PERIODS = [
  { value: "1", label: "Today" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "all", label: "All" },
];
// how many of the chart's 30 days the period covers, and the words for a period with nothing in it
const SPAN: Record<string, number> = { "1": 1, "7": 7, "30": 30, all: 30 };
const NONE: Record<string, string> = {
  "1": "No model ran today.",
  "7": "No model ran in the last 7 days.",
  "30": "No model ran in the last 30 days.",
  all: "No model has run yet.",
};

const n = (v: number) => Math.round(v).toLocaleString();
const short = (v: number) =>
  v >= 999_500_000
    ? `${(v / 1e9).toFixed(1)}B`
    : v >= 999_500
      ? `${(v / 1e6).toFixed(1)}M`
      : v >= 1e3
        ? `${Math.round(v / 1e3)}k`
        : String(Math.round(v));
const SIGN: Record<string, string> = { USD: "US$", CAD: "CA$" };
const sign = (currency: string) => SIGN[currency] ?? `${currency} `;
// a sum of money in its currency, two decimals; a few tenths of a cent reads as under a cent, never as a free 0.00
function money(v: number, currency = "USD") {
  if (v > 0 && v < 0.005) return `<${sign(currency)}0.01`;
  return `${sign(currency)}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
// a price per unit (per million tokens, per kWh): as precise as prices.json gives it, up to four decimals; the
// cloud's in bare numbers under one caption, the electricity's with its currency
const rate = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const hours = (h: number) =>
  h > 0 && h * 60 < 0.5 ? "<1 min" : h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`;
const kwh = (v: number) => (v > 0 && v < 0.005 ? "<0.01" : v.toFixed(2));
const tokensOf = (u: { fresh: number; reused: number; out: number }) => u.fresh + u.reused + u.out;
// a reference's name up to its first comma ("Made-up Cloud A, the big one"): a column's head, a figure's line
const brief = (name: string) => name.split(",")[0];
const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const dateLabel = (iso: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : iso;

// the server answers 503 when oMLX's table isn't there to read: a set-up step, not a failure. It also answers 503
// when the table is there but locked for a moment; with figures on screen that is only a missed refresh
class NotReady extends Error {}

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
    // a new period keeps the figures and the switch on screen while it loads, so nothing jumps or loses focus
    placeholderData: keepPreviousData,
  });
  const r = report.data;
  const failed = report.isError && !r;
  return (
    <Page
      title="Cost"
      line={
        r ? (
          <>
            {r.since ? (
              <>
                Since{" "}
                <b className="text-ink">
                  {new Date(r.since).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                </b>
              </>
            ) : (
              "Nothing counted yet"
            )}{" "}
            · updated{" "}
            <b className="text-ink">
              {new Date(r.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            </b>
            {report.isError && (
              // the figures stay; the next refresh, 12 seconds on, tries again
              <span
                className="chip chip-caps tone-orange ml-2 align-middle"
                role="status"
                title={`The last refresh didn't come through: ${(report.error as Error).message}. The next one tries again in a few seconds.`}
              >
                Stale
              </span>
            )}
          </>
        ) : (
          "What this computer's models did, and what it would have cost."
        )
      }
      actions={failed ? undefined : <Seg label="Period" options={PERIODS} value={days} onChange={setDays} />}
    >
      {failed ? (
        report.error instanceof NotReady ? (
          <NotSetUp reason={report.error.message} />
        ) : (
          <p className="m-0 text-detail text-red">{String((report.error as Error).message)}</p>
        )
      ) : !r ? (
        // the page's shape while the figures come, so nothing jumps when they land
        <div className="grid gap-(--page-gap)" aria-busy="true">
          <div className="skeleton h-24 rounded-xl" />
          <div className="skeleton h-60 rounded-xl" />
          <div className="skeleton h-56 rounded-xl" />
        </div>
      ) : (
        <>
          <Strip r={r} loading={report.isPlaceholderData} />
          <Chart daily={r.daily} span={SPAN[days] ?? 30} />
          <Models r={r} days={days} loading={report.isPlaceholderData} />
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

// the period in five figures, one cell each: a label, the value in mono, one quiet line with the parts in bold. Two
// columns on a phone (the cloud's cell, the answer and the one with a line per reference, takes a row of its own),
// five side by side on a computer
function Strip({ r, loading }: { r: Report; loading: boolean }) {
  const p = r.period;
  const [lead, ...others] = p.cloud;
  const watts = r.prices?.electricity.watts;
  return (
    <section aria-label="The period" aria-busy={loading} className={cx("cost-figures", loading && "busy")}>
      <Figure
        label="Cloud would cost"
        wide
        value={lead?.usd != null ? money(lead.usd) : "—"}
        title={
          r.pricesError ??
          (lead
            ? `The same use at ${lead.name}'s prices${lead.unpriced.length ? `; not counted, no reference price: ${lead.unpriced.join(", ")}` : ""}`
            : "prices.json names no cloud reference")
        }
      >
        {r.pricesError ? (
          <span className="line-clamp-2 text-orange">{r.pricesError}</span>
        ) : !lead ? (
          "No reference in prices.json"
        ) : (
          <>
            <span className="block">
              {brief(lead.name)}
              {lead.usd == null
                ? ": no reference price"
                : lead.unpriced.length > 0 && ` · ${lead.unpriced.length} unpriced`}
            </span>
            {others.map((c) => (
              <span key={c.id} className="block" title={c.name}>
                {brief(c.name)} <b className="text-ink">{c.usd == null ? "—" : money(c.usd)}</b>
              </span>
            ))}
          </>
        )}
      </Figure>
      <Figure
        label="Electricity"
        value={p.electricity ? money(p.electricity.cost, p.electricity.currency) : "—"}
        title="What the computer drew while the models worked, at my price per kWh"
      >
        {p.electricity && (
          <>
            <b className="text-ink">{kwh(p.electricity.kwh)}</b> kWh · <b className="text-ink">{watts}</b> W
          </>
        )}
      </Figure>
      <Figure
        label="Tokens"
        value={short(tokensOf(p))}
        title={`${n(tokensOf(p))} tokens. In: what the models read, fresh or reused from oMLX's cache. Out: what they wrote.`}
      >
        <b className="text-ink">{short(p.fresh)}</b> fresh · <b className="text-ink">{short(p.reused)}</b> reused ·{" "}
        <b className="text-ink">{short(p.out)}</b> out
      </Figure>
      <Figure label="Requests" value={n(p.requests)} />
      <Figure label="Compute" value={hours(p.computeHours)} title="The time the models worked" />
    </section>
  );
}

function Figure({
  label,
  value,
  title,
  wide = false,
  children,
}: {
  label: string;
  value: string;
  title?: string;
  wide?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={cx("cost-figure", wide && "cost-figure-wide")} title={title}>
      <span className="eyebrow">{label}</span>
      <span className="font-mono text-lead font-medium text-strong tabular-nums">{value}</span>
      {children && <span className="text-small text-muted tabular-nums">{children}</span>}
    </div>
  );
}

// the last 30 days, a bar each, the period's days lit and the rest faint. The day under the pointer, or the one
// tapped (it stays, for a phone), reads out in the card's head; the top day carries its figure. The same numbers as a
// table for a screen reader
function Chart({ daily, span }: { daily: Report["daily"]; span: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const shown = hover ?? pinned;
  const day = shown === null ? undefined : daily[shown];
  return (
    <section className="card grid gap-3" aria-label="Tokens a day">
      <div className="flex items-baseline gap-3">
        <span className="eyebrow">Tokens a day</span>
        <span className="ml-auto text-small text-muted tabular-nums" aria-live="polite">
          {day ? (
            <>
              {dayLabel(day.day)} <b className="text-ink">{n(day.tokens)}</b>
            </>
          ) : (
            "Last 30 days"
          )}
        </span>
      </div>
      <Days
        daily={daily}
        span={span}
        shown={shown}
        onHover={setHover}
        onPick={(i) => setPinned((p) => (p === i ? null : i))}
      />
      <table className="sr-only">
        <caption>Tokens a day, the last 30 days</caption>
        <tbody>
          {daily.map((d) => (
            <tr key={d.day}>
              <td>{d.day}</td>
              <td>{n(d.tokens)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// one series, so no legend. Thin bars from the baseline, 2 px apart. The drawing is the size of its frame, one unit a
// pixel, so its labels keep the label step's size; the frame's height comes from styles.css (.cost-chart)
function Days({
  daily,
  span,
  shown,
  onHover,
  onPick,
}: {
  daily: Report["daily"];
  span: number;
  shown: number | null;
  onHover: (i: number | null) => void;
  onPick: (i: number) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 720, h: 200 });
  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const fit = () =>
      setSize({ w: Math.max(240, Math.round(el.clientWidth)), h: Math.max(120, Math.round(el.clientHeight)) });
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  const { w: W, h: H } = size;
  // 18 above the bars for the top day's figure, 18 under the baseline for the dates
  const BAND = 18;
  const base = H - BAND;
  const top = Math.max(1, ...daily.map((d) => d.tokens));
  // bars a little narrower than their slot: 2 px apart on a phone, a quarter of the slot apart on a wide screen
  const slot = W / daily.length;
  const bar = Math.max(4, slot - Math.max(2, Math.round(slot / 4)));
  const peak = daily.findIndex((d) => d.tokens === top);
  const from = daily.length - span;
  return (
    <div ref={frame} className="cost-chart" onPointerLeave={() => onHover(null)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-full w-full"
        role="img"
        aria-label="Tokens a day, the last 30 days"
      >
        <line x1="0" x2={W} y1={base} y2={base} className="stroke-line" />
        {daily.map((d, i) => {
          const h = d.tokens > 0 ? Math.max(2, (d.tokens / top) * (base - BAND)) : 0;
          const x = i * slot + (slot - bar) / 2;
          return (
            <g key={d.day} onPointerEnter={() => onHover(i)} onPointerDown={() => onPick(i)}>
              {/* the target is the whole column, wider and taller than the bar */}
              <rect x={i * slot} y={0} width={slot} height={base} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${base} V${base - h + 4} a4,4 0 0 1 4,-4 h${bar - 8} a4,4 0 0 1 4,4 V${base} Z`}
                  className={cx(
                    "fill-(--chart-bar)",
                    shown !== i && (i < from ? "opacity-30" : shown !== null && "opacity-55"),
                  )}
                />
              )}
              {i === peak && d.tokens > 0 && (
                <text x={x + bar / 2} y={base - h - 6} textAnchor="middle" className="fill-strong font-mono text-label">
                  {short(d.tokens)}
                </text>
              )}
              {(i % 7 === 0 && i < daily.length - 4) || i === daily.length - 1 ? (
                <text
                  x={i === 0 ? 0 : i === daily.length - 1 ? W : x + bar / 2}
                  y={base + 14}
                  textAnchor={i === 0 ? "start" : i === daily.length - 1 ? "end" : "middle"}
                  className="fill-muted font-mono text-label"
                >
                  {dayLabel(d.day)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

type Cell = (usd: number | null, name: string, as?: string | null) => ReactNode;

// each model in the period, the most used first, and the total: one aligned table on a computer, a row each on a
// phone. A cloud price is a money pill; a model a reference doesn't price shows a dash, never 0
function Models({ r, days, loading }: { r: Report; days: string; loading: boolean }) {
  const refs = r.period.cloud;
  const power = r.prices !== null;
  const total = tokensOf(r.period);
  // a share, and a total row, only mean something beside another model
  const several = r.models.length > 1;
  const cell: Cell = (usd, name, as) =>
    usd == null ? (
      <span className="text-muted" title={`${name}: no reference price`}>
        —
      </span>
    ) : (
      <span className="money" title={as ? `${name}, priced as ${as}` : name}>
        {money(usd)}
      </span>
    );
  return (
    <section aria-label="By model" aria-busy={loading} className={cx("card grid gap-3", loading && "busy")}>
      {r.models.length === 0 ? (
        <p className="m-0 text-detail text-muted">{NONE[days]}</p>
      ) : (
        <>
          <table className="cost-table cost-models">
            <caption className="sr-only">Each model in the period</caption>
            <thead>
              <tr>
                <th className="eyebrow">Model</th>
                <th className="eyebrow">Tokens</th>
                <th className="eyebrow">Requests</th>
                <th className="eyebrow">Compute</th>
                {power && <th className="eyebrow">Electricity</th>}
                {refs.map((c) => (
                  <th key={c.id} className="eyebrow" title={c.name}>
                    {brief(c.name)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.models.map((m) => (
                <tr key={m.model}>
                  <td className="cost-model">{m.model}</td>
                  <td>
                    <span className="cost-share">
                      {several && <Share part={tokensOf(m) / Math.max(1, total)} />}
                      <span title={`${n(tokensOf(m))} tokens`}>{short(tokensOf(m))}</span>
                    </span>
                  </td>
                  <td>{n(m.requests)}</td>
                  <td>{hours(m.computeHours)}</td>
                  {power && <td>{m.electricity ? money(m.electricity.cost, m.electricity.currency) : "—"}</td>}
                  {refs.map((c, i) => (
                    <td key={c.id}>{cell(m.cloud[i]?.usd ?? null, c.name, m.cloud[i]?.as)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
            {several && (
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td title={`${n(total)} tokens`}>{short(total)}</td>
                  <td>{n(r.period.requests)}</td>
                  <td>{hours(r.period.computeHours)}</td>
                  {power && (
                    <td>
                      {r.period.electricity ? money(r.period.electricity.cost, r.period.electricity.currency) : "—"}
                    </td>
                  )}
                  {refs.map((c) => (
                    <td key={c.id}>{cell(c.usd, c.name)}</td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
          <ul className="cost-rows" aria-label="Each model in the period">
            {r.models.map((m) => (
              <PhoneRow
                key={m.model}
                title={<span className="cost-model">{m.model}</span>}
                figures={m}
                tokens={tokensOf(m)}
                share={several ? tokensOf(m) / Math.max(1, total) : undefined}
                cloud={refs.map((c, i) => ({ c, usd: m.cloud[i]?.usd ?? null, as: m.cloud[i]?.as }))}
                cell={cell}
              />
            ))}
            {several && (
              <PhoneRow
                title={<span className="cost-total">Total</span>}
                figures={r.period}
                tokens={total}
                cloud={refs.map((c) => ({ c, usd: c.usd, as: null }))}
                cell={cell}
              />
            )}
          </ul>
        </>
      )}
      {r.prices && <Sources prices={r.prices} />}
    </section>
  );
}

// a model on a phone: its name with the first reference's price as a pill on its right, its figures in one quiet
// line with the values bold, any other reference in a second, and its share of the tokens as a bar
function PhoneRow({
  title,
  figures: f,
  tokens,
  share,
  cloud,
  cell,
}: {
  title: ReactNode;
  figures: { requests: number; computeHours: number; electricity: Power | null };
  tokens: number;
  share?: number;
  cloud: { c: Cloud; usd: number | null; as?: string | null }[];
  cell: Cell;
}) {
  const [lead, ...others] = cloud;
  return (
    <li className="cost-row">
      <div className="flex items-start gap-3">
        <span className="min-w-0 flex-1">{title}</span>
        {lead && cell(lead.usd, lead.c.name, lead.as)}
      </div>
      <span className="text-small text-muted tabular-nums">
        <b className="text-ink">{short(tokens)}</b> tokens · <b className="text-ink">{n(f.requests)}</b> req ·{" "}
        <b className="text-ink">{hours(f.computeHours)}</b>
        {f.electricity && (
          <>
            {" "}
            · <b className="text-ink">{money(f.electricity.cost, f.electricity.currency)}</b>
          </>
        )}
      </span>
      {others.length > 0 && (
        <span className="text-small text-muted tabular-nums">
          {others.map(({ c, usd }, i) => (
            <span key={c.id} title={c.name}>
              {i > 0 && " · "}
              {brief(c.name)} <b className="text-ink">{usd == null ? "—" : money(usd)}</b>
            </span>
          ))}
        </span>
      )}
      {share !== undefined && <Share part={share} />}
    </li>
  );
}

// a model's share of the period's tokens: the meter in the accent, as long as the share (--part, from the data)
function Share({ part }: { part: number }) {
  return (
    <span
      className="meter tone-accent cost-meter"
      role="img"
      aria-label={`${Math.round(part * 100)}% of the tokens`}
      style={{ "--part": `${Math.round(part * 1000) / 10}%` } as CSSProperties}
    >
      <span />
    </span>
  );
}

// the reference prices and the electricity, each with where and when it was seen, folded at the table's foot: a
// reference's name over its prices, a model's prices in columns, US$ per million tokens
function Sources({ prices }: { prices: NonNullable<Report["prices"]> }) {
  const e = prices.electricity;
  const seen = (source: string, when: string) => (
    <a href={source} target="_blank" rel="noopener noreferrer" className="cost-source text-accent">
      seen {dateLabel(when)} ↗
    </a>
  );
  return (
    <details className="cost-sources">
      <summary className="disclosure" title={prices.about}>
        Prices and sources
      </summary>
      <table className="cost-table cost-prices">
        <caption className="cost-caption">US$ per million tokens</caption>
        <thead>
          <tr>
            <th className="eyebrow">Priced as</th>
            <th className="eyebrow" title="Fresh input">
              In
            </th>
            <th className="eyebrow" title="Input read from the cloud's cache: the tokens oMLX reused">
              Cached
            </th>
            <th className="eyebrow" title="Output">
              Out
            </th>
          </tr>
        </thead>
        {prices.cloud.map((c) => (
          <tbody key={c.id}>
            <tr>
              <th colSpan={4} scope="colgroup" className="cost-group">
                {c.name}
              </th>
            </tr>
            {c.prices.map((p) => (
              <tr key={`${p.model}-${p.match ?? ""}`}>
                <td title={p.note}>
                  <span className="cost-model">{p.model}</span>
                  <span className="cost-sub">
                    {p.match ? `for ${p.match} · ` : "every model · "}
                    {p.peak && `off-peak ×${p.peak.offPeakShare} · `}
                    {seen(p.source, p.seen)}
                  </span>
                </td>
                <td>{rate(p.input)}</td>
                <td>{rate(p.cachedInput)}</td>
                <td>{rate(p.output)}</td>
              </tr>
            ))}
          </tbody>
        ))}
        <tbody>
          <tr>
            <th colSpan={4} scope="colgroup" className="cost-group">
              Electricity
            </th>
          </tr>
          <tr>
            <td title={e.note}>
              <span className="cost-model">{e.watts} W</span>
              <span className="cost-sub">
                {e.wattsSource} · {seen(e.source, e.seen)}
              </span>
            </td>
            <td colSpan={3}>
              {sign(e.currency)}
              {rate(e.pricePerKwh)} /kWh
            </td>
          </tr>
        </tbody>
      </table>
    </details>
  );
}
