// The star on anything kept for later (a search's listing, a news story): a pill pressed while starred, a yellow ★
// and its word, Star or Starred. compact: the ★ alone, in a list where a row's star is its only action; label is then
// its name, and its ★ turns grey while off (no word says so). busy: a press on its way, already drawn in its new state
// by the caller; another press meanwhile does nothing (the button stays enabled, so the keyboard's focus never drops
// off it). hint: what a star does, on hover.
export function Star({
  on,
  busy = false,
  compact = false,
  label = "Star",
  hint,
  onPress,
}: {
  on: boolean;
  busy?: boolean;
  compact?: boolean;
  label?: string;
  hint?: string;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      className="pill"
      aria-pressed={on}
      aria-label={compact ? label : undefined}
      title={on ? "Unstar" : hint}
      onClick={() => !busy && onPress()}
    >
      <span className={on || !compact ? "text-yellow" : "text-muted"} aria-hidden="true">
        ★
      </span>
      {!compact && (on ? "Starred" : "Star")}
    </button>
  );
}
