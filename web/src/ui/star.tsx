// The star on anything kept for later (a search's listing, a news story), in three looks. The pill: pressed while
// starred, a yellow ★ and its word, Star or Starred, beside the item's other actions (the listing sheet). bare: the ★
// alone at the right end of a card's top line, where Searches' cards show theirs, and the toggle itself: grey while
// off, yellow while on, no word (label is its name, read out). compact: the ★ alone in a pill's frame at a row's end,
// in a list of starred things. busy: a press on its way, already drawn in its new state by the caller; another press
// meanwhile does nothing (the button stays enabled, so the keyboard's focus never drops off it). hint: what a star
// does, on hover.
import { cx } from "./cx.ts";

export function Star({
  on,
  busy = false,
  compact = false,
  bare = false,
  label = "Star",
  hint,
  onPress,
}: {
  on: boolean;
  busy?: boolean;
  compact?: boolean;
  bare?: boolean;
  label?: string;
  hint?: string;
  onPress: () => void;
}) {
  const alone = compact || bare;
  return (
    <button
      type="button"
      className={bare ? "star-bare" : "pill"}
      aria-pressed={on}
      aria-label={alone ? label : undefined}
      title={on ? "Unstar" : hint}
      onClick={() => !busy && onPress()}
    >
      {/* bare draws its colour from its own state (styles.css, .star-bare) */}
      <span className={cx(!bare && (on || !compact ? "text-yellow" : "text-muted"))} aria-hidden="true">
        ★
      </span>
      {!alone && (on ? "Starred" : "Star")}
    </button>
  );
}
