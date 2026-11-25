// A choice shown whole, as pills instead of a dropdown: every option in sight, one tap to pick. The filter pill's
// look (quiet until picked; a dot in its tone; its count beside), in a fieldset whose legend names the group for
// screen readers, each pill a button with aria-pressed, the way the app's .seg already works. An action pill (Show all)
// is a plain button among them, in the accent, so it is never read as one more choice. Two options or thirty:
// the row wraps on a phone, never scrolls sideways, and a long name wraps inside its pill.
import type { ReactNode } from "react";
import { toggle } from "./logic.ts";

export type Tone =
  | "accent"
  | "green"
  | "yellow"
  | "orange"
  | "red"
  | "purple"
  | "pink"
  | "cyan"
  | "indigo"
  | "teal"
  | "magenta"
  | "muted"
  | "great"
  | "good"
  | "fair"
  | "poor";

export type PillOption<V extends string> = {
  value: V;
  label: ReactNode;
  count?: number;
  tone?: Tone;
  // a few quiet words after the name (a lesson's number, a size)
  hint?: string;
  // an action among the choices ("Show all 25"): a plain button that does this, never picked, so it wraps with the
  // pills it acts on instead of sitting apart
  onPress?: () => void;
};

type Base<V extends string> = {
  // the group's name: read out always, shown as an eyebrow over the pills when showLabel is set
  label: string;
  showLabel?: boolean;
  options: PillOption<V>[];
  // the id of a hint beside the group, read out with it (the way a field's hint is)
  describedBy?: string;
};
type One<V extends string> = Base<V> & { multiple?: false; value: V | null; onChange: (v: V) => void };
type Many<V extends string> = Base<V> & { multiple: true; value: V[]; onChange: (v: V[]) => void };

export function Pills<V extends string>(props: One<V> | Many<V>) {
  const { label, showLabel = false, options, describedBy } = props;
  const picked = (v: V) => (props.multiple ? props.value.includes(v) : props.value === v);
  const pick = (v: V) => {
    if (props.multiple)
      props.onChange(
        toggle(
          options.map((o) => o.value),
          props.value,
          v,
        ),
      );
    else props.onChange(v);
  };
  return (
    <fieldset className="pills" aria-describedby={describedBy}>
      <legend className={showLabel ? "eyebrow pills-legend" : "sr-only"}>{label}</legend>
      <div className="pills-row">
        {options.map((o) =>
          o.onPress ? (
            <button key={o.value} type="button" className="pill pill-action" onClick={o.onPress}>
              <span className="pill-name">{o.label}</span>
            </button>
          ) : (
            <button
              key={o.value}
              type="button"
              className={`pill ${o.tone ? `tone-${o.tone}` : ""}`}
              aria-pressed={picked(o.value)}
              onClick={() => pick(o.value)}
            >
              {o.tone && <span className="dot" aria-hidden="true" />}
              <span className="pill-name">{o.label}</span>
              {o.hint && <small>{o.hint}</small>}
              {o.count !== undefined && <b>{o.count}</b>}
            </button>
          ),
        )}
      </div>
    </fieldset>
  );
}
