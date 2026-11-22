// Cost, the old setup's: everything this computer's models did since oMLX started counting — tokens, requests, compute
// — what the same use would have cost in the cloud at my reference prices, and what it cost in electricity; then the
// tokens of each of the last 30 days, a period with each model apart, and the prices with where they were seen.
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

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
const PERIODS: [string, string][] = [
  ["1", "Today"],
  ["7", "7 days"],
  ["30", "30 days"],
  ["all", "All"],
];

// one series, so no legend: the title names it. Thin bars from the baseline, 2px apart, the top day labelled, a
// tooltip on each bar, and the same numbers as a table below
function Days({ daily }: { daily: Report["daily"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = 170;
  const top = Math.max(1, ...daily.map((d) => d.tokens));
  const slot = W / daily.length;
  const bar = Math.max(4, slot - 2);
  const peak = daily.findIndex((d) => d.tokens === top);
  const label = (day: string) =>
    new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H + 22}`}
        className="block h-auto w-full"
        role="img"
        aria-label="Tokens a day, the last 30 days"
      >
        <line x1="0" x2={W} y1={H} y2={H} stroke="var(--line)" />
        {daily.map((d, i) => {
          const h = d.tokens > 0 ? Math.max(2, (d.tokens / top) * (H - 22)) : 0;
          const x = i * slot + (slot - bar) / 2;
          return (
            <g key={d.day} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
              {/* the hit target is the whole column, wider and taller than the bar */}
              <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${H} V${H - h + 4} a4,4 0 0 1 4,-4 h${bar - 8} a4,4 0 0 1 4,4 V${H} Z`}
                  style={{ fill: "var(--chart-bar)", opacity: hover === null || hover === i ? 1 : 0.55 }}
                />
              )}
              {i === peak && d.tokens > 0 && (
                <text
                  x={x + bar / 2}
                  y={H - h - 6}
                  textAnchor="middle"
                  fontSize="11"
                  fontFamily="var(--mono)"
                  style={{ fill: "var(--strong)" }}
                >
                  {short(d.tokens)}
                </text>
              )}
              {(i % 7 === 0 && i < daily.length - 4) || i === daily.length - 1 ? (
                <text
                  x={i === 0 ? 0 : i === daily.length - 1 ? W : x + bar / 2}
                  y={H + 16}
                  textAnchor={i === 0 ? "start" : i === daily.length - 1 ? "end" : "middle"}
                  fontSize="10.5"
                  fontFamily="var(--mono)"
                  style={{ fill: "var(--muted)" }}
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
          className="pointer-events-none absolute top-0 rounded-lg border px-2.5 py-1.5 text-xs"
          style={{
            left: `${Math.min(80, Math.max(0, ((hover + 0.5) / daily.length) * 100 - 10))}%`,
            background: "var(--surface-2)",
            borderColor: "var(--line)",
            color: "var(--text)",
          }}
        >
          <b style={{ color: "var(--strong)" }}>{label(daily[hover].day)}</b> · {n(daily[hover].tokens)} tokens
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
      const data = (await res.json()) as Report & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `${res.status}`);
      return data;
    },
    refetchInterval: 12_000, // the count rolls on while a model works
  });
  const r = report.data;
  const t = r?.total;
  const tokens = t ? t.fresh + t.reused + t.out : 0;
  const daysCounted = r?.since ? Math.max(1, Math.round((Date.parse(r.at) - Date.parse(r.since)) / 86_400_000)) : 0;

  if (report.isError)
    return (
      <main className="mx-auto grid w-full max-w-3xl gap-3">
        <h2 className="font-cond m-0 text-[28px] font-bold">Cost</h2>
        <p className="m-0 text-sm" style={{ color: "var(--red)" }}>
          {String((report.error as Error).message)}
        </p>
      </main>
    );
  if (!r || !t) return null;
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-4">
      <section className="card grid gap-4">
        <div className="flex items-baseline gap-3">
          <h2 className="font-cond m-0 text-xl font-bold">
            Since{" "}
            {r.since
              ? new Date(r.since).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
              : "—"}
          </h2>
          <span className="ml-auto text-xs" style={{ color: "var(--muted)" }}>
            Updated {new Date(r.at).toLocaleTimeString()}
          </span>
        </div>
        <p className="m-0 flex items-baseline gap-3">
          <span
            className="font-cond text-[56px] font-bold leading-none md:text-[68px]"
            style={{ color: "var(--strong)" }}
          >
            {n(tokens)}
          </span>
          <span className="text-lg" style={{ color: "var(--muted)" }}>
            tokens
          </span>
        </p>
        <p className="m-0 text-sm" style={{ color: "var(--muted)" }}>
          {daysCounted} days of this computer's models, counted by oMLX
        </p>
        <div
          className="grid grid-cols-2 overflow-hidden rounded-xl border md:grid-cols-5"
          style={{ borderColor: "var(--line)" }}
        >
          {[
            ["Requests", n(t.requests)],
            ["Fresh in", n(t.fresh)],
            ["Reused in", n(t.reused)],
            ["Out", n(t.out)],
            ["Compute", `${t.computeHours.toFixed(1)} h`],
          ].map(([k, v]) => (
            <div
              key={k}
              className="grid gap-1 px-3 py-2.5"
              style={{ background: "var(--surface-2)", outline: "1px solid var(--line)" }}
            >
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {k}
              </span>
              <span className="font-cond text-[21px] font-bold" style={{ color: "var(--strong)" }}>
                {v}
              </span>
            </div>
          ))}
        </div>
        <p className="m-0 text-xs" style={{ color: "var(--muted)" }}>
          In: what the models read, fresh or reused from oMLX's cache. Out: what they wrote. Compute: the time they
          worked.
        </p>
        <div className="grid gap-0">
          <span className="eyebrow pb-2">The same use in the cloud</span>
          {r.pricesError && (
            <p className="m-0 text-sm" style={{ color: "var(--warn)" }}>
              {r.pricesError}
            </p>
          )}
          {t.cloud.map((c) => (
            <div key={c.id} className="flex items-baseline gap-3 py-2.5" style={{ borderTop: "1px solid var(--line)" }}>
              <span className="text-[15px]">{c.name}</span>
              <span className="font-cond ml-auto text-[19px] font-bold" style={{ color: "var(--strong)" }}>
                {usd(c.usd)}
              </span>
            </div>
          ))}
          {t.electricity && (
            <p className="m-0 pt-3 text-[15px]" style={{ borderTop: "1px solid var(--line)" }}>
              Electricity on this computer:{" "}
              <b style={{ color: "var(--strong)" }}>
                {t.electricity.currency === "CAD" ? "CA$" : `${t.electricity.currency} `}
                {t.electricity.cost.toFixed(2)}
              </b>
              <span style={{ color: "var(--muted)" }}>
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
          <summary className="cursor-pointer text-sm" style={{ color: "var(--muted)" }}>
            The 30 days as a table
          </summary>
          <table className="mt-2 w-full text-[13.5px]">
            <tbody>
              {r.daily.map((d) => (
                <tr key={d.day} style={{ borderTop: "1px solid var(--line)" }}>
                  <td className="py-1">{d.day}</td>
                  <td className="font-mono py-1 text-right">{n(d.tokens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <section className="card grid gap-3">
        <div className="flex flex-wrap gap-2">
          {PERIODS.map(([k, label]) => (
            <button key={k} type="button" className="pill" aria-pressed={days === k} onClick={() => setDays(k)}>
              {label}
            </button>
          ))}
        </div>
        <p className="m-0 text-[15px]">
          <b className="font-cond text-[22px]" style={{ color: "var(--strong)" }}>
            {n(r.period.fresh + r.period.reused + r.period.out)}
          </b>{" "}
          tokens · {n(r.period.requests)} requests · {r.period.computeHours.toFixed(1)} h of compute
        </p>
        {r.models.map((m) => (
          <div key={m.model} className="grid gap-1 rounded-xl px-3 py-2.5" style={{ background: "var(--surface-2)" }}>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-[13px]" style={{ color: "var(--strong)" }}>
                {m.model}
              </span>
              <span className="ml-auto text-[13px]" style={{ color: "var(--muted)" }}>
                {short(m.fresh + m.reused + m.out)} tokens · {n(m.requests)} requests · {m.computeHours.toFixed(1)} h
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 text-[12.5px]" style={{ color: "var(--muted)" }}>
              {m.cloud.map((c) => (
                <span key={c.id}>
                  {r.prices?.cloud.find((x) => x.id === c.id)?.name.split(",")[0]}:{" "}
                  <b style={{ color: "var(--text)" }}>{usd(c.usd)}</b>
                </span>
              ))}
            </div>
          </div>
        ))}
      </section>

      {r.prices && (
        <details className="card">
          <summary className="font-cond cursor-pointer text-lg font-bold">
            The prices, with where they were seen
          </summary>
          <div className="grid gap-3 pt-3 text-[14px]">
            {r.prices.about && (
              <p className="m-0" style={{ color: "var(--muted)" }}>
                {r.prices.about}
              </p>
            )}
            {r.prices.cloud.map((c) => (
              <div key={c.id} className="grid gap-1">
                <b style={{ color: "var(--strong)" }}>{c.name}</b>
                {c.prices.map((p) => (
                  <p key={`${p.model}-${p.match ?? ""}`} className="m-0" style={{ color: "var(--muted)" }}>
                    {p.match ? `${p.match}: ` : ""}
                    {p.model} — in ${p.input}, cached ${p.cachedInput}, out ${p.output} per million ·{" "}
                    <a href={p.source} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                      source
                    </a>{" "}
                    ({p.seen})
                  </p>
                ))}
              </div>
            ))}
            <p className="m-0" style={{ color: "var(--muted)" }}>
              Electricity: {r.prices.electricity.watts} W ({r.prices.electricity.wattsSource}) at{" "}
              {r.prices.electricity.pricePerKwh} {r.prices.electricity.currency} per kWh ·{" "}
              <a
                href={r.prices.electricity.source}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent)" }}
              >
                source
              </a>{" "}
              ({r.prices.electricity.seen})
            </p>
          </div>
        </details>
      )}
    </main>
  );
}
