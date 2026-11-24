// The hunt cards, the old Job Hunt and Deal Hunt's: status, group and source on top; the title with its pay or price
// in a coloured pill; where and when; the match line with its bar (a deal: where its price sits against the usual);
// the model's read (short, so it stays) and the deep check: its verdict as a chip, or the button that starts one; the
// report itself waits in the open listing. A tap anywhere opens the whole listing.
import { type CSSProperties, type ReactNode, useRef, useState } from "react";
import { cx } from "../ui/cx.ts";
import { Pills, type Tone } from "../ui/pills.tsx";

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

export const STAGES: Record<"jobs" | "deals", { status: string; label: string; tone: Tone }[]> = {
  jobs: [
    { status: "new", label: "To review", tone: "muted" },
    { status: "interested", label: "Interested", tone: "green" },
    { status: "maybe", label: "Not sure", tone: "yellow" },
    { status: "applied", label: "Applied", tone: "accent" },
    { status: "interviewing", label: "Interviewing", tone: "orange" },
    { status: "offer", label: "Offer", tone: "green" },
    { status: "rejected", label: "Rejected", tone: "red" },
    { status: "closed", label: "Closed", tone: "muted" },
    { status: "fake", label: "Not real", tone: "red" },
    { status: "passed", label: "Not for me", tone: "muted" },
  ],
  deals: [
    { status: "new", label: "To review", tone: "muted" },
    { status: "interested", label: "Interested", tone: "green" },
    { status: "maybe", label: "Not sure", tone: "yellow" },
    { status: "applied", label: "Contacted", tone: "accent" },
    { status: "passed", label: "Not interested", tone: "muted" },
    { status: "closed", label: "Sold", tone: "muted" },
  ],
};
export const stageOf = (kind: "jobs" | "deals", status: string) =>
  STAGES[kind].find((s) => s.status === status) ?? { status, label: status, tone: "muted" };

export const MATCH: Record<string, { label: string; tone: Tone }> = {
  great: { label: "Great match", tone: "great" },
  good: { label: "Good match", tone: "good" },
  weak: { label: "Possible match", tone: "fair" },
  poor: { label: "Weak match", tone: "poor" },
};
export const DEAL: Record<string, { label: string; tone: Tone }> = {
  great: { label: "Great deal", tone: "great" },
  good: { label: "Good deal", tone: "good" },
  fair: { label: "Fair price", tone: "fair" },
  over: { label: "Overpriced", tone: "poor" },
};
// a deep check's verdict, each in its own colour wherever it shows: go in green, think twice in orange, no in coral
export const VERDICT: Record<string, { label: string; tone: Tone }> = {
  apply: { label: "Apply", tone: "great" },
  maybe: { label: "Maybe", tone: "orange" },
  skip: { label: "Skip", tone: "poor" },
  buy: { label: "Buy", tone: "great" },
  negotiate: { label: "Negotiate", tone: "orange" },
  unsure: { label: "Unsure", tone: "muted" },
};

// a pay or price pill's colour: the match's (or the deal's) place on the money scale, as its tone
const MONEY: Record<string, Tone> = {
  great: "great",
  good: "good",
  weak: "fair",
  fair: "fair",
  poor: "poor",
  over: "poor",
};
export const moneyTone = (tier: string | undefined): string => `tone-${(tier && MONEY[tier]) || "good"}`;
// where a dot sits on a bar: data, so it reaches the class as a variable
const at = (left: string) => ({ "--at": left }) as CSSProperties;

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

function Ring({ tone }: { tone: Tone }) {
  return <span className={`match-ring tone-${tone}`} aria-hidden="true" />;
}

const scoreTone = (n: number) => (n >= 80 ? "great" : n >= 60 ? "good" : n >= 40 ? "fair" : "poor");

// a 0–100 score on the money scale (coral, amber, lime, mint), the dot where it sits in its own colour
export function ScoreBar({ score }: { score: number }) {
  const where = at(`${Math.max(0, Math.min(100, score))}%`);
  return (
    <div className="money-bar money-bar-score">
      <span className={`money-bar-dot tone-${scoreTone(score)}`} style={where} />
      <span className="money-bar-mark" style={where}>
        {score}
      </span>
    </div>
  );
}

// a deal's price on a cheap-to-dear bar: the usual spread marked, the dot where this ad sits
export function PriceBar({ price, deal }: { price: number; deal: NonNullable<Listing["deal"]> }) {
  const lo = Math.min(price, deal.p25) * 0.75;
  const hi = Math.max(price, deal.p75) * 1.2;
  const place = (v: number) => at(`${((v - lo) / (hi - lo)) * 100}%`);
  return (
    <div className="money-bar money-bar-price">
      {[deal.p25, deal.p75].map((v) => (
        <span key={v} className="money-bar-mark" style={place(v)}>
          ${Math.round(v)}
        </span>
      ))}
      <span className={cx("money-bar-dot", moneyTone(deal.tier))} style={place(price)} />
    </div>
  );
}

// a box for a model's words (its read of a listing): an eyebrow in its tone, a chip beside it, the words under
export function ReadBox({
  label,
  chip,
  tone = "accent",
  chipTone,
  children,
}: {
  label: string;
  chip?: string;
  tone?: Tone;
  chipTone?: Tone;
  children: ReactNode;
}) {
  return (
    <div className={`read-box tone-${tone} grid gap-1.5`}>
      <div className="flex items-center gap-2">
        <span className={`eyebrow tone-${tone}`}>{label}</span>
        {chip && <span className={`chip tone-${chipTone ?? tone}`}>{chip}</span>}
      </div>
      <div className="text-detail text-ink">{children}</div>
    </div>
  );
}

const fitTone = (fit: number): Tone => (fit >= 7 ? "great" : fit >= 4 ? "fair" : "poor");
const APP_CHIP: Record<string, [string, Tone]> = {
  sent: ["Sent", "accent"],
  "not-sent": ["Not sent", "orange"],
  "needs-me": ["Needs me", "pink"],
  applying: ["Applying", "green"],
  queued: ["Queued", "muted"],
};
// a source as one name everywhere, on the cards and in the filter: "made-up-board" reads "Made up board"
export const sourceName = (s: string) => {
  const words = s.replaceAll("-", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

// the Apply button, or what became of it once pressed: queued, applying, waiting on me, sent; one not sent can go again
export function ApplyButton({ state, onQueue, pending }: { state?: string; onQueue: () => void; pending: boolean }) {
  const chip = state && state !== "not-sent" ? APP_CHIP[state] : null;
  if (chip && !pending)
    return (
      <span className={`chip chip-caps ml-auto inline-flex items-center gap-1.5 tone-${chip[1]}`}>
        {state === "applying" && <span className="dot tone-green pulse" />}
        {chip[0]}
      </span>
    );
  return (
    <button
      type="button"
      className="btn btn-primary ml-auto inline-flex items-center gap-2"
      disabled={pending}
      onClick={onQueue}
    >
      {pending && <span className="spin" />}
      {pending ? "Queuing…" : state === "not-sent" ? "Apply again" : "Apply"}
    </button>
  );
}

function Head({ l }: { l: Listing }) {
  const stage = stageOf(l.kind, l.status);
  const app = l.app && l.status === "new" ? APP_CHIP[l.app.state] : null;
  const group = str(l.data.family) || str(l.data.category);
  return (
    <div className="flex items-center gap-2 text-small text-muted">
      <span className={`chip chip-caps tone-${app ? app[1] : stage.tone}`}>{app ? app[0] : stage.label}</span>
      {group && <span className="min-w-0 truncate">{group}</span>}
      <span className="ml-auto min-w-0 truncate">{sourceName(l.source)}</span>
      {(l.starred === 1 || (l.kind === "jobs" && l.priority)) && (
        <span className="text-yellow" title="Starred">
          ★
        </span>
      )}
    </div>
  );
}

// the model's read stays on the card, words and all: it is short. The deep check shows only its verdict, as a chip in
// the verdict's colour — the report waits in the open listing — or, with none yet, the quiet button that starts one
// (Apply is the card's one main button)
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
          chipTone={fit != null ? fitTone(fit) : undefined}
        >
          {why}
        </ReadBox>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {!why && fit != null && <span className={`chip tone-${fitTone(fit)}`}>Model's read {fit}/10</span>}
        {v && !running ? (
          <span className={`chip tone-${v.tone}`}>
            Deep check · <b>{v.label}</b>
          </span>
        ) : (
          <button
            type="button"
            className="btn inline-flex items-center gap-2"
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

// the stages a card can be marked with, each in its colour: a choice, as pills; the picked one again sets it back
const MARKS: Record<"jobs" | "deals", [string, string, Tone][]> = {
  jobs: [
    ["passed", "Not for me", "red"],
    ["maybe", "Not sure", "yellow"],
    ["interested", "Interested", "green"],
  ],
  deals: [
    ["passed", "Not interested", "red"],
    ["maybe", "Not sure", "yellow"],
    ["interested", "Interested", "green"],
    ["applied", "Contacted", "accent"],
    ["closed", "Sold", "muted"],
  ],
};
// the stage pills under a card: the card stays where it is, a tap here never opens the sheet
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
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the wrapper only stops the card's own tap
    <div className="flex flex-wrap items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()} onKeyDown={undefined}>
      <Pills
        label="Mark it"
        options={MARKS[l.kind].map(([s, label, tone]) => ({
          value: s,
          tone,
          label:
            busy === `status:${s}` ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="spin" /> {label}
              </span>
            ) : (
              label
            ),
        }))}
        value={l.status}
        onChange={(s) => onStatus(l.status === s ? "new" : s)}
      />
      {extra}
    </div>
  );
}

// the title opens the posting or the ad itself; the rest of the card opens the whole listing
function Title({ l, text }: { l: Listing; text: string }) {
  return (
    <h3 className="font-cond m-0 text-head font-bold">
      <a
        href={l.link}
        target="_blank"
        rel="noopener noreferrer"
        className="text-strong underline-offset-3 hover:underline"
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
      className="relative touch-pan-y"
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
          className={cx(
            "pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-2xl",
            dx > 0 ? "bg-green/18 text-green" : "bg-red/16 text-red",
          )}
          style={{ opacity: Math.min(1, Math.abs(dx) / (width.current / 3)) }}
        >
          <span className="font-cond text-lead font-bold">{dx > 0 ? "Interested" : leftLabel}</span>
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

// when it was posted and found, the words that matter in the ink
function When({ l }: { l: Listing }) {
  const posted = str(l.data.posted);
  return (
    <p className="m-0 text-small text-muted">
      {posted && (
        <>
          Posted <b className="text-ink">{ago(posted)}</b> · {day(posted)} ·{" "}
        </>
      )}
      Found <b className="text-ink">{day(l.found)}</b>
    </p>
  );
}

// the match (or the deal) in a line: its ring, its name, and why
function MatchLine({ tone, label, why }: { tone: Tone; label: string; why: string }) {
  return (
    <div className="flex items-start gap-2 text-detail">
      <Ring tone={tone} />
      <span>
        <b className="text-strong">{label}</b>
        {why && <span className="text-muted"> · {why}</span>}
      </span>
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
  const where = [str(d.location), str(d.workMode)].filter(Boolean);
  return (
    // the whole card opens the listing and its title opens the posting, so it is the .card ground itself, not Card
    // (Card's title would open the listing instead of the posting)
    <article
      className="card card-link card-stack cursor-pointer"
      aria-busy={Boolean(busy)}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
    >
      <Head l={l} />
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Title l={l} text={str(d.title)} />
          <p className="m-0 mt-1 text-detail text-ink">
            {str(d.org)}
            {where.length > 0 && (
              <span className="text-muted">
                {str(d.org) && " · "}
                {where.join(" · ")}
              </span>
            )}
          </p>
        </div>
        {pay && <span className={cx("money text-body", moneyTone(l.match))}>{pay}</span>}
      </div>
      <When l={l} />
      {(str(d.seniority) || str(d.employment)) && (
        <div className="flex flex-wrap gap-1.5">
          {str(d.seniority) && <span className="chip tone-muted">{str(d.seniority)}</span>}
          {str(d.workMode).toLowerCase().includes("remote") && <span className="chip tone-cyan">Remote</span>}
          {str(d.employment) && !/full/i.test(str(d.employment)) && (
            <span className="chip tone-purple">{str(d.employment)}</span>
          )}
        </div>
      )}
      {m && <MatchLine tone={m.tone} label={m.label} why={str(d.why)} />}
      {l.score != null && <ScoreBar score={l.score} />}
      <Results l={l} onDeep={onDeep} busy={busy} />
      <Stages
        l={l}
        onStatus={onStatus}
        busy={busy}
        extra={
          l.status !== "applied" ? (
            <ApplyButton state={l.app?.state} onQueue={onQueue} pending={busy === "queue"} />
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
  return (
    <article
      className="card card-link card-stack cursor-pointer"
      aria-busy={Boolean(busy)}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
    >
      <Head l={l} />
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Title l={l} text={str(d.title)} />
          <p className="m-0 mt-1 text-detail text-muted">{str(d.location)}</p>
        </div>
        {price != null && (
          <span className={cx("money text-head", deal && moneyTone(deal.tier))}>${Math.round(price)}</span>
        )}
      </div>
      <When l={l} />
      {deal && t && price != null && (
        <>
          <MatchLine tone={t.tone} label={t.label} why={`${deal.pct}% of the usual asking price`} />
          <PriceBar price={price} deal={deal} />
          <p className="m-0 text-small text-muted">
            {deal.under > 0 ? (
              <b className="text-green">${deal.under} under</b>
            ) : (
              <b className="text-red">${-deal.under} over</b>
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
