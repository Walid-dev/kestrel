// Shopping: my wants, each compared and priced on its own. The head says what is open, watched and when prices were
// last read; the box under it takes a new want in plain words ("a quiet blender for smoothies"), with a budget and a
// note in its fold (the note is never searched). Then the figures, Searches' filter card (the words, the status, the
// kind of product) and the want cards at the Searches standard: the state chip (at work green and pulsing, failed
// red), when it last changed, the want's words, its best price now as the pill (toned by the deal's verdict), the top
// picks and the reach, Run again, and the ✕ that deletes after Confirm. The rail keeps the watched products and the
// latest pings; the foot says how kestrel ranks, and keeps the deleted wants with Restore.
import { useState } from "react";
import type { WantSummary } from "../../../src/shared/shopping.ts";
import { Card } from "../ui/card.tsx";
import { useConfirm } from "../ui/confirm.tsx";
import { EmptyState } from "../ui/empty.tsx";
import { Field } from "../ui/field.tsx";
import { Figure, Figures } from "../ui/figures.tsx";
import { FilterPanel, FilterRow } from "../ui/filters.tsx";
import { List, Row } from "../ui/list.tsx";
import { Page } from "../ui/page.tsx";
import { Pills } from "../ui/pills.tsx";
import { RailPart, WithRail } from "../ui/rail.tsx";
import { SectionHead } from "../ui/section.tsx";
import { ago, doors, MARK, money, plural, sentence, useChange, useShopping, when, working } from "./data.ts";
import { Price, RunAgain, StateChip } from "./parts.tsx";

// the status row: what I still need (the page opens on it), what kestrel watches, what I bought or passed on
const STATUSES = [
  { value: "all", label: "All", title: "All wants" },
  { value: "open", label: "Open", title: "Open" },
  { value: "watching", label: "Watching", title: "Watching", tone: "yellow" },
  { value: "bought", label: "Bought", title: "Bought", tone: "green" },
  { value: "passed", label: "Passed", title: "Passed", tone: "muted" },
] as const;
type Status = (typeof STATUSES)[number]["value"];

// a budget as I type it: whole dollars, the rest of the characters dropped
const dollars = (s: string) => s.replace(/[^\d]/g, "").slice(0, 7);

export function Shopping() {
  const home = useShopping();
  const d = home.data;
  const sure = useConfirm();
  const [words, setWords] = useState("");
  const [budget, setBudget] = useState("");
  const [note, setNote] = useState("");
  const add = useChange(doors.add, () => {
    setWords("");
    setBudget("");
    setNote("");
  });
  const [find, setFind] = useState("");
  const [status, setStatus] = useState<Status>("open");
  const [kind, setKind] = useState("all");
  const [rowsOpen, setRowsOpen] = useState(true);
  const run = useChange(doors.run);
  const remove = useChange(doors.removeWant);
  const restore = useChange(doors.restoreWant);

  const wants = d?.wants ?? [];
  const watched = new Set((d?.watching ?? []).map((w) => w.want));
  const needle = find.trim().toLowerCase();
  const byWords = (w: WantSummary) =>
    !needle || [w.words, w.categoryName, ...w.picks.map((p) => p.name)].join(" ").toLowerCase().includes(needle);
  const byStatus = (s: Status) => (w: WantSummary) =>
    s === "all" ? true : s === "watching" ? watched.has(w.id) : w.status === s;
  const byKind = (k: string) => (w: WantSummary) => k === "all" || w.category === k;
  // each pill's count under the other filters, as Searches' pills count
  const kinds = [...new Map(wants.filter((w) => w.category).map((w) => [w.category, w.categoryName])).entries()];
  const shown = wants.filter((w) => byWords(w) && byStatus(status)(w) && byKind(kind)(w));
  const statusPick = STATUSES.find((s) => s.value === status) ?? STATUSES[1];
  const atWork = wants.filter((w) => w.state === "running").length;
  const queued = wants.filter((w) => w.state === "queued").length;
  const changed = needle !== "" || status !== "open" || kind !== "all";
  const failed = [home, add, run, remove, restore].find((x) => x.isError);

  const send = () =>
    add.mutate({ words: words.trim(), budget: budget ? Number(budget) : null, note: note.trim() || undefined });
  const drop = async (w: WantSummary) => {
    const yes = await sure({
      title: `Delete “${w.words}”?`,
      body: "Its products, offers and price history go with it. Restore brings it all back, from this page's foot.",
      yes: "Delete",
      danger: true,
    });
    if (yes) remove.mutate(w.id);
  };

  return (
    <Page
      app="Shopping"
      eyebrow="To buy"
      title="Shopping"
      line={
        d &&
        (wants.length ? (
          <>
            <b className="font-mono text-ink">{d.figures.wants}</b> open ·{" "}
            <b className="font-mono text-ink">{d.figures.watching}</b> watched
            {d.lastRead && (
              <>
                {" "}
                · prices read <b className="text-ink">{ago(d.lastRead)}</b>
                {ago(d.lastRead) === "now" ? "" : " ago"}
              </>
            )}
          </>
        ) : (
          "Nothing to buy yet."
        ))
      }
    >
      <WithRail
        label="The watched products and the latest pings"
        rail={
          <>
            <RailPart id="shop-watching" title="Watching" count={d?.watching.length ?? 0}>
              {d && d.watching.length === 0 && (
                <p className="m-0 text-small text-muted">
                  Nothing watched. Watch a product from its sheet: kestrel re-reads its prices and pings at my target.
                </p>
              )}
              {d && d.watching.length > 0 && (
                <List label="Watched products">
                  {d.watching.map((w) => (
                    <Row
                      key={w.product}
                      to={`/shopping/${encodeURIComponent(w.want)}?product=${encodeURIComponent(w.product)}`}
                      title={<span className="block truncate">{w.name}</span>}
                      line={
                        <>
                          {w.target !== null ? (
                            <>
                              Target <span className="font-mono">{money(w.target, d.currency)}</span> ·{" "}
                            </>
                          ) : (
                            ""
                          )}
                          until {new Date(w.until).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </>
                      }
                      end={<Price cents={w.price} currency={d.currency} verdict={w.verdict} />}
                    />
                  ))}
                </List>
              )}
            </RailPart>
            {d && d.pings.length > 0 && (
              <RailPart id="shop-pings" title="Latest pings" count={d.pings.length}>
                <List label="Latest pings">
                  {d.pings.map((p) => (
                    <Row
                      key={`${p.want}-${p.at}`}
                      to={`/shopping/${encodeURIComponent(p.want)}${p.product ? `?product=${encodeURIComponent(p.product)}` : ""}`}
                      title={<span className="block truncate">{p.text}</span>}
                      line={<span title={when(p.at)}>{ago(p.at)} ago</span>}
                    />
                  ))}
                </List>
              </RailPart>
            )}
          </>
        }
      >
        {/* a new want: its words, Enter adds it; the budget and the note in the fold under it */}
        <div className="grid gap-2">
          <Field
            label="What do you need?"
            placeholder="What do you need? A quiet blender…"
            value={words}
            onChange={setWords}
            onSend={send}
            busy={add.isPending}
            sendLabel="Add"
            hint="Enter adds it · kestrel compares what testers measured, then finds where to buy"
          />
          <details className="shop-more">
            <summary className="disclosure">
              Budget and note
              {(budget || note) && (
                <span className="font-mono text-small text-muted">
                  {[budget && `$${budget}`, note && "a note"].filter(Boolean).join(" · ")}
                </span>
              )}
            </summary>
            <div className="shop-more-rows">
              <label className="grid content-start gap-1">
                <span className="text-small font-semibold text-strong">Budget</span>
                <input
                  className="input font-mono"
                  inputMode="numeric"
                  placeholder="600"
                  value={budget}
                  onChange={(e) => setBudget(dollars(e.target.value))}
                />
                <span className="text-small text-muted">whole dollars; a product over it is set aside</span>
              </label>
              <label className="grid content-start gap-1">
                <span className="text-small font-semibold text-strong">Note</span>
                <input
                  className="input"
                  placeholder="The hall is narrow"
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <span className="text-small text-muted">for kestrel only: never in a search</span>
              </label>
            </div>
          </details>
          {add.isError && <p className="m-0 text-detail text-red">{sentence((add.error as Error).message)}</p>}
        </div>

        {d && wants.length > 0 && (
          <Figures label="My wants and their prices">
            <Figure
              label="Wants"
              tone="violet"
              value={d.figures.wants}
              quiet={!d.figures.wants}
              pulse={atWork > 0}
              note={atWork > 0 ? `${atWork} at work` : queued > 0 ? `${queued} queued` : undefined}
              hint="Wants still open"
            />
            <Figure
              label="Watching"
              tone="yellow"
              value={d.figures.watching}
              quiet={!d.figures.watching}
              hint="Products whose prices kestrel re-reads on a schedule"
            />
            <Figure
              label="Price drops"
              tone="good"
              value={d.figures.drops}
              quiet={!d.figures.drops}
              note="7 days"
              hint="Products whose best price fell in the last 7 days"
            />
            <Figure
              label="At target"
              tone="great"
              value={d.figures.atTarget}
              quiet={!d.figures.atTarget}
              hint="Products at or under the target price I set"
            />
          </Figures>
        )}

        {d && wants.length > 0 && (
          <FilterPanel
            find={{ label: "Search the wants and their picks", value: find, onChange: setFind }}
            changed={changed}
            onReset={() => {
              setFind("");
              setStatus("open");
              setKind("all");
            }}
            fold={{
              shown: rowsOpen,
              onToggle: () => setRowsOpen(!rowsOpen),
              count: (status !== "open" ? 1 : 0) + (kind !== "all" ? 1 : 0),
            }}
          >
            <FilterRow label="Status">
              <Pills
                label="Status"
                options={STATUSES.map((s) => ({
                  value: s.value,
                  label: s.label,
                  tone: "tone" in s ? s.tone : undefined,
                  count: wants.filter((w) => byWords(w) && byKind(kind)(w) && byStatus(s.value)(w)).length,
                }))}
                value={status}
                onChange={setStatus}
              />
            </FilterRow>
            {kinds.length > 1 && (
              <FilterRow label="Kind">
                <Pills
                  label="Kind"
                  options={[
                    {
                      value: "all",
                      label: "All",
                      count: wants.filter((w) => byWords(w) && byStatus(status)(w)).length,
                    },
                    ...kinds.map(([key, name]) => ({
                      value: key,
                      label: name,
                      count: wants.filter((w) => byWords(w) && byStatus(status)(w) && byKind(key)(w)).length,
                    })),
                  ]}
                  value={kind}
                  onChange={setKind}
                />
              </FilterRow>
            )}
          </FilterPanel>
        )}

        {failed && failed !== add && (
          <p className="m-0 text-detail text-red" role="alert">
            {sentence((failed.error as Error).message)}
          </p>
        )}

        {d && wants.length === 0 && (
          <EmptyState
            title="No wants yet."
            line="Write what you need above. kestrel reads the sites that test that kind of product, compares the best, then finds where to buy and whether the price is good."
          />
        )}
        {d && wants.length > 0 && (
          <section className="grid gap-3" aria-labelledby="shop-wants">
            <SectionHead id="shop-wants" title={statusPick.title} count={shown.length} />
            {shown.length === 0 && (
              <EmptyState
                title="Nothing here."
                line={needle ? "Other words may find some." : "Another status or kind may show some."}
              />
            )}
            <div className="grid gap-3 md:grid-cols-2">
              {shown.map((w) => (
                <WantCard
                  key={w.id}
                  w={w}
                  watched={watched.has(w.id)}
                  onRun={() => run.mutate(w.id)}
                  starting={run.isPending && run.variables === w.id}
                  onRemove={() => drop(w)}
                  removing={remove.isPending && remove.variables === w.id}
                />
              ))}
            </div>
          </section>
        )}
      </WithRail>

      {/* the page's foot: how kestrel ranks, printed whole, and the deleted wants with their way back */}
      {d && (
        <div className="grid gap-1">
          <details>
            <summary className="disclosure">How kestrel ranks</summary>
            <p className="m-0 max-w-[72ch] pb-2 text-small text-muted">{d.rule}</p>
          </details>
          {d.deleted.length > 0 && (
            <details>
              <summary className="disclosure">
                Deleted <span className="font-mono text-small text-muted">{d.deleted.length}</span>
              </summary>
              <List label="Deleted wants">
                {d.deleted.map((g) => (
                  <Row
                    key={g.id}
                    title={<span className="block truncate">{g.words}</span>}
                    line={<span title={when(g.at)}>Deleted {ago(g.at)} ago</span>}
                    end={
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={restore.isPending}
                        onClick={() => restore.mutate(g.id)}
                      >
                        Restore
                      </button>
                    }
                  />
                ))}
              </List>
            </details>
          )}
        </div>
      )}
    </Page>
  );
}

// one want, at the Searches standard: its state and kind on top with when it last changed, its words, its best price
// now as the pill, the top picks and the reach under them, Run again last
function WantCard({
  w,
  watched,
  onRun,
  starting,
  onRemove,
  removing,
}: {
  w: WantSummary;
  watched: boolean;
  onRun: () => void;
  starting: boolean;
  onRemove: () => void;
  removing: boolean;
}) {
  const busy = working(w.state);
  const mark = w.status === "open" ? null : MARK[w.status];
  const picks = w.picks.slice(0, 2);
  return (
    <Card
      tone={w.state === "running" ? "green" : undefined}
      busy={removing}
      title={w.words}
      to={`/shopping/${encodeURIComponent(w.id)}`}
      meta={
        <>
          <StateChip state={w.state} />
          {mark && <span className={`chip chip-caps tone-${mark.tone}`}>{mark.label}</span>}
          {watched && <span className="chip chip-caps tone-yellow">Watching</span>}
          {w.categoryName && <span className="min-w-0 truncate text-small text-muted">{w.categoryName}</span>}
        </>
      }
      end={<span title={when(w.updated)}>{ago(w.updated)}</span>}
      figure={
        w.best && (
          <Price
            cents={w.best.price}
            currency={w.currency}
            verdict={w.best.verdict}
            title={`${w.best.name} at ${w.best.store}`}
          />
        )
      }
      onRemove={busy ? undefined : onRemove}
      removeLabel={`Delete “${w.words}”`}
      actions={<RunAgain small state={w.state} pending={starting} onRun={onRun} />}
    >
      {w.state === "running" && <p className="m-0">{w.step || "Starting"}…</p>}
      {w.state === "queued" && <p className="m-0">Waiting its turn: one want runs at a time.</p>}
      {w.state === "failed" && w.error && <p className="m-0 text-red">{sentence(w.error)}</p>}
      {picks.length > 0 && (
        <p className="m-0 truncate">
          {picks.map((p, i) => (
            <span key={`${p.label}-${p.name}`}>
              {i > 0 && " · "}
              {p.label}: <b className="font-medium text-ink">{p.name}</b>
            </span>
          ))}
        </p>
      )}
      {w.compared > 0 && (
        <p className="m-0 text-small">
          <b className="font-mono text-ink">{w.compared}</b> compared ·{" "}
          <b className="font-mono text-ink">{w.storesRead}</b> {plural(w.storesRead, "store")} read
          {w.blocked > 0 && (
            <>
              {" "}
              · <b className="font-mono text-ink">{w.blocked}</b> blocked
            </>
          )}
          {w.links > 0 && (
            <>
              {" "}
              · <b className="font-mono text-ink">{w.links}</b> {plural(w.links, "link")}
            </>
          )}
        </p>
      )}
    </Card>
  );
}
