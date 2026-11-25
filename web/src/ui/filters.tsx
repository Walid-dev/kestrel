// A page's filters in one card, Searches' toolbar for every page that filters a list (Learn's packs, Applications):
// the search box, the round Reset (lit while a filter differs from how the page opens), the button that folds the
// rows away ("Filters · 2", "Hide filters"), then the rows, each its name as an eyebrow with its own fold, its pills
// beside it under a mouse (over them on touch). Folded, the card may say what is picked (folded). busy: new results
// on their way, a bar sweeping along its foot. The look lives in styles.css (.filters), Searches' own rules, the names
// in one column as wide as the widest (up to 10rem) since a row's name may be mine to choose.
import type { ReactNode } from "react";
import { cx } from "./cx.ts";
import { Field } from "./field.tsx";

export function FilterPanel({
  find,
  changed = false,
  onReset,
  fold,
  folded,
  busy = false,
  children,
}: {
  // the search box: its name read out, its words; the box shows one word (Search), which fits a phone's row
  find: { label: string; value: string; onChange: (v: string) => void; placeholder?: string };
  // a filter differs from how the page opens: Reset is lit
  changed?: boolean;
  // every filter back to the start (no Reset without it)
  onReset?: () => void;
  // the rows shown or folded away: the button names them (Filters, Packs) and counts what is picked (or what is
  // there) while folded
  fold?: { shown: boolean; onToggle: () => void; name?: string; count?: number };
  // what the folded card shows under the box: the picks, each reopening the rows
  folded?: ReactNode;
  busy?: boolean;
  // the rows (FilterRow), shown while unfolded
  children?: ReactNode;
}) {
  const name = fold?.name ?? "Filters";
  return (
    <section className="card filters" aria-busy={busy}>
      {busy && <div className="loading-bar filters-busy" aria-hidden="true" />}
      <div className="filters-top">
        <div className="filters-find">
          <Field
            label={find.label}
            value={find.value}
            placeholder={find.placeholder ?? "Search"}
            onChange={find.onChange}
          />
        </div>
        {onReset && (
          <button
            type="button"
            className="btn btn-icon filters-reset"
            disabled={!changed}
            onClick={onReset}
            aria-label="Reset the filters"
            title="Reset the filters"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 1 0 3-6.7" />
              <path d="M3 4v5h5" />
            </svg>
          </button>
        )}
        {fold && (
          <button type="button" className="btn shrink-0" aria-expanded={fold.shown} onClick={fold.onToggle}>
            {fold.shown ? `Hide ${name.toLowerCase()}` : `${name}${fold.count ? ` · ${fold.count}` : ""}`}
          </button>
        )}
      </div>
      {(!fold || fold.shown) && children && <div className="filter-rows">{children}</div>}
      {fold && !fold.shown && folded}
    </section>
  );
}

// one row of filters: its name as an eyebrow, with a ▶ that folds the row to its name and what is picked (summary);
// the pills beside it
export function FilterRow({
  label,
  summary,
  open = true,
  onToggle,
  children,
}: {
  label: string;
  // what is picked, said while the row is folded
  summary?: ReactNode;
  open?: boolean;
  // no fold without it: the name alone
  onToggle?: () => void;
  children: ReactNode;
}) {
  return (
    // under a mouse one row: the name in its own column, the pills beside it; on touch the name over its pills
    <div className={cx("filter-row", !open && "filter-row-folded")}>
      {onToggle ? (
        <button type="button" className="filter-row-name" onClick={onToggle} aria-expanded={open}>
          <span className={cx("filter-row-mark", open && "filter-row-mark-open")} aria-hidden="true">
            ▶
          </span>
          <span className="eyebrow">{label}</span>
          {!open && summary !== undefined && <span className="text-small text-ink">{summary}</span>}
        </button>
      ) : (
        <span className="filter-row-name">
          <span className="eyebrow">{label}</span>
        </span>
      )}
      {open && <div className="filter-row-pills">{children}</div>}
    </div>
  );
}
