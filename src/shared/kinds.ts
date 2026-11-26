// One list engine for every kind of listing (v1.2). A kind is data: its fields (each with a type, a unit and which way
// is better), its filters, its sorts and what its card shows. These pure functions filter, count and sort the rows of
// any kind, and one list part on the web draws them. Shopping's products (a kind per want, its fields that want's
// criteria) and its offers (a fixed kind) are the first users; the homes hunt is next, as one more kind. Nothing from
// Node and no zod here: the web imports it.

export type FieldType = "number" | "score" | "money" | "bool" | "enum" | "text" | "list" | "date";
export type Field = {
  key: string;
  label: string;
  type: FieldType;
  unit?: string; // "dB", "min", "kg"; money is in cents, in the kind's currency
  better?: "higher" | "lower"; // a number, score or money: which way is better
};
// a row's value for a field: a list holds several (a product's labels, the stores that sell it)
export type Value = number | string | boolean | string[] | null;
// unsure: the fields whose value is shown with a "?" and never used to filter or rank
export type Row = { id: string; values: Record<string, Value>; unsure?: string[] };

// a filter is one row of pills over one field:
// - is: the value equals the pill's (a list holds it); pills from a fixed list, else from the values present
// - atLeast, atMost: a number at least (at most) the pill's step; steps from the values present (numberSteps)
// - flag: the value is true; one pill
export type KindFilter = {
  key: string;
  label: string;
  field: string;
  how: "is" | "atLeast" | "atMost" | "flag";
  pills?: { value: string; label: string }[];
};
export type KindSort = { key: string; label: string; field: string; dir?: "asc" | "desc" };
export type ListKind = {
  key: string;
  name: string;
  fields: Field[];
  filters: KindFilter[];
  sorts: KindSort[];
  title: string; // the field a card's title shows
  figure?: string; // the field shown as the card's figure (a price)
  facts?: string[]; // the fields a card shows as facts
  currency?: string; // what a money field counts in
};
// each filter's picked pill, by the filter's key; none (or All) is no filter
export type Picked = Record<string, string | null | undefined>;
export type Pill = { value: string | null; label: string; count: number };

const fieldOf = (kind: ListKind, key: string): Field | undefined => kind.fields.find((f) => f.key === key);

// a value the engine may use: there, and not marked unsure
export function knownValue(row: Row, field: string): Value {
  const v = row.values[field];
  if (v === undefined || v === null || row.unsure?.includes(field)) return null;
  return v;
}

const asNumber = (v: Value): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// one row against one filter's picked value
export function passes(row: Row, filter: KindFilter, value: string | null | undefined): boolean {
  if (value === null || value === undefined || value === "") return true;
  const v = knownValue(row, filter.field);
  if (filter.how === "flag") return v === true;
  if (filter.how === "is") {
    if (Array.isArray(v)) return v.includes(value);
    return v !== null && String(v) === value;
  }
  const n = asNumber(v);
  const step = Number(value);
  if (n === null || !Number.isFinite(step)) return false; // an unknown never passes a threshold
  return filter.how === "atLeast" ? n >= step : n <= step;
}

// the rows that pass every picked filter; skip leaves one filter out (its own pills count under the others)
export function filterRows(kind: ListKind, rows: Row[], picked: Picked, skip?: string): Row[] {
  const active = kind.filters.filter((f) => f.key !== skip && picked[f.key] != null && picked[f.key] !== "");
  return rows.filter((r) => active.every((f) => passes(r, f, picked[f.key])));
}

// steps of two significant digits, rounded the way that keeps the step inside the values (down for "at least")
const nice = (n: number, up: boolean): number => {
  if (n === 0) return 0;
  const unit = 10 ** (Math.floor(Math.log10(Math.abs(n))) - 1);
  return (up ? Math.ceil(n / unit) : Math.floor(n / unit)) * unit;
};
// two or three steps from a column's values: "at least" ones when higher is better, "at most" when lower is. A step
// every row passes says nothing, so it goes; under three different values there is nothing to step
export function numberSteps(values: number[], better: "higher" | "lower" = "higher"): number[] {
  const sorted = [...new Set(values.filter((v) => Number.isFinite(v)))].sort((a, b) => a - b);
  if (sorted.length < 3) return [];
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
  const up = better === "lower";
  const steps = [0.25, 0.5, 0.75].map((q) => Number(nice(at(q), up).toPrecision(12)));
  const useful = steps.filter((s) => (up ? s < sorted[sorted.length - 1] : s > sorted[0]));
  return [...new Set(useful)].sort((a, b) => (up ? b - a : a - b));
}

// a value as a pill or a cell says it: money in its currency, a number with its unit
export function formatValue(field: Field | undefined, v: Value, currency = "CAD"): string {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (field?.type === "money" && typeof v === "number") return formatMoney(v, currency);
  if (typeof v === "number") return `${Number(v.toPrecision(6))}${field?.unit ? ` ${field.unit}` : ""}`;
  return String(v);
}

// cents as a price: whole dollars when there are no cents ($449), else two places ($449.99)
export function formatMoney(cents: number, currency = "CAD"): string {
  const sign = currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";
  const whole = cents % 100 === 0;
  const n = (cents / 100).toLocaleString("en-CA", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
  return `${cents < 0 ? "-" : ""}${sign}${n.replace(/^-/, "")}`;
}

// a filter's pills, each with how many rows it would show under the other filters picked; All first
export function pillCounts(kind: ListKind, rows: Row[], picked: Picked, filterKey: string): Pill[] {
  const filter = kind.filters.find((f) => f.key === filterKey);
  if (!filter) return [];
  const others = filterRows(kind, rows, picked, filterKey);
  const field = fieldOf(kind, filter.field);
  const count = (value: string) => others.filter((r) => passes(r, filter, value)).length;
  const all: Pill = { value: null, label: "All", count: others.length };
  if (filter.how === "flag") return [all, { value: "yes", label: filter.label, count: count("yes") }];
  if (filter.pills)
    return [all, ...filter.pills.map((p) => ({ value: p.value, label: p.label, count: count(p.value) }))];
  if (filter.how === "is") {
    const seen = new Set<string>();
    for (const r of rows) {
      const v = knownValue(r, filter.field);
      for (const x of Array.isArray(v) ? v : v === null ? [] : [String(v)]) seen.add(x);
    }
    return [all, ...[...seen].sort().map((v) => ({ value: v, label: v, count: count(v) }))];
  }
  const values = rows.map((r) => asNumber(knownValue(r, filter.field))).filter((n): n is number => n !== null);
  const steps = numberSteps(values, filter.how === "atMost" ? "lower" : "higher");
  const sign = filter.how === "atLeast" ? "≥" : "≤";
  return [
    all,
    ...steps.map((s) => ({
      value: String(s),
      label: `${sign} ${formatValue(field, s, kind.currency)}`,
      count: count(String(s)),
    })),
  ];
}

// the rows in a sort's order: its direction, else the field's better way first; an unknown or unsure value always
// last, whatever the direction; ties keep the order they came in
export function sortRows(kind: ListKind, rows: Row[], sortKey: string, dir?: "asc" | "desc"): Row[] {
  const sort = kind.sorts.find((s) => s.key === sortKey);
  if (!sort) return rows;
  const field = fieldOf(kind, sort.field);
  const way = dir ?? sort.dir ?? (field?.better === "lower" || field?.type === "text" ? "asc" : "desc");
  const sign = way === "asc" ? 1 : -1;
  return rows
    .map((r, i) => ({ r, i, v: knownValue(r, sort.field) }))
    .sort((a, b) => {
      if (a.v === null || b.v === null) return a.v === null && b.v === null ? a.i - b.i : a.v === null ? 1 : -1;
      const x = typeof a.v === "boolean" ? Number(a.v) : Array.isArray(a.v) ? a.v.length : a.v;
      const y = typeof b.v === "boolean" ? Number(b.v) : Array.isArray(b.v) ? b.v.length : b.v;
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return c === 0 ? a.i - b.i : c * sign;
    })
    .map((x) => x.r);
}
