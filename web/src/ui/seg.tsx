// A view switch of two to four options as one bar (Live's Now and Activity, a quiz's length, Read and Edit): every
// option in sight, one tap to pick, the picked one raised, the bar as wide as its words. What the pick means is one
// quiet line under the bar, read with it (aria-describedby), never a second line inside an option. modes: a hunt's
// switch, its options' values on, quiet and paused, the picked one marked by a dot in its colour. The look lives in
// styles.css (.seg).
import { type ReactNode, useId } from "react";
import { cx } from "./cx.ts";

export type SegOption<V extends string> = {
  value: V;
  label: ReactNode;
  // what this option means, shown under the bar while it is the pick
  hint?: ReactNode;
};

export function Seg<V extends string>({
  label,
  options,
  value,
  onChange,
  modes = false,
}: {
  // the bar's name, read out
  label: string;
  options: SegOption<V>[];
  value: V;
  onChange: (v: V) => void;
  modes?: boolean;
}) {
  const hintId = useId();
  const hint = options.find((o) => o.value === value)?.hint;
  return (
    <div className="seg-field">
      <fieldset
        className={cx("seg", modes && "seg-modes")}
        aria-label={label}
        aria-describedby={hint ? hintId : undefined}
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            data-mode={modes ? o.value : undefined}
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </fieldset>
      {hint && (
        <p id={hintId} className="seg-hint">
          {hint}
        </p>
      )}
    </div>
  );
}
