// The small parts Shopping's pages share: a want's state chip, Run again (busy from the press until the run ends), a
// product's label chips (all in Shopping's colour, best overall filled; thin evidence orange) and a price pill toned
// by the deal's verdict.
import type { Label, VerdictWord, WantState } from "../../../src/shared/shopping.ts";
import { VERDICT_WORDS } from "../../../src/shared/shopping.ts";
import { cx } from "../ui/cx.ts";
import { LABEL_TONE, money, moneyClass, STATE } from "./data.ts";

// a want's state: at work green with its dot pulsing, failed red, waiting and done grey
export function StateChip({ state }: { state: WantState }) {
  const s = STATE[state];
  return (
    <span className={`chip chip-caps tone-${s.tone}`}>
      {state === "running" && <span className="dot pulse" aria-hidden="true" />}
      {s.label}
    </span>
  );
}

// Run again: from the press until the run ends it can't be pressed and says so (a spinner and Working…, or Queued
// while it waits its turn). Both labels are always there, one unseen, so the button never changes width (Searches'
// Search now rules, styles.css .search-now)
export function RunAgain({
  state,
  pending,
  onRun,
  small = false,
}: {
  state: WantState;
  pending: boolean;
  onRun: () => void;
  small?: boolean;
}) {
  const busy = pending || state === "queued" || state === "running";
  return (
    <button
      type="button"
      className={cx("btn search-now", small && "btn-sm")}
      disabled={busy}
      aria-busy={busy}
      onClick={onRun}
    >
      <span className={cx(busy && "invisible")}>Run again</span>
      <span className={cx(!busy && "invisible")} aria-hidden={!busy}>
        <span className="spin" aria-hidden="true" />
        <span>
          {state === "running" ? "Working" : "Queued"}
          <span className="search-now-dots">…</span>
        </span>
      </span>
    </button>
  );
}

// a product's labels: one meaning (a role kestrel gave), so one colour; best overall is the filled one
export function LabelChips({ labels, thin = false }: { labels: Label[]; thin?: boolean }) {
  if (!labels.length && !thin) return null;
  return (
    <>
      {labels.map((l) => (
        <span key={l.text} className={cx("chip chip-caps", `tone-${LABEL_TONE}`, l.key === "overall" && "chip-fill")}>
          {l.text}
        </span>
      ))}
      {thin && (
        <span className="chip chip-caps tone-orange" title="One independent source only">
          Thin evidence
        </span>
      )}
    </>
  );
}

// a price, in the verdict's tone (the one price map), its verdict's word on hover
export function Price({
  cents,
  currency,
  verdict,
  title,
}: {
  cents: number | null;
  currency: string;
  verdict?: VerdictWord | null;
  title?: string;
}) {
  if (cents === null) return null;
  return (
    <span className={moneyClass(verdict)} title={title ?? (verdict ? VERDICT_WORDS[verdict] : undefined)}>
      {money(cents, currency)}
    </span>
  );
}
