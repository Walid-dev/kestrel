// Cost: what this computer's models did in the period I pick (Today, 7 days, 30 days, All), what the same use would
// have cost in the cloud at my reference prices, what running here saved against that, and what it cost in
// electricity. One strip of figures answers that at a glance; the tokens of each of the last 30 days sit under it, the
// period's days lit; then each model in one aligned table, with the prices and where they were seen folded at its
// foot. Colour only means something: a cloud price sits on the money scale (mint cheap to coral costly), what was saved
// is green. Labels and hints, no sentences: what a figure means is in its title.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { cx } from "./ui/cx.ts";
import { EmptyState } from "./ui/empty.tsx";
import { Figure, Figures as FigureStrip } from "./ui/figures.tsx";
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
  hourly: { hour: number; tokens: number }[];
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
// how many of the chart's 30 days the period covers (Today draws its hours instead), and the words for a period with
// nothing in it
const SPAN: Record<string, number> = { "7": 7, "30": 30, all: 30 };
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
// a column's compute in one unit, picked from its largest figure (the total): minutes when that is under an hour,
// hours with one decimal otherwise, so 44 is never read beside 1.1
const hoursIn = (most: number) => (h: number) =>
  most < 1 ? hours(h) : h > 0 && h < 0.05 ? "<0.1 h" : `${h.toFixed(1)} h`;
const kwh = (v: number) => (v > 0 && v < 0.005 ? "<0.01" : v.toFixed(2));
const tokensOf = (u: { fresh: number; reused: number; out: number }) => u.fresh + u.reused + u.out;
// a reference's name up to its first comma ("Made-up Cloud A, the big one"): a column's head, a figure's line
const brief = (name: string) => name.split(",")[0];
const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const hourLabel = (hour: number) => new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, { hour: "numeric" });
const dateLabel = (iso: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : iso;

// the money scale for a cost, as Searches colours a price: under the first step mint (cheap), then lime, amber, and
// coral (costly) past the last. A period's cloud price is judged by its pace over a month, against about what a cloud
// plan costs (20 a month in the middle); a price per million tokens by its column, from where cheap and frontier models
// sit (cached input is about a tenth of fresh, output about four times)
type Tier = "great" | "good" | "fair" | "poor";
const tierOf = (v: number, [a, b, c]: readonly [number, number, number]): Tier =>
  v < a ? "great" : v < b ? "good" : v < c ? "fair" : "poor";
const MONTH = [5, 20, 60] as const;
const PER_M = { input: [0.5, 2, 5], cachedInput: [0.1, 0.5, 1.5], output: [2, 8, 20] } as const;
const TIER_WORD: Record<Tier, string> = { great: "cheap", good: "fair", fair: "costly", poor: "very costly" };
// the days the period covers, for its pace: the period's days, or fewer when counting started inside it; a day at least,
// so today's use reads as a day's and an overnight batch at 1 AM isn't multiplied by the hours since midnight. With no
// start, All counts as 30 days
function spanDays(r: Report, days: string): number {
  const counted = r.since ? (Date.parse(r.at) - Date.parse(r.since)) / 86_400_000 : Number.POSITIVE_INFINITY;
  const period = days === "all" ? (r.since ? counted : 30) : Number(days) || 30;
  return Math.max(1, Math.min(period, counted));
}

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
      app="Cost"
      eyebrow="The models"
      title="Cost"
      line={
        r ? (
          <>
            <Span r={r} days={days} /> · updated{" "}
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
          <Strip r={r} days={days} loading={report.isPlaceholderData} />
          {days === "1" ? (
            <Chart
              key="hours"
              label="Tokens an hour"
              span="Today"
              bars={r.hourly.map((h) => ({ key: String(h.hour), tick: hourLabel(h.hour), tokens: h.tokens }))}
              lit={24}
              every={6}
            />
          ) : (
            <Chart
              key="days"
              label="Tokens a day"
              span="Last 30 days"
              bars={r.daily.map((d) => ({ key: d.day, tick: dayLabel(d.day), tokens: d.tokens }))}
              lit={SPAN[days] ?? 30}
              every={7}
            />
          )}
          <Models r={r} days={days} loading={report.isPlaceholderData} />
        </>
      )}
    </Page>
  );
}

// the days the figures cover, from the chart's own days so no date is worked out twice: one day, a range, or for All
// the day oMLX started counting
function Span({ r, days }: { r: Report; days: string }) {
  const today = r.daily.at(-1)?.day;
  const from = r.daily.at(-(SPAN[days] ?? 1))?.day;
  if (days === "all")
    return r.since ? (
      <>
        Since{" "}
        <b className="text-ink">
          {new Date(r.since).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
        </b>
      </>
    ) : (
      "Nothing counted yet"
    );
  if (!today || !from) return null;
  return (
    <b className="text-ink">{days === "1" ? `Today, ${dayLabel(today)}` : `${dayLabel(from)} – ${dayLabel(today)}`}</b>
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

// the period in figures, the shared strip (one cell each: a label, a dot, the value in mono, quiet lines with the parts
// in bold). Six when the electricity is in US$ (what was saved a figure of its own, beside the cloud's); else five,
// what it saved a green line in the cloud's cell. On a phone the cloud takes a row of its own (with six, Compute too,
// so the rest pair up). The cloud's dot is its place on the money scale; what was saved has a green one
function Strip({ r, days, loading }: { r: Report; days: string; loading: boolean }) {
  const p = r.period;
  const [lead, ...others] = p.cloud;
  const watts = r.prices?.electricity.watts;
  const power = p.electricity;
  const span = spanDays(r, days);
  const month = lead?.usd != null ? (lead.usd * 30) / span : null;
  const tier = month != null ? tierOf(month, MONTH) : null;
  // what running here saved: the cloud's price less the electricity, a figure of its own only when both are in US$.
  // Without a rate it is a green line in the cloud's cell, the electricity named beside it, never converted
  const saved = lead?.usd != null && power?.currency === "USD" ? Math.max(0, lead.usd - power.cost) : null;
  return (
    <FigureStrip label="The period" busy={loading}>
      <Figure
        label="Cloud would cost"
        wide
        value={lead?.usd != null ? money(lead.usd) : "—"}
        tone={tier ?? undefined}
        quiet={lead?.usd == null}
        hint={
          r.pricesError ??
          (lead
            ? `The same use at ${lead.name}'s prices${tier && month != null ? `: ${TIER_WORD[tier]}, about ${money(month)} a month at this pace` : ""}${lead.unpriced.length ? `; not counted, no reference price: ${lead.unpriced.join(", ")}` : ""}`
            : "prices.json names no cloud reference")
        }
      >
        {r.pricesError ? (
          <span className="line-clamp-2 text-orange">{r.pricesError}</span>
        ) : !lead ? (
          <span>No reference in prices.json</span>
        ) : (
          <>
            <span>
              {brief(lead.name)}
              {lead.usd == null
                ? ": no reference price"
                : lead.unpriced.length > 0 && ` · ${lead.unpriced.length} unpriced`}
            </span>
            {/* over a full 30 days the pace is the figure itself */}
            {month != null && month > 0 && Math.abs(span - 30) > 0.01 && (
              <span>
                <b className="text-ink">≈{money(month)}</b> a month
              </span>
            )}
            {saved == null && lead.usd != null && lead.usd > 0 && (
              <span>
                <span className="text-green">
                  saved <b>{money(lead.usd)}</b>
                </span>
                {power ? (
                  <>
                    , less <b className="text-ink">{money(power.cost, power.currency)}</b> of power
                  </>
                ) : (
                  ", no power price"
                )}
              </span>
            )}
            {others.map((c) => (
              <span
                key={c.id}
                title={
                  c.unpriced.length ? `${c.name}; not counted, no reference price: ${c.unpriced.join(", ")}` : c.name
                }
              >
                {brief(c.name)} <b className="text-ink">{c.usd == null ? "—" : money(c.usd)}</b>
                {c.usd != null && c.unpriced.length > 0 && (
                  <span className="whitespace-nowrap"> · {c.unpriced.length} unpriced</span>
                )}
              </span>
            ))}
          </>
        )}
      </Figure>
      {saved != null && (
        <Figure
          label="Saved"
          value={money(saved)}
          tone={saved > 0 ? "green" : undefined}
          hint={`What running on this computer saved against ${lead?.name ?? "the cloud"}, less the electricity`}
        >
          <span>the cloud, less the electricity</span>
        </Figure>
      )}
      <Figure
        label="Electricity"
        value={power ? money(power.cost, power.currency) : "—"}
        quiet={!power}
        hint="What the computer drew while the models worked, at my price per kWh"
      >
        {power && (
          <span>
            <b className="text-ink">{kwh(power.kwh)}</b> kWh · <b className="text-ink">{watts}</b> W
          </span>
        )}
      </Figure>
      <Figure
        label="Tokens"
        value={short(tokensOf(p))}
        hint={`${n(tokensOf(p))} tokens. In: what the models read, fresh or reused from oMLX's cache. Out: what they wrote.`}
      >
        <span>
          <b className="text-ink">{short(p.fresh)}</b> fresh · <b className="text-ink">{short(p.reused)}</b> reused ·{" "}
          <b className="text-ink">{short(p.out)}</b> out
        </span>
      </Figure>
      <Figure label="Requests" value={n(p.requests)} />
      <Figure label="Compute" value={hours(p.computeHours)} hint="The time the models worked" wide={saved != null} />
    </FigureStrip>
  );
}

// one bar per day (the last 30) or per hour (today), the period's bars lit and the rest faint. The bar under the
// pointer, or the one tapped (it stays, for a phone), reads out in the card's head; the top bar carries its figure.
// The same numbers as a table for a screen reader
type Bar = { key: string; tick: string; tokens: number };
function Chart({
  label,
  span,
  bars,
  lit,
  every,
}: {
  label: string;
  span: string;
  bars: Bar[];
  lit: number;
  every: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const shown = hover ?? pinned;
  const bar = shown === null ? undefined : bars[shown];
  return (
    <section className="card grid gap-3" aria-label={label}>
      <div className="flex items-baseline gap-3">
        <span className="eyebrow">{label}</span>
        <span className="ml-auto text-small text-muted tabular-nums" aria-live="polite">
          {bar ? (
            <>
              {bar.tick} <b className="text-ink">{n(bar.tokens)}</b>
            </>
          ) : (
            span
          )}
        </span>
      </div>
      <Bars
        bars={bars}
        lit={lit}
        every={every}
        label={`${label}, ${span.toLowerCase()}`}
        shown={shown}
        onHover={setHover}
        onPick={(i) => setPinned((p) => (p === i ? null : i))}
      />
      {/* a block, not the table itself: a table won't shrink to sr-only's 1 px and would stretch the page */}
      <div className="sr-only">
        <table>
          <caption>
            {label}, {span.toLowerCase()}
          </caption>
          <tbody>
            {bars.map((d) => (
              <tr key={d.key}>
                <td>{d.tick}</td>
                <td>{n(d.tokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// one series, so no legend. Rounded bars from the baseline, a little narrower than their slot. The drawing is the
// size of its frame, one unit a pixel, so its labels keep the label step's size; the frame's height comes from
// styles.css (.cost-chart). A tap pins a bar on click, which a swipe to scroll never fires
function Bars({
  bars,
  lit,
  every,
  label,
  shown,
  onHover,
  onPick,
}: {
  bars: Bar[];
  lit: number;
  every: number;
  label: string;
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
  // 18 above the bars for the top bar's figure, 18 under the baseline for the ticks
  const BAND = 18;
  const base = H - BAND;
  const top = Math.max(1, ...bars.map((d) => d.tokens));
  // 2 px apart on a phone, a quarter of the slot apart on a wide screen
  const slot = W / bars.length;
  const bar = Math.max(4, slot - Math.max(2, Math.round(slot / 4)));
  const peak = bars.findIndex((d) => d.tokens === top);
  const from = bars.length - lit;
  const last = bars.length - 1;
  return (
    <div ref={frame} className="cost-chart" onPointerLeave={() => onHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-full w-full" role="img" aria-label={label}>
        <line x1="0" x2={W} y1={base} y2={base} className="stroke-line" />
        {bars.map((d, i) => {
          const h = d.tokens > 0 ? Math.max(2, (d.tokens / top) * (base - BAND)) : 0;
          const x = i * slot + (slot - bar) / 2;
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: the drawing is an image; the table beside it reads the same numbers
            <g key={d.key} onPointerEnter={() => onHover(i)} onClick={() => onPick(i)}>
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
              {(i % every === 0 && i < last - every / 2) || i === last ? (
                <text
                  x={i === 0 ? 0 : i === last ? W : x + bar / 2}
                  y={base + 14}
                  textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"}
                  className="fill-muted font-mono text-label"
                >
                  {d.tick}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

type Cell = (usd: number | null, name: string, as?: string | null, unpriced?: string[]) => ReactNode;

// each model in the period, the most used first, and the total: one aligned table on a computer, a row each on a
// phone. A cloud price is a money pill on the money scale; a model a reference doesn't price shows a dash, never 0
function Models({ r, days, loading }: { r: Report; days: string; loading: boolean }) {
  const refs = r.period.cloud;
  const power = r.prices !== null;
  const total = tokensOf(r.period);
  // a share, and a total row, only mean something beside another model
  const several = r.models.length > 1;
  const compute = hoursIn(r.period.computeHours);
  // a price's tone is its pace over a month, as the strip's: the same scale for a model, the total and the strip
  const span = spanDays(r, days);
  const cell: Cell = (usd, name, as, unpriced) => {
    if (usd == null)
      return (
        <span className="text-muted" title={`${name}: no reference price`}>
          —
        </span>
      );
    const month = (usd * 30) / span;
    const tier = tierOf(month, MONTH);
    return (
      <span
        className={`money tone-${tier}`}
        title={`${
          as
            ? `${name}, priced as ${as}`
            : unpriced?.length
              ? `${name}; not counted, no reference price: ${unpriced.join(", ")}`
              : name
        }: ${TIER_WORD[tier]}, about ${money(month)} a month at this pace`}
      >
        {money(usd)}
      </span>
    );
  };
  return (
    <section aria-label="By model" aria-busy={loading} className={cx("card grid gap-3", loading && "busy")}>
      {r.models.length === 0 ? (
        <p className="m-0 text-detail text-muted">{NONE[days]}</p>
      ) : (
        <>
          <table className="data-table cost-models">
            <caption className="sr-only">Each model in the period</caption>
            <thead>
              <tr>
                <th className="eyebrow">Model</th>
                <th className="eyebrow">Tokens</th>
                <th className="eyebrow">Requests</th>
                <th className="eyebrow">Compute</th>
                {power && <th className="eyebrow cost-power">Electricity</th>}
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
                      <span className="cost-share-n" title={`${n(tokensOf(m))} tokens`}>
                        {short(tokensOf(m))}
                      </span>
                    </span>
                  </td>
                  <td>{n(m.requests)}</td>
                  <td>{compute(m.computeHours)}</td>
                  {power && (
                    <td className="cost-power">
                      {m.electricity ? money(m.electricity.cost, m.electricity.currency) : "—"}
                    </td>
                  )}
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
                  <td>{compute(r.period.computeHours)}</td>
                  {power && (
                    <td className="cost-power">
                      {r.period.electricity ? money(r.period.electricity.cost, r.period.electricity.currency) : "—"}
                    </td>
                  )}
                  {refs.map((c) => (
                    <td key={c.id}>{cell(c.usd, c.name, null, c.unpriced)}</td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
          <div className="cost-rows">
            {refs[0] && (
              // the pill on each row is this reference's price: named once, as a table's head would
              <div className="cost-rows-head" aria-hidden="true">
                <span className="eyebrow">Model</span>
                <span className="eyebrow" title={refs[0].name}>
                  {brief(refs[0].name)}
                </span>
              </div>
            )}
            <ul className="cost-list" aria-label="Each model in the period">
              {r.models.map((m) => (
                <PhoneRow
                  key={m.model}
                  title={<span className="cost-model">{m.model}</span>}
                  figures={m}
                  tokens={tokensOf(m)}
                  share={several ? tokensOf(m) / Math.max(1, total) : undefined}
                  cloud={refs.map((c, i) => ({ c, usd: m.cloud[i]?.usd ?? null, as: m.cloud[i]?.as }))}
                  cell={cell}
                  compute={compute}
                />
              ))}
              {several && (
                <PhoneRow
                  title={<span className="cost-total">Total</span>}
                  figures={r.period}
                  tokens={total}
                  cloud={refs.map((c) => ({ c, usd: c.usd, as: null, unpriced: c.unpriced }))}
                  cell={cell}
                  compute={compute}
                />
              )}
            </ul>
          </div>
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
  compute,
}: {
  title: ReactNode;
  figures: { requests: number; computeHours: number; electricity: Power | null };
  tokens: number;
  share?: number;
  cloud: { c: Cloud; usd: number | null; as?: string | null; unpriced?: string[] }[];
  cell: Cell;
  compute: (h: number) => string;
}) {
  const [lead, ...others] = cloud;
  return (
    <li className="cost-row">
      <div className="flex items-start gap-3">
        <span className="min-w-0 flex-1">{title}</span>
        {lead && cell(lead.usd, lead.c.name, lead.as, lead.unpriced)}
      </div>
      <span className="text-small text-muted tabular-nums">
        <b className="text-ink">{short(tokens)}</b> tokens · <b className="text-ink">{n(f.requests)}</b> req ·{" "}
        <b className="text-ink">{compute(f.computeHours)}</b>
        {f.electricity && (
          <>
            {" "}
            · <b className="text-ink">{money(f.electricity.cost, f.electricity.currency)}</b>
          </>
        )}
      </span>
      {others.length > 0 && (
        <span className="text-small text-muted tabular-nums">
          {others.map(({ c, usd, unpriced }, i) => (
            <span key={c.id} title={unpriced?.length ? `${c.name}; not counted: ${unpriced.join(", ")}` : c.name}>
              {i > 0 && " · "}
              {brief(c.name)} <b className="text-ink">{usd == null ? "—" : money(usd)}</b>
              {usd != null && unpriced && unpriced.length > 0 && ` · ${unpriced.length} unpriced`}
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
// reference's name over its prices, a model's prices in columns, US$ per million tokens, each on the money scale
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
      <table className="data-table cost-prices">
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
                {(["input", "cachedInput", "output"] as const).map((k) => {
                  const tier = tierOf(p[k], PER_M[k]);
                  return (
                    <td key={k}>
                      <span className={`money tone-${tier}`} title={TIER_WORD[tier]}>
                        {rate(p[k])}
                      </span>
                    </td>
                  );
                })}
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
