// The star on anything kept for later (a news story, a search's listing), in two looks. bare, on a card or a row: the ★
// alone at the right end of a card's top line (where Searches' cards show theirs) or of a row (a list of starred
// things), and the toggle itself: grey while off, yellow while on, no word (label is its name, read out). The pill, in a
// sheet: pressed while starred, a yellow ★ and its word, Star or Starred, beside the item's other actions (Searches'
// listing sheet). busy: a press on its way, already drawn in its new state by the caller; another press meanwhile does
// nothing (the button stays enabled, so the keyboard's focus never drops off it). hint: what a star does, on hover.
export function Star({
  on,
  busy = false,
  bare = false,
  label = "Star",
  hint,
  onPress,
}: {
  on: boolean;
  busy?: boolean;
  bare?: boolean;
  label?: string;
  hint?: string;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      className={bare ? "star-bare" : "pill"}
      aria-pressed={on}
      aria-label={bare ? label : undefined}
      title={on ? "Unstar" : hint}
      onClick={() => !busy && onPress()}
    >
      {/* bare draws its colour from its own state (styles.css, .star-bare) */}
      <span className={bare ? undefined : "text-yellow"} aria-hidden="true">
        ★
      </span>
      {!bare && (on ? "Starred" : "Star")}
    </button>
  );
}
