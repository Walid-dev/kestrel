// One list for every kind of listing (src/shared/kinds.ts: a kind is data, its fields, filters and sorts). Three parts:
// useKind holds what is picked (the words, each filter's pill, the sort) and gives the rows that pass, in order;
// KindFilters is Searches' filter card drawn from the kind (a row of pills per filter, each pill with how many rows it
// would leave under the others; the yes-or-no filters share one row, All first; the sorts last); KindList draws the
// rows: a Card each on a phone (the kind's title, its figure, its facts, and a slot for the page's own lines), and from
// 64rem one table in a card (.data-table): the first column the page's (a name and what goes under it), then the
// columns it names, units in the heads, the best value in each number column marked, "—" for an unknown and "?" for an
// unsure value, both grey. A column marked wide shows from 80rem only; under that width it folds, with the page's own
// detail, into the row's open part (the ▶ at the row's end). Shopping's products and offers use it, the homes hunt
// next.
import { Fragment, type ReactNode, useState } from "react";
import {
  type Field,
  filterRows,
  formatValue,
  knownValue,
  type ListKind,
  type Picked,
  pillCounts,
  type Row,
  sortRows,
  type Value,
} from "../../../src/shared/kinds.ts";
import { Card } from "./card.tsx";
import { cx } from "./cx.ts";
import { FilterPanel, FilterRow } from "./filters.tsx";
import { Pills, type Tone } from "./pills.tsx";

const ALL = "__all";
const fieldOf = (kind: ListKind, key: string) => kind.fields.find((f) => f.key === key);

export type KindState = ReturnType<typeof useKind>;

// what is picked on a kind's list, and the rows that pass it in the sort's order. find: the words a row is found by
export function useKind(
  kind: ListKind,
  rows: Row[],
  start: { picked?: Picked; sort?: string; find?: (row: Row) => string } = {},
) {
  const first = start.sort ?? kind.sorts[0]?.key ?? "";
  const [picked, setPicked] = useState<Picked>(start.picked ?? {});
  const [sort, setSort] = useState(first);
  const [words, setWords] = useState("");
  const needle = words.trim().toLowerCase();
  const find = start.find;
  const found = needle && find ? rows.filter((r) => find(r).toLowerCase().includes(needle)) : rows;
  const shown = sortRows(kind, filterRows(kind, found, picked), sort);
  const set = (p: Picked) => Object.entries(p).filter(([, v]) => v != null && v !== "").length;
  return {
    kind,
    picked,
    pick: (key: string, value: string | null) => setPicked((p) => ({ ...p, [key]: value })),
    setPicked,
    sort,
    setSort,
    words,
    setWords,
    // the rows the words find, before the filters: each pill counts among them
    found,
    shown,
    // how many filters are picked, for a folded card's button
    count: set(picked),
    changed: needle !== "" || set(picked) !== set(start.picked ?? {}) || sort !== first,
    reset: () => {
      setPicked(start.picked ?? {});
      setSort(first);
      setWords("");
    },
  };
}

// the filter card from a kind: the words, a row per filter (the yes-or-no ones together, All first), the sorts
export function KindFilters({
  state,
  findLabel,
  sorts = true,
  fold,
  folded = false,
}: {
  state: KindState;
  // the search box's name, read out ("Search the products")
  findLabel: string;
  // the sort row (a list whose order is its meaning, as offers by total, can leave it out)
  sorts?: boolean;
  // the rows fold away behind a button, as Searches' card does; folded: they start folded (a long list of criteria)
  fold?: boolean;
  folded?: boolean;
}) {
  const { kind } = state;
  const [shown, setShown] = useState(!folded);
  const flags = kind.filters.filter((f) => f.how === "flag");
  const rows = kind.filters
    .filter((f) => f.how !== "flag")
    .map((f) => ({ f, pills: pillCounts(kind, state.found, state.picked, f.key) }))
    // a row with nothing to choose (every value the same, under three numbers to step) says nothing
    .filter(({ pills }) => pills.length > 2 || (pills.length === 2 && pills[1].count !== pills[0].count));
  const on = flags.filter((f) => state.picked[f.key]).map((f) => f.key);
  const withoutFlags = Object.fromEntries(
    Object.entries(state.picked).filter(([k]) => !flags.some((f) => f.key === k)),
  );
  return (
    <FilterPanel
      find={{ label: findLabel, value: state.words, onChange: state.setWords }}
      changed={state.changed}
      onReset={state.reset}
      fold={fold ? { shown, onToggle: () => setShown(!shown), count: state.count } : undefined}
    >
      {flags.length > 0 && (
        <FilterRow label="Show">
          <Pills
            label="Show"
            multiple
            options={[
              { value: ALL, label: "All", count: filterRows(kind, state.found, withoutFlags).length },
              ...flags.map((f) => ({
                value: f.key,
                label: f.label,
                count: filterRows(kind, state.found, { ...state.picked, [f.key]: "yes" }).length,
              })),
            ]}
            value={on.length ? on : [ALL]}
            onChange={(next) => {
              // the pill pressed is the one that changed: All clears the yes-or-no filters, any other turns itself on
              // or off
              const was = on.length ? on : [ALL];
              const pressed = [...next.filter((v) => !was.includes(v)), ...was.filter((v) => !next.includes(v))][0];
              state.setPicked((p) => ({
                ...p,
                ...Object.fromEntries(
                  flags.map((f) => [
                    f.key,
                    pressed === ALL || pressed === undefined
                      ? null
                      : f.key === pressed
                        ? p[f.key]
                          ? null
                          : "yes"
                        : (p[f.key] ?? null),
                  ]),
                ),
              }));
            }}
          />
        </FilterRow>
      )}
      {rows.map(({ f, pills }) => (
        <FilterRow key={f.key} label={f.label}>
          <Pills
            label={f.label}
            options={pills.map((p) => ({ value: p.value ?? ALL, label: p.label, count: p.count }))}
            value={state.picked[f.key] ?? ALL}
            onChange={(v) => state.pick(f.key, v === ALL ? null : v)}
          />
        </FilterRow>
      ))}
      {sorts && kind.sorts.length > 1 && (
        <FilterRow label="Sort">
          <Pills
            label="Sort"
            options={kind.sorts.map((s) => ({ value: s.key, label: s.label }))}
            value={state.sort}
            onChange={state.setSort}
          />
        </FilterRow>
      )}
    </FilterPanel>
  );
}

// the best value of a number column among the rows (two known values at least): the field's better way
function bestOf(field: Field | undefined, rows: Row[]): number | null {
  if (!field?.better || !["number", "score", "money"].includes(field.type)) return null;
  const known = rows.map((r) => knownValue(r, field.key)).filter((v): v is number => typeof v === "number");
  if (known.length < 2 || new Set(known).size < 2) return null;
  return field.better === "lower" ? Math.min(...known) : Math.max(...known);
}

// a value as a cell or a fact says it: "—" for an unknown, the value with a "?" for an unsure one, both grey
export function KindValue({
  kind,
  row,
  field,
  unit = true,
}: {
  kind: ListKind;
  row: Row;
  field: string;
  // the unit after the value; a table's cell leaves it to its column's head
  unit?: boolean;
}) {
  const known = fieldOf(kind, field);
  const f = known && !unit ? { ...known, unit: undefined } : known;
  const v: Value = row.values[field] ?? null;
  if (v === null || (Array.isArray(v) && v.length === 0)) return <span className="text-muted">—</span>;
  const text = formatValue(f, v, kind.currency);
  if (row.unsure?.includes(field))
    return (
      <span
        className="text-muted"
        title="Unsure: its quote isn't in this product's part of the page, so it never ranks"
      >
        {text}?
      </span>
    );
  return <>{text}</>;
}

// a fact as a card's line says it: its name, its value bold in mono, its unit after it (none for an unknown)
export function KindFact({ kind, row, field, label }: { kind: ListKind; row: Row; field: string; label?: ReactNode }) {
  const f = fieldOf(kind, field);
  const known = row.values[field] !== null && row.values[field] !== undefined;
  return (
    <>
      {label ?? f?.label ?? field}{" "}
      <b className="font-mono font-medium text-ink">
        <KindValue kind={kind} row={row} field={field} unit={false} />
      </b>
      {known && f?.unit && typeof row.values[field] === "number" ? ` ${f.unit}` : ""}
    </>
  );
}

export type KindColumn = {
  field: string;
  // the head (the field's label unless said), its unit added
  label?: ReactNode;
  // from 80rem only; under that, the row's open part holds it
  wide?: boolean;
  // the page's own cell (a price pill in its verdict's tone)
  cell?: (row: Row) => ReactNode;
  // its cells are words (read from the left, in the words' font): a column the kind has no field for says so
  words?: boolean;
};

export function KindList({
  kind,
  rows,
  label,
  first,
  columns,
  meta,
  figure,
  lines,
  facts,
  detail,
  actions,
  onOpen,
  onRemove,
  removeLabel,
  tone,
}: {
  kind: ListKind;
  // the rows to draw, already filtered and sorted (useKind's shown)
  rows: Row[];
  // the list's name, read out
  label: string;
  // the table's first column: its head, and each row's cell (a name that opens it, what goes under)
  first: { label: ReactNode; cell: (row: Row) => ReactNode };
  columns: KindColumn[];
  // a card's top line, its figure (the kind's own, formatted, unless said), its own lines, its facts (the kind's
  // facts unless said)
  meta?: (row: Row) => ReactNode;
  figure?: (row: Row) => ReactNode;
  lines?: (row: Row) => ReactNode;
  facts?: string[];
  // what a row's open part holds besides the columns that didn't fit
  detail?: (row: Row) => ReactNode;
  // a card's buttons, last (an offer's Open the store)
  actions?: (row: Row) => ReactNode;
  // a card's title opens it; the ✕ deletes it, the page asking first
  onOpen?: (row: Row) => void;
  onRemove?: (row: Row) => void;
  removeLabel?: (row: Row) => string;
  // a card's edge, for what matters now
  tone?: (row: Row) => Tone | undefined;
}) {
  const [open, setOpen] = useState<string[]>([]);
  const flip = (id: string) => setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  const factFields = facts ?? kind.facts ?? [];
  const wide = columns.filter((c) => c.wide);
  const best = new Map(columns.map((c) => [c.field, bestOf(fieldOf(kind, c.field), rows)]));
  // a column of words (a yes or no, a state, a name) reads from the left in the words' font; numbers stay right, in mono
  const words = (c: KindColumn) => {
    const t = fieldOf(kind, c.field)?.type;
    return c.words ?? (t === "bool" || t === "enum" || t === "text" || t === "list" || t === "date");
  };
  const head = (c: KindColumn) => {
    const f = fieldOf(kind, c.field);
    return (
      <>
        {c.label ?? f?.label ?? c.field}
        {f?.unit && <span className="kind-unit"> ({f.unit})</span>}
      </>
    );
  };
  const cell = (c: KindColumn, r: Row) => {
    if (c.cell) return c.cell(r);
    const b = best.get(c.field);
    const v = knownValue(r, c.field);
    const top = b !== null && b !== undefined && v === b;
    return top ? (
      <span className="kind-best" title="The best in this column">
        <KindValue kind={kind} row={r} field={c.field} unit={false} />
      </span>
    ) : (
      <KindValue kind={kind} row={r} field={c.field} unit={false} />
    );
  };
  return (
    <>
      {/* a phone: one card a row */}
      <ul className="kind-cards" aria-label={label}>
        {rows.map((r) => {
          const fig = figure ? figure(r) : kind.figure ? <KindValue kind={kind} row={r} field={kind.figure} /> : null;
          return (
            <li key={r.id} className="grid">
              <Card
                title={formatValue(fieldOf(kind, kind.title), r.values[kind.title] ?? null, kind.currency)}
                tone={tone?.(r)}
                meta={meta?.(r)}
                figure={fig}
                onOpen={onOpen ? () => onOpen(r) : undefined}
                onRemove={onRemove ? () => onRemove(r) : undefined}
                removeLabel={removeLabel?.(r)}
                actions={actions?.(r)}
              >
                {lines?.(r)}
                {factFields.length > 0 && (
                  <p className="m-0 text-small">
                    {factFields.map((k, i) => (
                      <Fragment key={k}>
                        {i > 0 && " · "}
                        <KindFact kind={kind} row={r} field={k} />
                      </Fragment>
                    ))}
                  </p>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
      {/* a computer: one table, the columns that don't fit folding into each row's open part */}
      <div className="card kind-table-card">
        <table className="data-table kind-table" aria-label={label}>
          <thead>
            <tr>
              <th scope="col" className="eyebrow">
                {first.label}
              </th>
              {columns.map((c) => (
                <th
                  key={c.field}
                  scope="col"
                  className={cx("eyebrow", c.wide && "kind-wide", words(c) && "kind-words")}
                >
                  {head(c)}
                </th>
              ))}
              {(detail || wide.length > 0) && (
                <th scope="col" className="kind-fold-head">
                  <span className="sr-only">More</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isOpen = open.includes(r.id);
              const span = columns.length + 2;
              return (
                <Fragment key={r.id}>
                  <tr className={cx(isOpen && "kind-row-open")}>
                    <td>{first.cell(r)}</td>
                    {columns.map((c) => (
                      <td key={c.field} className={cx(c.wide && "kind-wide", words(c) && "kind-words")}>
                        {cell(c, r)}
                      </td>
                    ))}
                    {(detail || wide.length > 0) && (
                      <td className="kind-fold">
                        <button
                          type="button"
                          className="btn btn-icon btn-quiet kind-fold-btn"
                          aria-expanded={isOpen}
                          aria-label={isOpen ? "Fold away" : "More"}
                          title={isOpen ? "Fold away" : "More"}
                          onClick={() => flip(r.id)}
                        >
                          <span className={cx("kind-fold-mark", isOpen && "kind-fold-mark-open")} aria-hidden="true">
                            ▶
                          </span>
                        </button>
                      </td>
                    )}
                  </tr>
                  {isOpen && (
                    <tr className="kind-detail-row">
                      <td colSpan={span}>
                        <div className="kind-detail">
                          {wide.length > 0 && (
                            <p className="kind-detail-narrow m-0 text-small text-muted">
                              {wide.map((c, i) => (
                                <Fragment key={c.field}>
                                  {i > 0 && " · "}
                                  <KindFact kind={kind} row={r} field={c.field} label={c.label} />
                                </Fragment>
                              ))}
                            </p>
                          )}
                          {detail?.(r)}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
