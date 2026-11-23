// The hunt cards, the old Job Hunt and Deal Hunt's: status, group and source on top; the title with its pay or price
// in a coloured pill; where and when; the match line with its bar (a deal: where its price sits against the usual);
// the model's read (short, so it stays) and the deep check: its verdict as a chip, or the button that starts one; the
// report itself waits in the open listing. A tap anywhere opens the whole listing.
import { type ReactNode, useRef, useState } from "react";

export type Listing = {
  id: string;
  search: string;
  source: string;
  link: string;
  status: string;
  starred: number | null;
  found: string;
  score: number | null;
  match: string;
  kind: "jobs" | "deals";
  priority: boolean;
  data: Record<string, unknown>;
  deal: { median: number; p25: number; p75: number; n: number; pct: number; tier: string; under: number } | null;
  app: { state: string; reason: string } | null;
  deepVerdict: string | null;
  deepState: string | null; // the latest deep check: running, done or failed
};

export const STAGES: Record<"jobs" | "deals", { status: string; label: string; tone: string }[]> = {
  jobs: [
    { status: "new", label: "To review", tone: "tone-muted" },
    { status: "interested", label: "Interested", tone: "tone-green" },
    { status: "maybe", label: "Not sure", tone: "tone-yellow" },
    { status: "applied", label: "Applied", tone: "tone-accent" },
    { status: "interviewing", label: "Interviewing", tone: "tone-orange" },
    { status: "offer", label: "Offer", tone: "tone-green" },
    { status: "rejected", label: "Rejected", tone: "tone-red" },
    { status: "closed", label: "Closed", tone: "tone-muted" },
    { status: "fake", label: "Not real", tone: "tone-red" },
    { status: "passed", label: "Not for me", tone: "tone-muted" },
  ],
  deals: [
    { status: "new", label: "To review", tone: "tone-muted" },
    { status: "interested", label: "Interested", tone: "tone-green" },
    { status: "maybe", label: "Not sure", tone: "tone-yellow" },
    { status: "applied", label: "Contacted", tone: "tone-accent" },
    { status: "passed", label: "Not interested", tone: "tone-muted" },
    { status: "closed", label: "Sold", tone: "tone-muted" },
  ],
};
export const stageOf = (kind: "jobs" | "deals", status: string) =>
  STAGES[kind].find((s) => s.status === status) ?? { status, label: status, tone: "tone-muted" };

export const MATCH: Record<string, { label: string; tone: string }> = {
  great: { label: "Great match", tone: "tone-great" },
  good: { label: "Good match", tone: "tone-good" },
  weak: { label: "Possible match", tone: "tone-fair" },
  poor: { label: "Weak match", tone: "tone-poor" },
};
export const DEAL: Record<string, { label: string; tone: string }> = {
  great: { label: "Great deal", tone: "tone-great" },
  good: { label: "Good deal", tone: "tone-good" },
  fair: { label: "Fair price", tone: "tone-fair" },
  over: { label: "Overpriced", tone: "tone-poor" },
};
// a deep check's verdict, each in its own colour wherever it shows: go in green, think twice in orange, no in coral
export const VERDICT: Record<string, { label: string; tone: string }> = {
  apply: { label: "Apply", tone: "tone-great" },
  maybe: { label: "Maybe", tone: "tone-orange" },
  skip: { label: "Skip", tone: "tone-poor" },
  buy: { label: "Buy", tone: "tone-great" },
  negotiate: { label: "Negotiate", tone: "tone-orange" },
  unsure: { label: "Unsure", tone: "tone-muted" },
};

// a pay or price pill's colour: the match's (or the deal's) place on the money scale
const MONEY: Record<string, string> = {
  great: "great",
  good: "good",
  weak: "fair",
  fair: "fair",
  poor: "poor",
  over: "poor",
};
export const moneyColour = (tier: string | undefined) =>
  tier && MONEY[tier] ? `var(--${MONEY[tier]})` : "var(--good)";

export const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// "$124k–244k", the period named when it isn't a year
export function payOf(d: Record<string, unknown>): string {
  const lo = num(d.salaryMin);
  const hi = num(d.salaryMax);
  if (lo == null && hi == null) return "";
  const k = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v));
  const cur = str(d.salaryCurrency) === "USD" ? "US$" : "$";
  const range = lo != null && hi != null && lo !== hi ? `${k(lo)}–${k(hi)}` : k(hi ?? lo ?? 0);
  const period = str(d.salaryPeriod).toLowerCase();
  const per = period && !period.includes("year") ? `/${period.replace("ly", "").replace("dai", "day")}` : "";
  return `${cur}${range}${per}`;
}

const DAY = 86_400_000;
export function ago(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const days = Math.floor((Date.now() - t) / DAY);
  if (days <= 0) {
    const h = Math.max(1, Math.round((Date.now() - t) / 3_600_000));
    return h < 24 ? `${h} hour${h === 1 ? "" : "s"} ago` : "today";
  }
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (days < 30) return `${Math.round(days / 7)} week${Math.round(days / 7) === 1 ? "" : "s"} ago`;
  return `${Math.round(days / 30)} month${Math.round(days / 30) === 1 ? "" : "s"} ago`;
}
export const day = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

function Ring({ tone }: { tone: string }) {
  return (
    <span
      className={`${tone} inline-block h-[15px] w-[15px] shrink-0 rounded-full`}
      style={{
        border: "2.5px solid var(--tone)",
        boxShadow: "inset 0 0 0 2.5px var(--surface)",
        background: "var(--tone)",
      }}
    />
  );
}

// a 0–100 score on the money scale (coral, amber, lime, mint), the dot where it sits in its own colour
export function ScoreBar({ score }: { score: number }) {
  const at = Math.max(0, Math.min(100, score));
  const dot = moneyColour(at >= 80 ? "great" : at >= 60 ? "good" : at >= 40 ? "fair" : "poor");
  return (
    <div
      className="relative mt-1 mb-4 h-1.5 rounded-full"
      style={{
        background: "linear-gradient(90deg, var(--poor) 0%, var(--fair) 40%, var(--good) 65%, var(--great) 88%)",
      }}
    >
      <span
        className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: `${at}%`,
          background: dot,
          border: "3px solid var(--surface)",
          boxShadow: `0 0 0 1px ${dot}`,
        }}
      />
      <span
        className="font-mono absolute top-3 -translate-x-1/2 text-[10.5px]"
        style={{ left: `${at}%`, color: "var(--muted)" }}
      >
        {score}
      </span>
    </div>
  );
}

// a deal's price on a cheap-to-dear bar: the usual spread marked, the dot where this ad sits
export function PriceBar({ price, deal }: { price: number; deal: NonNullable<Listing["deal"]> }) {
  const lo = Math.min(price, deal.p25) * 0.75;
  const hi = Math.max(price, deal.p75) * 1.2;
  const at = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  return (
    <div
      className="relative mt-1 mb-5 h-1.5 rounded-full"
      style={{ background: "linear-gradient(90deg, var(--great) 0%, var(--fair) 50%, var(--poor) 100%)" }}
    >
      {[deal.p25, deal.p75].map((v) => (
        <span
          key={v}
          className="font-mono absolute top-3 -translate-x-1/2 text-[10.5px]"
          style={{ left: at(v), color: "var(--muted)" }}
        >
          ${Math.round(v)}
        </span>
      ))}
      <span
        className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: at(price),
          background: moneyColour(deal.tier),
          border: "3px solid var(--surface)",
          boxShadow: `0 0 0 1px ${moneyColour(deal.tier)}`,
        }}
      />
    </div>
  );
}

export function ReadBox({
  label,
  chip,
  tone,
  chipTone,
  children,
}: {
  label: string;
  chip?: string;
  tone?: string;
  chipTone?: string;
  children: ReactNode;
}) {
  return (
    <div className={`read-box ${tone ?? "tone-accent"} grid gap-1.5`}>
      <div className="flex items-center gap-2">
        <span className="eyebrow" style={{ color: "var(--tone)" }}>
          {label}
        </span>
        {chip && <span className={`chip ${chipTone ?? tone ?? "tone-accent"}`}>{chip}</span>}
      </div>
      <div className="text-[14.5px] leading-relaxed" style={{ color: "var(--text)" }}>
        {children}
      </div>
    </div>
  );
}

const fitTone = (fit: number) => (fit >= 7 ? "tone-great" : fit >= 4 ? "tone-fair" : "tone-poor");
const APP_CHIP: Record<string, [string, string]> = {
  sent: ["Sent", "tone-accent"],
  "not-sent": ["Not sent", "tone-orange"],
  "needs-me": ["Needs me", "tone-pink"],
  applying: ["Applying", "tone-green"],
  queued: ["Queued", "tone-muted"],
};

function Head({ l }: { l: Listing }) {
  const stage = stageOf(l.kind, l.status);
  const app = l.app && l.status === "new" ? APP_CHIP[l.app.state] : null;
  const group = str(l.data.family) || str(l.data.category);
  return (
    <div className="flex items-center gap-2">
      <span className={`chip chip-caps ${app ? app[1] : stage.tone}`}>{app ? app[0] : stage.label}</span>
      {group && <span className="eyebrow truncate">{group}</span>}
      <span className="eyebrow ml-auto truncate">{l.source.replaceAll("-", " ")}</span>
      {(l.starred === 1 || (l.kind === "jobs" && l.priority)) && <span style={{ color: "var(--yellow)" }}>★</span>}
    </div>
  );
}

// the model's read stays on the card, words and all: it is short. The deep check shows only its verdict, as a chip in
// the verdict's colour — the report waits in the open listing — or, with none yet, the blue button that starts one
function Results({ l, onDeep, busy }: { l: Listing; onDeep: () => void; busy?: string }) {
  let verdict = "";
  try {
    verdict = l.deepVerdict ? String((JSON.parse(l.deepVerdict) as { verdict?: string }).verdict ?? "") : "";
  } catch {
    verdict = "";
  }
  const v = VERDICT[verdict];
  const fit = num(l.data.fit);
  const why = str(l.data.fitWhy);
  const running = l.deepState === "running";
  return (
    <>
      {why && (
        <ReadBox
          label="Model's read"
          chip={fit != null ? `Fit ${fit}/10` : undefined}
          tone="tone-accent"
          chipTone={fit != null ? fitTone(fit) : undefined}
        >
          {why}
        </ReadBox>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {!why && fit != null && <span className={`chip ${fitTone(fit)}`}>Model's read {fit}/10</span>}
        {v && !running ? (
          <span className={`chip ${v.tone}`}>
            Deep check · <b>{v.label}</b>
          </span>
        ) : (
          <button
            type="button"
            className="btn btn-primary inline-flex items-center gap-2"
            disabled={running || busy === "deep"}
            onClick={(e) => {
              e.stopPropagation();
              onDeep();
            }}
          >
            {(running || busy === "deep") && <span className="spin" />}
            {busy === "deep"
              ? "Starting…"
              : running
                ? "Deep check running…"
                : l.deepState === "failed"
                  ? "Deep check again"
                  : "Deep check"}
          </button>
        )}
      </div>
    </>
  );
}

const BUTTON_TONE: Record<string, string> = {
  passed: "tone-red",
  maybe: "tone-yellow",
  interested: "tone-green",
  applied: "tone-accent",
  closed: "tone-muted",
};
// the stage buttons under a card: the card stays where it is, a tap here never opens the sheet
function Stages({
  l,
  onStatus,
  extra,
  busy,
}: {
  l: Listing;
  onStatus: (s: string) => void;
  extra?: ReactNode;
  busy?: string;
}) {
  const set: [string, string][] =
    l.kind === "jobs"
      ? [
          ["passed", "Not for me"],
          ["maybe", "? Not sure"],
          ["interested", "✓ Interested"],
        ]
      : [
          ["passed", "Not interested"],
          ["maybe", "? Not sure"],
          ["interested", "✓ Interested"],
          ["applied", "Contacted"],
          ["closed", "Sold"],
        ];
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the wrapper only stops the card's own tap
    <div className="flex flex-wrap gap-2 pt-1" onClick={(e) => e.stopPropagation()} onKeyDown={undefined}>
      {set.map(([s, label]) => (
        <button
          key={s}
          type="button"
          className={`btn ${BUTTON_TONE[s] ?? "tone-muted"}`}
          aria-pressed={l.status === s}
          style={{
            borderColor: `color-mix(in srgb, var(--tone) ${l.status === s ? 90 : 45}%, var(--line))`,
            color: "var(--tone)",
            background: l.status === s ? "color-mix(in srgb, var(--tone) 16%, var(--surface))" : undefined,
            fontWeight: l.status === s ? 600 : undefined,
          }}
          onClick={() => onStatus(l.status === s ? "new" : s)}
        >
          {busy === `status:${s}` && <span className="spin mr-1.5 align-[-1px]" />}
          {label}
        </button>
      ))}
      {extra}
    </div>
  );
}

// the title opens the posting or the ad itself; the rest of the card opens the whole listing
function Title({ l, text }: { l: Listing; text: string }) {
  return (
    <h3 className="font-cond m-0 text-[21px] font-bold leading-tight">
      <a
        href={l.link}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:underline"
        style={{ color: "var(--strong)", textUnderlineOffset: 3 }}
        onClick={(e) => e.stopPropagation()}
      >
        {text}
      </a>
    </h3>
  );
}

// a card that swipes: right for Interested, left for Not for me — the old Tinder-like triage. A horizontal drag past
// a third of the card decides; a short one springs back; vertical scrolling stays the page's
export function Swipe({
  children,
  onRight,
  onLeft,
  leftLabel,
}: {
  children: ReactNode;
  onRight: () => void;
  onLeft: () => void;
  leftLabel: string;
}) {
  const [dx, setDx] = useState(0);
  const [gone, setGone] = useState<0 | 1 | -1>(0);
  const start = useRef<{ x: number; y: number; id: number; dragging: boolean } | null>(null);
  const width = useRef(320);
  const reset = () => {
    start.current = null;
    setDx(0);
  };
  return (
    <div
      className="relative"
      style={{ touchAction: "pan-y" }}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if ((e.target as HTMLElement).closest("a, button, input, textarea, select")) return;
        start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, dragging: false };
        width.current = e.currentTarget.getBoundingClientRect().width;
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s || s.id !== e.pointerId) return;
        const mx = e.clientX - s.x;
        const my = e.clientY - s.y;
        if (!s.dragging) {
          if (Math.abs(my) > 12 && Math.abs(my) > Math.abs(mx)) return reset(); // a scroll, not a swipe
          if (Math.abs(mx) < 12) return;
          s.dragging = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        setDx(mx);
      }}
      onPointerUp={() => {
        const s = start.current;
        if (s?.dragging) {
          const decide = Math.abs(dx) > width.current / 3;
          if (decide) {
            setGone(dx > 0 ? 1 : -1);
            setTimeout(() => (dx > 0 ? onRight() : onLeft()), 180);
          }
        }
        reset();
      }}
      onPointerCancel={reset}
      onClickCapture={(e) => {
        // a drag never counts as a tap that opens the sheet
        if (Math.abs(dx) > 4) e.stopPropagation();
      }}
    >
      {dx !== 0 && (
        <div
          className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-2xl"
          style={{
            background:
              dx > 0
                ? "color-mix(in srgb, var(--green) 18%, transparent)"
                : "color-mix(in srgb, var(--red) 16%, transparent)",
            opacity: Math.min(1, Math.abs(dx) / (width.current / 3)),
          }}
        >
          <span className="font-cond text-2xl font-bold" style={{ color: dx > 0 ? "var(--green)" : "var(--red)" }}>
            {dx > 0 ? "✓ Interested" : leftLabel}
          </span>
        </div>
      )}
      <div
        style={{
          transform: gone
            ? `translateX(${gone * 120}%) rotate(${gone * 8}deg)`
            : `translateX(${dx}px) rotate(${dx / 40}deg)`,
          transition: start.current?.dragging ? "none" : "transform 0.2s ease",
          opacity: gone ? 0 : 1,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function JobCard({
  l,
  onOpen,
  onStatus,
  onQueue,
  onDeep,
  busy,
}: {
  l: Listing;
  onOpen: () => void;
  onStatus: (s: string) => void;
  onQueue: () => void;
  onDeep: () => void;
  busy?: string; // what this card is waiting on: status:<stage>, deep or queue
}) {
  const d = l.data;
  const pay = payOf(d);
  const m = MATCH[l.match];
  const posted = str(d.posted);
  return (
    <article
      className="card card-link grid content-start gap-3 cursor-pointer"
      aria-busy={Boolean(busy)}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
    >
      <Head l={l} />
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Title l={l} text={str(d.title)} />
          <p className="m-0 mt-1 text-[14.5px]" style={{ color: "var(--text)" }}>
            {str(d.org)}
            <span style={{ color: "var(--muted)" }}>
              {[str(d.location), str(d.workMode)].filter(Boolean).length
                ? ` · ${[str(d.location), str(d.workMode)].filter(Boolean).join(" · ")}`
                : ""}
            </span>
          </p>
        </div>
        {pay && (
          <span
            className="font-mono shrink-0 rounded-lg px-2.5 py-1.5 text-[15px] font-bold"
            style={{ background: moneyColour(l.match), color: "var(--bg)" }}
          >
            {pay}
          </span>
        )}
      </div>
      <p className="m-0 text-[13px]" style={{ color: "var(--muted)" }}>
        {posted && (
          <>
            Posted <b style={{ color: "var(--text)" }}>{ago(posted)}</b> · {day(posted)} ·{" "}
          </>
        )}
        Found <b style={{ color: "var(--text)" }}>{day(l.found)}</b>
      </p>
      {(str(d.seniority) || str(d.employment)) && (
        <div className="flex flex-wrap gap-1.5">
          {str(d.seniority) && <span className="chip tone-muted">{str(d.seniority)}</span>}
          {str(d.workMode).toLowerCase().includes("remote") && <span className="chip tone-cyan">Remote</span>}
          {str(d.employment) && !/full/i.test(str(d.employment)) && (
            <span className="chip tone-purple">{str(d.employment)}</span>
          )}
        </div>
      )}
      {m && (
        <div className="flex items-start gap-2 text-[14px]">
          <Ring tone={m.tone} />
          <span>
            <b style={{ color: "var(--strong)" }}>{m.label}</b>
            {str(d.why) && <span style={{ color: "var(--muted)" }}> · {str(d.why)}</span>}
          </span>
        </div>
      )}
      {l.score != null && <ScoreBar score={l.score} />}
      <Results l={l} onDeep={onDeep} busy={busy} />
      <Stages
        l={l}
        onStatus={onStatus}
        busy={busy}
        extra={
          l.status !== "applied" && !l.app ? (
            <button
              type="button"
              className="btn btn-primary ml-auto inline-flex items-center gap-2"
              disabled={busy === "queue"}
              onClick={onQueue}
            >
              {busy === "queue" && <span className="spin" />}
              {busy === "queue" ? "Queuing…" : "Apply"}
            </button>
          ) : null
        }
      />
    </article>
  );
}

export function DealCard({
  l,
  onOpen,
  onStatus,
  onDeep,
  busy,
}: {
  l: Listing;
  onOpen: () => void;
  onStatus: (s: string) => void;
  onDeep: () => void;
  busy?: string;
}) {
  const d = l.data;
  const price = num(d.price);
  const deal = l.deal;
  const t = deal ? DEAL[deal.tier] : null;
  const posted = str(d.posted);
  const pill = !deal ? "var(--surface-2)" : moneyColour(deal.tier);
  return (
    <article
      className="card card-link grid content-start gap-3 cursor-pointer"
      aria-busy={Boolean(busy)}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
    >
      <Head l={l} />
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Title l={l} text={str(d.title)} />
          <p className="m-0 mt-1 text-[14.5px]" style={{ color: "var(--muted)" }}>
            {str(d.location)}
          </p>
        </div>
        {price != null && (
          <span
            className="font-mono shrink-0 rounded-lg px-3 py-1.5 text-[18px] font-bold"
            style={{ background: pill, color: deal ? "var(--bg)" : "var(--strong)" }}
          >
            ${Math.round(price)}
          </span>
        )}
      </div>
      <p className="m-0 text-[13px]" style={{ color: "var(--muted)" }}>
        {posted && (
          <>
            Posted <b style={{ color: "var(--text)" }}>{ago(posted)}</b> · {day(posted)} ·{" "}
          </>
        )}
        Found <b style={{ color: "var(--text)" }}>{day(l.found)}</b>
      </p>
      {deal && t && price != null && (
        <>
          <div className="flex items-start gap-2 text-[14px]">
            <Ring tone={t.tone} />
            <span>
              <b style={{ color: "var(--strong)" }}>{t.label}</b>
              <span style={{ color: "var(--muted)" }}> · {deal.pct}% of the usual asking price</span>
            </span>
          </div>
          <PriceBar price={price} deal={deal} />
          <p className="m-0 text-[13.5px]" style={{ color: "var(--muted)" }}>
            {deal.under > 0 ? (
              <b style={{ color: "var(--green)" }}>${deal.under} under</b>
            ) : (
              <b style={{ color: "var(--red)" }}>${-deal.under} over</b>
            )}{" "}
            the usual ${Math.round(deal.median)} used, from {deal.n} listings.
          </p>
        </>
      )}
      <Results l={l} onDeep={onDeep} busy={busy} />
      <Stages l={l} onStatus={onStatus} busy={busy} />
    </article>
  );
}
