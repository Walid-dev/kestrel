// A product's sheet: the wide Dialog, its name kept on top with the ✕ while it scrolls. First its labels, the model
// sold here and its price; the reasons, each with its sources as quiet links, the trade-off against the best overall,
// who it's not for; the deal (its word as the chip, its line, the price over time as a small line with the regular
// price dashed and my target, the stores' policies, the outside price histories), and the readings under it; the
// offers on the shared list with the offer kind, then the stores that hold no price, each saying why (blocked, a link,
// another product's page); each criterion's value with its source; the pros, the cons, who should skip it. Then my
// marks: the star, Bought or Passed, a target price, and the watch (how long, how often, a return to stock). At the
// foot a quiet red Delete on the left (after Confirm), the best store, and Watch, the sheet's one filled button. A
// deleted product says so first, reads as it was with nothing to change, and offers Restore in Watch's place.
import { useEffect, useState } from "react";
import type { Row as KindRow } from "../../../src/shared/kinds.ts";
import {
  DATA_METHODS,
  type Mark,
  OFFER_KIND,
  type OfferView,
  type Said,
  type SourceRef,
  VERDICT_WORDS,
  type WantView,
  type Watch,
} from "../../../src/shared/shopping.ts";
import { useConfirm } from "../ui/confirm.tsx";
import { cx } from "../ui/cx.ts";
import { Dialog } from "../ui/dialog.tsx";
import { KindList } from "../ui/kind-list.tsx";
import { List, Row } from "../ui/list.tsx";
import { Pills } from "../ui/pills.tsx";
import { PriceLine } from "../ui/price-line.tsx";
import { Seg } from "../ui/seg.tsx";
import { Star } from "../ui/star.tsx";
import {
  agoWords,
  day,
  doors,
  MARK,
  money,
  plural,
  priceTone,
  type Reading,
  sentence,
  useChange,
  useHistory,
  useProduct,
  when,
  working,
} from "./data.ts";
import { LabelChips, Price } from "./parts.tsx";

const FOR = [
  { value: "7", label: "1 week" },
  { value: "14", label: "2 weeks" },
  { value: "30", label: "1 month" },
  { value: "90", label: "3 months" },
] as const;
const EVERY = [
  { value: "4", label: "4 h" },
  { value: "12", label: "12 h" },
  { value: "24", label: "A day" },
] as const;
type Days = (typeof FOR)[number]["value"];
type Hours = (typeof EVERY)[number]["value"];
// a watch's length as one of the four: the nearest to what it was set for
const daysOf = (w: Watch): Days => {
  const d = (Date.parse(w.until) - Date.parse(w.began)) / 86_400_000;
  return FOR.reduce((a, b) => (Math.abs(Number(b.value) - d) < Math.abs(Number(a.value) - d) ? b : a)).value;
};

// a store that holds no price, in words: why it is only a link
const WHY: Record<Exclude<OfferView["read"], "ok">, string> = {
  blocked: "Blocked",
  unreadable: "No price on its page",
  link: "A link",
  mismatch: "Another product",
  unsearched: "Not searched",
};

// the lowest price kestrel had read across the stores at each reading, from the page's data only (never a price read
// from the words), sold new and not out of stock: the line the deal is judged on
export function lowestOverTime(readings: Reading[]): { at: string; value: number }[] {
  const latest = new Map<string, number | null>();
  const points: { at: string; value: number }[] = [];
  for (const r of readings) {
    if (!DATA_METHODS.includes(r.method as OfferView["method"]) || r.condition !== "new") continue;
    latest.set(r.offer, r.stock === "out" ? null : r.price);
    const now = [...latest.values()].filter((v): v is number => v !== null);
    if (!now.length) continue;
    const value = Math.min(...now);
    // a reading that changes nothing still marks a day read, so the line knows its span
    points.push({ at: r.at, value });
  }
  return points;
}

export function ProductSheet({ id, v, onClose }: { id: string; v: WantView; onClose: () => void }) {
  const q = useProduct(id);
  const p = q.data;
  const gone = p?.deleted ?? null;
  const history = useHistory(id, Boolean(p) && !gone);
  const sure = useConfirm();
  const mark = useChange(doors.markProduct);
  const watch = useChange(doors.watch);
  const unwatch = useChange(doors.unwatch);
  const remove = useChange(doors.removeProduct);
  const restore = useChange(doors.restoreProduct);
  const find = useChange(doors.findOffers);
  const [days, setDays] = useState<Days>("14");
  const [every, setEvery] = useState<Hours>("24");
  const [stock, setStock] = useState(true);
  const [target, setTarget] = useState("");
  // the watch's settings and the target open on what is saved
  useEffect(() => {
    if (!p) return;
    if (p.watch) {
      setDays(daysOf(p.watch));
      setEvery(String(p.watch.everyHours) as Hours);
      setStock(p.watch.stock);
    }
    setTarget(p.target === null ? "" : String(p.target / 100));
  }, [p]);
  const failed = [q, mark, watch, unwatch, remove, restore, find].find((m) => m.isError);

  if (!p)
    return (
      <Dialog
        open
        onClose={onClose}
        wide
        title={q.isError ? "This product didn't open" : "Opening…"}
        actions={
          q.isError ? (
            <button type="button" className="btn" onClick={onClose}>
              Close
            </button>
          ) : undefined
        }
      >
        {q.isError && (
          <p className="m-0 text-detail text-muted">
            {(q.error as Error).message === "404"
              ? "It isn't in this want any more."
              : sentence((q.error as Error).message)}
          </p>
        )}
      </Dialog>
    );

  const sourceOf = (ref: string) => v.sources.find((s) => s.ref === ref);
  const readings = history.data?.readings ?? [];
  const line = lowestOverTime(readings);
  const tone = priceTone(p.verdict?.word);
  const read = p.offers.filter((o) => o.read === "ok");
  const rest = p.offers.filter((o) => o.read !== "ok");
  const criteria = [...(v.need?.criteria ?? [])].sort((a, b) => b.weight - a.weight);
  const targetCents = target.trim() === "" ? null : Math.round(Number(target.replace(/[^\d.]/g, "")) * 100);
  const targetOk = targetCents === null || (Number.isFinite(targetCents) && targetCents >= 1);
  const runs = working(v.state);
  const saveWatch = () =>
    watch.mutate({ id: p.id, days: Number(days), everyHours: Number(every) as Watch["everyHours"], stock });

  return (
    <Dialog
      open
      onClose={onClose}
      wide
      busy={remove.isPending || restore.isPending}
      eyebrow={[v.categoryName, p.models[0] && `sold here as ${p.models[0]}`].filter(Boolean).join(" · ")}
      title={<span className="listing-head">{p.name}</span>}
      actions={
        <>
          {!gone && (
            <button
              type="button"
              className="btn btn-quiet btn-danger mr-auto"
              disabled={remove.isPending}
              onClick={async () => {
                if (
                  await sure({
                    title: `Delete ${p.name}?`,
                    body: "It leaves this want's lists, and Run again never brings it back. Restore it here, or from the list's foot.",
                    yes: "Delete",
                    danger: true,
                  })
                )
                  remove.mutate(p.id);
              }}
            >
              Delete
            </button>
          )}
          {p.best && (
            <a
              href={p.best.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cx("btn shop-sheet-store", gone && "btn-quiet mr-auto")}
              title={`Open ${p.best.storeName}`}
            >
              <span className="truncate">{shortStore(p.best.storeName)}</span> ↗
            </a>
          )}
          {gone ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={restore.isPending}
              onClick={() => restore.mutate(p.id)}
            >
              Restore
            </button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={watch.isPending} onClick={saveWatch}>
              {watch.isPending ? "Saving…" : p.watch ? "Save watch" : "Watch"}
            </button>
          )}
        </>
      }
    >
      <div className="shop-sheet">
        {/* deleted: said first, on an inner block; the product reads as it was, and nothing on it changes */}
        {gone && (
          <p className="inner m-0 text-detail">
            <b className="text-strong">Deleted</b> {day(gone.at)}, {agoWords(gone.at)}: it left this want's lists, and
            Run again never brings it back.
          </p>
        )}
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <LabelChips labels={p.labels} thin={p.evidence.thin} />
            {p.status !== "open" && (
              <span className={`chip chip-caps tone-${MARK[p.status].tone}`}>{MARK[p.status].label}</span>
            )}
            {p.out && <span className="chip chip-caps tone-muted">{p.out}</span>}
          </div>
          <p className="m-0 text-detail text-muted">
            {p.best ? (
              <>
                <Price cents={p.best.total} currency={v.currency} verdict={p.verdict?.word} /> at{" "}
                <b className="font-medium text-ink">{p.best.storeName}</b> ·{" "}
              </>
            ) : p.usual !== null ? (
              <>
                A source says <b className="font-mono font-medium text-ink">{money(p.usual, v.currency)}</b> ·{" "}
              </>
            ) : null}
            <b className="font-mono font-medium text-ink">{p.reach.read}</b> {plural(p.reach.read, "store")} read
            {p.reach.links > 0 && (
              <>
                {" "}
                · <b className="font-mono font-medium text-ink">{p.reach.links}</b> {plural(p.reach.links, "link")}
              </>
            )}
            {p.models.length > 1 && <> · also sold as {p.models.slice(1).join(", ")}</>}
          </p>
        </div>

        {(p.words.why.length > 0 || p.words.tradeoff || p.words.notFor) && (
          <section className="grid gap-1.5" aria-label="Why">
            {p.words.why.map((s) => (
              <Sentence key={s.text} said={s} sourceOf={sourceOf} />
            ))}
            {p.words.tradeoff && (
              <Sentence said={p.words.tradeoff} sourceOf={sourceOf} lead="Against the best overall:" />
            )}
            {p.words.notFor && <Sentence said={p.words.notFor} sourceOf={sourceOf} muted />}
          </section>
        )}

        {/* the deal: its word and line, the price over time, the policies; then the readings themselves */}
        {p.verdict ? (
          <section className={cx("read-box grid gap-2", tone && `tone-${tone}`)} aria-label="The deal">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cx("eyebrow", tone && `tone-${tone}`)}>The deal</span>
              <span className={`chip tone-${tone ?? "muted"}`}>{VERDICT_WORDS[p.verdict.word]}</span>
            </div>
            <p className="m-0 text-detail text-ink">{p.verdict.line}</p>
            {line.length > 0 && (
              <div className="grid gap-1">
                <span className="eyebrow">The lowest price read · {spanOf(line)}</span>
                <PriceLine
                  label={`The lowest price read, over ${spanOf(line)}`}
                  points={line}
                  regular={p.best?.regular ?? null}
                  target={p.target}
                  tone={tone}
                  format={(c) => money(c, v.currency)}
                  until={new Date().toISOString()}
                />
              </div>
            )}
            {p.verdict.policies && <p className="m-0 text-small text-muted">{p.verdict.policies}</p>}
            {readings.length > 0 && <Readings readings={readings} currency={v.currency} />}
          </section>
        ) : (
          !gone && (
            <p className="inner m-0 text-detail text-muted">
              No verified price yet, so no verdict: a price from the store's own page data comes first.
            </p>
          )
        )}

        {/* the outside price histories, under the deal's box: a quiet link reads 4.5:1 on the sheet's ground, not on
            the box's sunk one */}
        {p.verdict && p.verdict.links.length > 0 && (
          <p className="-mt-2 m-0 text-small text-muted">
            Its history elsewhere:{" "}
            {p.verdict.links.map((l, i) => (
              <span key={l.url}>
                {i > 0 && <span className="cite-sep"> · </span>}
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="cite">
                  {l.label}
                </a>
              </span>
            ))}
          </p>
        )}

        {/* the offers: the read prices on the shared list, then the stores that hold no price, each saying why */}
        <section className="grid gap-2" aria-labelledby="sheet-offers">
          <h3 id="sheet-offers" className="m-0 font-cond text-head">
            Where to buy <span className="font-mono text-small font-normal text-muted">{read.length}</span>
          </h3>
          {read.length > 0 && <OfferList offers={read} currency={v.currency} />}
          {rest.length > 0 && (
            <List label="Stores without a price">
              {rest.map((o) => (
                <Row
                  key={o.id}
                  href={o.url}
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      <span>{o.storeName}</span>
                      <span className={`chip chip-caps tone-${o.read === "blocked" ? "orange" : "muted"}`}>
                        {WHY[o.read as Exclude<OfferView["read"], "ok">]}
                      </span>
                    </span>
                  }
                  line={<span className="block truncate">{sentence(o.why)}</span>}
                />
              ))}
            </List>
          )}
          {!p.offers.length && <p className="m-0 text-detail text-muted">No store looked at yet.</p>}
          {!gone && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-sm"
                disabled={find.isPending || runs}
                title="Search the stores for it again: the want runs while it does"
                onClick={() => find.mutate(p.id)}
              >
                {find.isPending || runs ? "Working…" : p.offers.length ? "Look again" : "Find offers"}
              </button>
              <span className="text-small text-muted">
                {v.read ? "Prices come from each store's own page data." : "Store reading is off: stores are links."}
              </span>
            </div>
          )}
        </section>

        {criteria.length > 0 && (
          <section className="grid gap-2" aria-labelledby="sheet-criteria">
            <h3 id="sheet-criteria" className="m-0 font-cond text-head">
              What the sources measured
            </h3>
            <div className="card shop-sheet-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="eyebrow">Criterion</th>
                    <th className="eyebrow">Value</th>
                    <th className="eyebrow kind-words">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {criteria.map((c) => {
                    const f = p.facts[c.key];
                    const s = f ? sourceOf(f.ref) : undefined;
                    return (
                      <tr key={c.key}>
                        <td>
                          {c.label}
                          {f?.others?.length ? (
                            <span className="block text-small text-muted">
                              {f.others
                                .map(
                                  (o) =>
                                    `${sourceOf(o.ref)?.host ?? o.ref}: ${shown(o.v)}${o.unit ? ` ${o.unit}` : ""}`,
                                )
                                .join(" · ")}
                            </span>
                          ) : null}
                        </td>
                        <td className={cx(f?.unsure && "text-muted")}>
                          {f ? (
                            <span
                              title={
                                f.unsure
                                  ? "Unsure: its quote isn't in this product's part of the page, so it never ranks"
                                  : undefined
                              }
                            >
                              {shown(f.v)}
                              {f.unit ? ` ${f.unit}` : ""}
                              {f.unsure ? "?" : ""}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="kind-words">
                          {s ? (
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="cite"
                              title={`“${f?.quote ?? ""}”`}
                            >
                              {s.host}
                            </a>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {(p.words.pros.length > 0 || p.words.cons.length > 0 || p.words.skip.length > 0 || p.flags.length > 0) && (
          <section className="shop-notes" aria-label="Pros, cons and who should skip it">
            <Points title="Pros" tone="green" items={p.words.pros} sourceOf={sourceOf} />
            <Points title="Cons" tone="orange" items={p.words.cons} sourceOf={sourceOf} />
            <Points title="Who should skip it" items={p.words.skip} sourceOf={sourceOf} />
            {p.flags.length > 0 && (
              <div className="grid content-start gap-1">
                <span className="eyebrow">No source says</span>
                {p.flags.map((f) => (
                  <p key={f} className="m-0 text-small text-ink">
                    {f}
                  </p>
                ))}
              </div>
            )}
          </section>
        )}

        {/* my marks and the watch: nothing to change on a deleted product */}
        {!gone && (
          <section className="grid gap-3" aria-labelledby="sheet-mine">
            <h3 id="sheet-mine" className="m-0 font-cond text-head">
              Mine
            </h3>
            <div className="pills-inline flex flex-wrap items-center gap-2">
              <Star
                on={p.starred}
                hint="Star it: it leads the want's card on Shopping"
                onPress={() => mark.mutate({ id: p.id, starred: !p.starred })}
              />
              <Pills
                label="My mark"
                options={(["open", "bought", "passed"] as Mark[]).map((m) => ({
                  value: m,
                  label: m === "open" ? "Still deciding" : MARK[m].label,
                  tone: m === "open" ? undefined : MARK[m].tone,
                }))}
                value={p.status}
                onChange={(status) => mark.mutate({ id: p.id, status })}
              />
            </div>
            <div className="grid gap-1">
              <label className="flex flex-wrap items-center gap-2">
                <span className="text-small font-semibold text-strong">My target</span>
                <input
                  className="input w-28 font-mono"
                  inputMode="decimal"
                  placeholder="none"
                  value={target}
                  onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, "").slice(0, 9))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && targetOk) mark.mutate({ id: p.id, target: targetCents });
                  }}
                />
                <button
                  type="button"
                  className="btn"
                  disabled={!targetOk || targetCents === p.target || mark.isPending}
                  onClick={() => mark.mutate({ id: p.id, target: targetCents })}
                >
                  Set
                </button>
              </label>
              <span className="text-small text-muted">
                A watch pings when the best verified price reaches it · Enter sets it
              </span>
            </div>
            <div className="grid gap-2">
              <span className="text-small font-semibold text-strong">
                Watch{" "}
                {p.watch && (
                  <span className="font-normal text-muted">
                    · until {day(p.watch.until)}, a check{" "}
                    {p.watch.everyHours === 24 ? "a day" : `every ${p.watch.everyHours} h`}
                    {p.watch.last && <span title={when(p.watch.last)}>, checked {agoWords(p.watch.last)}</span>}
                    {p.watch.low !== null && <>, lowest since it began {money(p.watch.low, v.currency)}</>}
                  </span>
                )}
              </span>
              <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
                <Seg
                  label="For how long"
                  options={FOR.map((o) => ({ value: o.value, label: o.label }))}
                  value={days}
                  onChange={setDays}
                />
                <Seg
                  label="How often"
                  options={EVERY.map((o) => ({ value: o.value, label: o.label }))}
                  value={every}
                  onChange={setEvery}
                />
                <button type="button" className="pill" aria-pressed={stock} onClick={() => setStock(!stock)}>
                  <span className="pill-name">Back in stock pings</span>
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-small text-muted">
                  A ping at my target, a drop to the lowest since it began{stock ? ", or a return to stock" : ""}
                </span>
                {p.watch && (
                  <button
                    type="button"
                    className="btn btn-sm btn-quiet"
                    disabled={unwatch.isPending}
                    onClick={() => unwatch.mutate(p.id)}
                  >
                    Stop watching
                  </button>
                )}
              </div>
            </div>
          </section>
        )}
        {failed && (
          <p className="m-0 text-detail text-red" role="alert">
            {sentence((failed.error as Error).message)}
          </p>
        )}
      </div>
    </Dialog>
  );
}

// a value as the table says it: yes or no, a number as it was read
const shown = (v: number | string | boolean) => (typeof v === "boolean" ? (v ? "Yes" : "No") : String(v));

// how long the readings span: "40 days", "1 day"
const spanOf = (points: { at: string }[]) => {
  const d = Math.max(1, Math.round((Date.now() - Date.parse(points[0].at)) / 86_400_000));
  return `${d} ${plural(d, "day")}`;
};

// a checked sentence and its sources, each a quiet link to the page it rests on
function Sentence({
  said,
  sourceOf,
  lead,
  muted = false,
}: {
  said: Said;
  sourceOf: (ref: string) => SourceRef | undefined;
  lead?: string;
  muted?: boolean;
}) {
  const sources = said.refs.map(sourceOf).filter((s): s is SourceRef => Boolean(s));
  return (
    <p className={cx("m-0 text-body", muted ? "text-muted" : "text-ink")}>
      {lead && <b className="font-medium text-strong">{lead} </b>}
      {said.text}{" "}
      {sources.map((s, i) => (
        <span key={s.ref}>
          {i > 0 && <span className="cite-sep"> · </span>}
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="cite">
            {s.host}
          </a>
        </span>
      ))}
    </p>
  );
}

function Points({
  title,
  tone,
  items,
  sourceOf,
}: {
  title: string;
  tone?: string;
  items: Said[];
  sourceOf: (ref: string) => SourceRef | undefined;
}) {
  if (!items.length) return null;
  return (
    <div className="grid content-start gap-1">
      <span className={cx("eyebrow", tone && `tone-${tone}`)}>{title}</span>
      {items.map((s) => (
        <p key={s.text} className="m-0 text-small text-ink">
          {s.text}{" "}
          {s.refs.map((r) => {
            const src = sourceOf(r);
            return src ? (
              <a key={r} href={src.url} target="_blank" rel="noopener noreferrer" className="cite">
                {src.host}
              </a>
            ) : null;
          })}
        </p>
      ))}
    </div>
  );
}

// the read prices on the shared list with the offer kind: cards on a phone, a table from 64rem; the best price marked,
// a price read from the page's words marked with those words and never the best
function OfferList({ offers, currency }: { offers: OfferView[]; currency: string }) {
  const kind = { ...OFFER_KIND, currency };
  const byId = new Map(offers.map((o) => [o.id, o]));
  const rows: KindRow[] = offers.map((o) => ({
    id: o.id,
    values: {
      storeName: o.storeName,
      total: o.total,
      regular: o.regular,
      stock: o.stock,
      condition: o.condition,
      seen: o.seen,
      inStock: o.stock === "in",
      isNew: o.condition === "new",
    },
  }));
  const stockWords = (o: OfferView) =>
    o.stock === "in"
      ? "In stock"
      : o.stock === "out"
        ? "Out of stock"
        : o.stock === "preorder"
          ? "Preorder"
          : "Unknown";
  const delivery = (o: OfferView) =>
    [
      o.shipping === 0 ? "free shipping" : o.shipping ? `${money(o.shipping, currency)} shipping` : "",
      o.pickup ? "pickup" : "",
    ]
      .filter(Boolean)
      .join(", ") || "—";
  return (
    <KindList
      kind={kind}
      rows={rows}
      label="The read prices"
      first={{
        label: "Store",
        cell: (r) => {
          const o = byId.get(r.id);
          return o ? (
            <span className="grid justify-items-start gap-1">
              <a href={o.url} target="_blank" rel="noopener noreferrer" className="shop-store">
                {o.storeName} ↗
              </a>
              {o.best && <span className="chip chip-caps tone-great">Best price</span>}
              {o.method === "text" && (
                <span className="text-small text-muted">
                  From the page's words: <q className="text-ink">{o.words}</q>
                </span>
              )}
            </span>
          ) : null;
        },
      }}
      columns={[
        {
          field: "total",
          cell: (r) => {
            const o = byId.get(r.id);
            return o?.total != null ? (
              <span className={cx(o.best && "kind-best")}>{money(o.total, currency)}</span>
            ) : (
              "—"
            );
          },
        },
        { field: "regular" },
        {
          field: "stock",
          cell: (r) => {
            const o = byId.get(r.id);
            return o ? stockWords(o) : "—";
          },
        },
        {
          field: "shipping",
          label: "Delivery",
          words: true,
          cell: (r) => {
            const o = byId.get(r.id);
            return o ? delivery(o) : "—";
          },
        },
        { field: "condition" },
        { field: "seen", label: "Checked", cell: (r) => agoWords(byId.get(r.id)?.seen) },
      ]}
      meta={(r) => (byId.get(r.id)?.best ? <span className="chip chip-caps tone-great">Best price</span> : null)}
      figure={(r) => {
        const o = byId.get(r.id);
        return o?.total != null ? <span className="money">{money(o.total, currency)}</span> : null;
      }}
      facts={[]}
      lines={(r) => {
        const o = byId.get(r.id);
        if (!o) return null;
        return (
          <>
            <p className="m-0 text-small">
              {stockWords(o)} · {o.condition}
              {delivery(o) !== "—" && ` · ${delivery(o)}`}
              {o.regular !== null && (
                <>
                  {" "}
                  · regular <span className="font-mono">{money(o.regular, currency)}</span>
                </>
              )}{" "}
              · checked {agoWords(o.seen)}
            </p>
            {o.method === "text" && (
              <p className="m-0 text-small">
                From the page's words: <q className="text-ink">{o.words}</q>
              </p>
            )}
          </>
        );
      }}
      actions={(r) => {
        const o = byId.get(r.id);
        return o ? (
          <a href={o.url} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
            Open the store ↗
          </a>
        ) : null;
      }}
    />
  );
}

// every reading, newest first: the table under the line, so no value hides behind a hover
function Readings({ readings, currency }: { readings: Reading[]; currency: string }) {
  const [all, setAll] = useState(false);
  const newest = [...readings].reverse();
  const shown = all ? newest : newest.slice(0, 8);
  return (
    <details className="shop-readings">
      <summary className="disclosure">
        The readings <span className="font-mono text-small text-muted">{readings.length}</span>
      </summary>
      <table className="data-table">
        <thead>
          <tr>
            <th className="eyebrow">When</th>
            <th className="eyebrow kind-words">Store</th>
            <th className="eyebrow">Price</th>
            <th className="eyebrow kind-words">How</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={`${r.offer}-${r.at}`}>
              <td title={when(r.at)}>{day(r.at)}</td>
              <td className="kind-words">{r.store.replace(/^www\./, "")}</td>
              <td className={cx(r.stock === "out" && "text-muted")}>
                {money(r.price, currency)}
                {r.stock === "out" ? " (out)" : ""}
              </td>
              <td className="kind-words text-muted">{r.method === "text" ? "the page's words" : "page data"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {readings.length > 8 && (
        <button type="button" className="btn btn-sm btn-quiet mt-1" onClick={() => setAll(!all)}>
          {all ? "Fewer" : `All ${readings.length}`}
        </button>
      )}
    </details>
  );
}

// a store's name short enough for the sheet's foot: "Tidal (its own store)" reads Tidal, a bare domain its first part
// (store-a.example reads store-a); the full name stays in the button's title
function shortStore(name: string): string {
  const bare = name.replace(/\s*\(.*\)\s*$/, "").trim();
  return !/\s/.test(bare) && bare.includes(".") ? (bare.replace(/^www\./, "").split(".")[0] ?? bare) : bare;
}
