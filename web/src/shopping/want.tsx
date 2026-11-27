// A want's page: which one to buy, where, and whether the price is good, without a tap per product. The head says
// the kind of product, my words, the state and the reach, with Run again and Watch (the top pick, two weeks, daily).
// While it works, its steps; then Worth knowing (each open question as pills, the default marked assumed, a tap
// re-ranking at once; my budget and note, changed in a box), the picks (the labelled products as cards: their labels,
// the model sold here, the first reason, who it's not for, three decisive facts, the best verified offer with its
// verdict, the reach) and the offers (on the shared list with the offer kind, by product: the read prices, then the
// stores that are links). The rail holds Ask, the sources and the log. After that block, as wide as the page, the
// compared list on the shared list (cards on a phone, a table from 64rem), also considered, what was assumed and what
// would change the pick, and the foot: how it ranks, my mark on the want, its deleted products, Delete. A deleted
// want says so and offers Restore. A product opens its sheet (?product=, the link a ping opens).
import { useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { formatMoney, type Row as KindRow } from "../../../src/shared/kinds.ts";
import {
  type Mark,
  OFFER_KIND,
  type OfferView,
  type ProductView,
  productRow,
  type SourceRef,
  VERDICT_WORDS,
  type WantView,
} from "../../../src/shared/shopping.ts";
import { Ask } from "../ask.tsx";
import { Card } from "../ui/card.tsx";
import { useConfirm } from "../ui/confirm.tsx";
import { cx } from "../ui/cx.ts";
import { Dialog } from "../ui/dialog.tsx";
import { EmptyState } from "../ui/empty.tsx";
import { KindFact, KindFilters, KindList, useKind } from "../ui/kind-list.tsx";
import { List, Row } from "../ui/list.tsx";
import { Page } from "../ui/page.tsx";
import { Pills } from "../ui/pills.tsx";
import { RailPart, WithRail } from "../ui/rail.tsx";
import { SectionHead } from "../ui/section.tsx";
import { Star } from "../ui/star.tsx";
import { agoWords, day, doors, MARK, money, plural, priceTone, sentence, useChange, useWant, when } from "./data.ts";
import { LabelChips, Price, RunAgain, StateChip } from "./parts.tsx";
import { ProductSheet } from "./product.tsx";

// the steps of a run, in the order it takes them: one product named goes to its offers first
const COMPARE = ["Understanding", "Searching", "Reading reviews", "Comparing", "Writing", "Checking", "Finding offers"];
const ONE = ["Understanding", "Finding offers", "Searching", "Reading reviews", "Comparing", "Writing", "Checking"];
const STARTERS = [
  "Which one should I pick, and why?",
  "Is now a good time to buy?",
  "What do the reviews disagree on?",
];
const TIER: Record<SourceRef["tier"], { label: string; tone: string; hint: string }> = {
  A: { label: "Tier A", tone: "green", hint: "Buys its own units and publishes its numbers" },
  B: { label: "Tier B", tone: "muted", hint: "Tests by hand, without numbers" },
  C: { label: "Tier C", tone: "orange", hint: "A signal only: never brings a product in" },
};
// the defaults of a watch the head starts: two weeks, a check a day, back in stock pings
const WATCH = { days: 14, everyHours: 24 as const, stock: true };

export function ShoppingWant() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const want = useWant(id);
  const d = want.data;
  const back = { to: "/shopping", label: "Shopping" };
  // a product's sheet, by its address, so Back closes it and a ping's link opens it: opened from here it is a step in
  // the history, which the ✕ steps back from; opened from a link it is the page's own address, which the ✕ clears
  const sheet = params.get("product");
  const open = (product: string | null) => {
    if (product)
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          next.set("product", product);
          return next;
        },
        { state: { sheet: true } },
      );
    else if ((location.state as { sheet?: boolean } | null)?.sheet) navigate(-1);
    else
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          next.delete("product");
          return next;
        },
        { replace: true },
      );
  };

  if (!d)
    return want.isError ? (
      <Page back={back} app="Shopping" eyebrow="To buy" title="This want didn't open">
        {(want.error as Error).message === "404" ? (
          <EmptyState
            title="This want isn't here."
            line="Its link may be old. Open Shopping to find the others."
            action={
              <Link to="/shopping" className="btn">
                Open Shopping
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="It didn't load."
            line={sentence((want.error as Error).message)}
            action={
              <button type="button" className="btn" onClick={() => want.refetch()}>
                Try again
              </button>
            }
          />
        )}
      </Page>
    ) : (
      <Page back={back} app="Shopping" eyebrow="To buy" title="Opening…" />
    );
  if ("gone" in d) return <Gone id={id} words={d.gone.words} at={d.gone.at} />;
  return (
    <>
      <Want view={d} onOpen={open} />
      {sheet && <ProductSheet key={sheet} id={sheet} v={d} onClose={() => open(null)} />}
    </>
  );
}

// a deleted want: said first, with its way back
function Gone({ id, words, at }: { id: string; words: string; at: string }) {
  const restore = useChange(doors.restoreWant);
  return (
    <Page back={{ to: "/shopping", label: "Shopping" }} app="Shopping" eyebrow="A deleted want" title={words}>
      <div className="grid justify-items-start gap-3">
        <p className="inner m-0 text-detail">
          <b className="text-strong">Deleted</b> {day(at)}, {agoWords(at)}: its products, offers and price history are
          kept, and Restore brings them all back.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary"
            disabled={restore.isPending}
            onClick={() => restore.mutate(id)}
          >
            Restore
          </button>
          <Link to="/shopping" className="btn btn-quiet">
            Open Shopping
          </Link>
        </div>
        {restore.isError && <p className="m-0 text-detail text-red">{sentence((restore.error as Error).message)}</p>}
      </div>
    </Page>
  );
}

function Want({ view: v, onOpen }: { view: WantView; onOpen: (product: string | null) => void }) {
  const sure = useConfirm();
  const run = useChange(doors.run);
  const watch = useChange(doors.watch);
  const mark = useChange(doors.markWant);
  const answer = useChange(doors.answer);
  const removeWant = useChange(doors.removeWant);
  const removeProduct = useChange(doors.removeProduct);
  const restoreProduct = useChange(doors.restoreProduct);
  const [editing, setEditing] = useState(false);
  const finalists = v.products;
  // the product the head's Watch is about: my starred one, else the best overall, else the first
  const lead =
    finalists.find((p) => p.starred) ??
    finalists.find((p) => p.labels.some((l) => l.key === "overall")) ??
    finalists[0];
  const named = v.need?.mode === "one" ? finalists.find((p) => p.place === 0) : undefined;
  const labelled = finalists.filter((p) => p.labels.length > 0 && p !== named);
  const picks = [...(named ? [named] : []), ...(labelled.length ? labelled : finalists.slice(0, named ? 0 : 3))];
  // the offers shown are the picks': the products Find offers ran on (the others' are in their sheets)
  const priced = picks.filter((p) => p.offers.length > 0);
  const failed = [run, watch, mark, answer, removeWant, removeProduct, restoreProduct].find((m) => m.isError);
  const dropProduct = async (p: ProductView) => {
    if (
      await sure({
        title: `Delete ${p.name}?`,
        body: "It leaves this want's lists, and Run again never brings it back. Restore it from the list's foot.",
        yes: "Delete",
        danger: true,
      })
    )
      removeProduct.mutate(p.id);
  };

  return (
    <Page
      back={{ to: "/shopping", label: "Shopping" }}
      app="Shopping"
      eyebrow={v.categoryName || "A want"}
      title={v.words}
      line={<HeadLine v={v} />}
      actions={
        <>
          <RunAgain state={v.state} pending={run.isPending} onRun={() => run.mutate(v.id)} />
          {lead &&
            (lead.watch ? (
              <button
                type="button"
                className="btn"
                aria-pressed="true"
                title={`Watching ${lead.name} until ${day(lead.watch.until)}: open it to change or stop`}
                onClick={() => onOpen(lead.id)}
              >
                Watching
              </button>
            ) : (
              <button
                type="button"
                className="btn"
                disabled={watch.isPending}
                title={`Watch ${lead.name}'s price for two weeks, a check a day: a ping at my target or a new low`}
                onClick={() => watch.mutate({ id: lead.id, ...WATCH })}
              >
                {watch.isPending ? "Watching…" : "Watch"}
              </button>
            ))}
        </>
      }
    >
      <WithRail
        label="Ask, the sources and the log"
        rail={
          <>
            <Ask
              app="shopping"
              refId={v.id}
              title="Ask about this want"
              placeholder="Ask about these products or their prices"
              starters={STARTERS}
            />
            <Sources sources={v.sources} />
            <Log v={v} onOpen={onOpen} />
          </>
        }
      >
        {(v.state === "running" || v.state === "queued") && <Working v={v} />}
        {v.state === "failed" && v.error && (
          <div className="shop-failed" role="status">
            <span className="dot tone-red" aria-hidden="true" />
            <p className="m-0">
              {sentence(v.error)}
              {finalists.length ? " The last good run is below." : ""}
            </p>
          </div>
        )}
        {failed && (
          <p className="m-0 text-detail text-red" role="alert">
            {sentence((failed.error as Error).message)}
          </p>
        )}

        {v.need && (
          <WorthKnowing
            v={v}
            onAnswer={(key, option) => answer.mutate({ id: v.id, key, option })}
            busy={answer.isPending ? answer.variables : undefined}
            onEdit={() => setEditing(true)}
          />
        )}

        {picks.length > 0 && (
          <section className="grid gap-3" aria-labelledby="shop-picks">
            <SectionHead
              id="shop-picks"
              title="The picks"
              count={picks.length}
              hint={
                named
                  ? "The product I named first, then what the sources compare it with."
                  : labelled.length
                    ? "The products the ranking labelled, each with its price and where that price comes from."
                    : "No product earned a label: the sources measured too little of what matters. The top three by what they measured."
              }
            />
            {v.pricing && <p className="m-0 text-detail text-muted">{v.pricing}</p>}
            <div className="grid gap-3 md:grid-cols-2">
              {picks.map((p) => (
                <Pick key={p.id} p={p} v={v} onOpen={() => onOpen(p.id)} onRemove={() => dropProduct(p)} />
              ))}
            </div>
          </section>
        )}

        {priced.length > 0 && <Offers v={v} products={priced} onOpen={onOpen} />}

        {!finalists.length && v.state === "done" && (
          <EmptyState title="Nothing compared yet." line="Run again to search the sites that test this kind." />
        )}
      </WithRail>

      {finalists.length > 0 && <Compared v={v} onOpen={onOpen} onRemove={dropProduct} />}
      <AlsoConsidered v={v} onOpen={onOpen} />
      <Notes v={v} />

      {/* the foot: how it ranks; my mark on the want; the products I deleted, each with its way back; Delete */}
      <div className="shop-foot">
        <details>
          <summary className="disclosure">How kestrel ranks</summary>
          <p className="m-0 max-w-[72ch] pb-2 text-small text-muted">{v.rule}</p>
        </details>
        {v.deleted.length > 0 && (
          <details>
            <summary className="disclosure">
              Deleted <span className="font-mono text-small text-muted">{v.deleted.length}</span>
            </summary>
            <List label="Deleted products">
              {v.deleted.map((g) => (
                <Row
                  key={g.id}
                  onOpen={() => onOpen(g.id)}
                  title={<span className="block truncate">{g.name}</span>}
                  line={<span title={when(g.at)}>Deleted {agoWords(g.at)}</span>}
                  end={
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={restoreProduct.isPending}
                      onClick={() => restoreProduct.mutate(g.id)}
                    >
                      Restore
                    </button>
                  }
                />
              ))}
            </List>
          </details>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Pills
            label="This want"
            options={(["open", "bought", "passed"] as Mark[]).map((m) => ({
              value: m,
              label: m === "open" ? "Still need it" : MARK[m].label,
              tone: m === "open" ? undefined : MARK[m].tone,
            }))}
            value={v.status}
            onChange={(status) => mark.mutate({ id: v.id, status })}
          />
          <button
            type="button"
            className="btn btn-quiet btn-danger"
            disabled={removeWant.isPending || v.state === "running"}
            title={v.state === "running" ? "It is running now: wait for it to end" : undefined}
            onClick={async () => {
              if (
                await sure({
                  title: `Delete “${v.words}”?`,
                  body: "Its products, offers and price history go with it. Restore brings it all back.",
                  yes: "Delete",
                  danger: true,
                })
              )
                removeWant.mutate(v.id);
            }}
          >
            Delete this want
          </button>
        </div>
      </div>
      <BudgetBox v={v} open={editing} onClose={() => setEditing(false)} />
    </Page>
  );
}

// the head's line: the state chip, then the reach with its values bold, and when it last ran
function HeadLine({ v }: { v: WantView }) {
  return (
    <span className="research-line">
      <StateChip state={v.state} />
      {v.status !== "open" && (
        <span className={`chip chip-caps tone-${MARK[v.status].tone}`}>{MARK[v.status].label}</span>
      )}
      {v.compared > 0 && (
        <span>
          <b className="font-mono text-ink">{v.compared}</b> compared
        </span>
      )}
      {(v.storesRead > 0 || v.links > 0) && (
        <span>
          <b className="font-mono text-ink">{v.storesRead}</b> {plural(v.storesRead, "store")} read
          {v.links > 0 && (
            <>
              , <b className="font-mono text-ink">{v.links}</b> {plural(v.links, "link")}
            </>
          )}
        </span>
      )}
      {v.ran && (
        <span title={when(v.ran)}>
          ran <b className="text-ink">{agoWords(v.ran)}</b>
        </span>
      )}
    </span>
  );
}

// a run at work: its steps, each done, now or next, the one now in its own words
function Working({ v }: { v: WantView }) {
  if (v.state === "queued")
    return (
      <p className="m-0 flex items-center gap-2 text-detail text-muted" role="status">
        <span className="dot tone-muted" aria-hidden="true" /> Waiting its turn: one want runs at a time.
      </p>
    );
  const order = v.need?.mode === "one" ? ONE : COMPARE;
  const now = Math.max(
    0,
    order.findIndex((p) => v.step.startsWith(p)),
  );
  return (
    // News' steps, so work at work reads the same whatever its kind
    <div className="card card-tone tone-green news-running" role="status">
      <ol className="news-steps" aria-label="Where it stands">
        {order.map((name, i) => {
          const state = i < now ? "done" : i === now ? "now" : "next";
          return (
            <li key={name} className="news-step" data-state={state}>
              <span className="news-step-mark" aria-hidden="true">
                {state === "done" ? "✓" : state === "now" ? <span className="dot tone-green pulse" /> : "○"}
              </span>
              {state === "now" && v.step ? v.step : name}
            </li>
          );
        })}
      </ol>
      <div className="loading-bar" aria-hidden="true" />
    </div>
  );
}

// the open questions, each a row of pills: my answer, or the default marked assumed; a tap re-ranks at once. Only the
// questions whose answer moves the top pick show, and any I answered; the others say how many hid. My budget (or the
// one my words state) and note under them, changed in a box
function WorthKnowing({
  v,
  onAnswer,
  busy,
  onEdit,
}: {
  v: WantView;
  onAnswer: (key: string, option: number) => void;
  busy?: { key: string; option: number };
  onEdit: () => void;
}) {
  const shown = v.questions.filter((q) => q.changes || q.picked !== null);
  const hidden = v.questions.length - shown.length;
  return (
    <section className="grid gap-3" aria-labelledby="shop-worth">
      <SectionHead
        id="shop-worth"
        title="Worth knowing"
        hint={shown.length ? "Each answer re-ranks the list at once; an unanswered one is assumed." : undefined}
      />
      <div className="card card-stack">
        {shown.map((q) => {
          const picked = q.picked ?? q.default;
          return (
            <Pills
              key={q.key}
              label={q.q}
              showLabel
              options={q.options.map((o, i) => ({
                value: String(i),
                label:
                  busy?.key === q.key && busy.option === i ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="spin" /> {o.label}
                    </span>
                  ) : (
                    o.label
                  ),
                hint: q.picked === null && i === q.default ? "assumed" : undefined,
              }))}
              value={String(picked)}
              onChange={(o) => onAnswer(q.key, Number(o))}
            />
          );
        })}
        {hidden > 0 && (
          <p className="m-0 text-small text-muted">
            {hidden === 1 ? "One question is" : `${hidden} questions are`} left out: no answer changes the top pick.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-detail">
          <span className="text-muted">
            Budget{" "}
            <b className="font-mono text-ink">
              {v.budget !== null
                ? formatMoney(v.budget * 100, v.currency)
                : v.budgetWords !== null
                  ? formatMoney(v.budgetWords * 100, v.currency)
                  : "none"}
            </b>
            {v.budget === null && v.budgetWords !== null && <span className="text-small"> (from my words)</span>}
            {v.note && (
              <>
                {" "}
                · a note <span className="text-small">(never searched)</span>
              </>
            )}
          </span>
          <button type="button" className="btn btn-sm" onClick={onEdit}>
            Change
          </button>
        </div>
      </div>
    </section>
  );
}

// my budget and note, in a box: a new budget re-ranks at once (a product over it is set aside)
// closing the box (Esc, Back, a tap outside, the ✕) keeps what I typed for the next time it opens; Discard puts back
// what is saved
function BudgetBox({ v, open, onClose }: { v: WantView; open: boolean; onClose: () => void }) {
  const saved = { budget: v.budget === null ? "" : String(v.budget), note: v.note };
  const [budget, setBudget] = useState(saved.budget);
  const [note, setNote] = useState(saved.note);
  const save = useChange(doors.markWant, () => onClose());
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Budget and note"
      busy={save.isPending}
      actions={
        <>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              setBudget(saved.budget);
              setNote(saved.note);
              onClose();
            }}
          >
            Discard
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={save.isPending}
            onClick={() => save.mutate({ id: v.id, budget: budget ? Number(budget) : null, note: note.trim() })}
          >
            Save
          </button>
        </>
      }
    >
      <div className="grid gap-3">
        <label className="grid content-start gap-1">
          <span className="text-small font-semibold text-strong">Budget</span>
          <input
            className="input font-mono"
            inputMode="numeric"
            placeholder={v.budgetWords === null ? "none" : `${v.budgetWords} (from my words)`}
            data-autofocus=""
            value={budget}
            onChange={(e) => setBudget(e.target.value.replace(/[^\d]/g, "").slice(0, 7))}
          />
          <span className="text-small text-muted">whole dollars; a product over it is set aside at once</span>
        </label>
        <label className="grid content-start gap-1">
          <span className="text-small font-semibold text-strong">Note</span>
          <input className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          <span className="text-small text-muted">for kestrel only: never in a search, never shown to Ask</span>
        </label>
        {save.isError && <p className="m-0 text-detail text-red">{sentence((save.error as Error).message)}</p>}
      </div>
    </Dialog>
  );
}

// the facts that decide: the three criteria that weigh most, from the want's own kind
const topFacts = (v: WantView) => v.kind.facts ?? [];

// one pick: its labels and evidence on top, its name and best price, the model sold here, the first reason, who it's
// not for, three decisive facts, its best verified offer with the deal's verdict, the reach
function Pick({ p, v, onOpen, onRemove }: { p: ProductView; v: WantView; onOpen: () => void; onRemove: () => void }) {
  const star = useChange(doors.markProduct);
  const on = star.isPending ? Boolean(star.variables?.starred) : p.starred;
  const row = productRow(p);
  const best = p.best;
  const why = p.words.why[0];
  const tone = priceTone(p.verdict?.word);
  return (
    <Card
      title={p.name}
      onOpen={onOpen}
      meta={
        <>
          <LabelChips labels={p.labels} thin={p.evidence.thin} />
          {p.watch && <span className="chip chip-caps tone-yellow">Watching</span>}
          {p.status !== "open" && (
            <span className={`chip chip-caps tone-${MARK[p.status].tone}`}>{MARK[p.status].label}</span>
          )}
        </>
      }
      end={
        <span
          title={`${p.evidence.a} lab (tier A) and ${p.evidence.b} hands-on (tier B) ${plural(p.evidence.sources, "source")}${p.evidence.newest ? `, the newest from ${p.evidence.newest}` : ""}`}
        >
          {p.evidence.sources} {plural(p.evidence.sources, "source")}
        </span>
      }
      star={
        <Star
          bare
          on={on}
          busy={star.isPending}
          label={`Star “${p.name}”`}
          hint="Star it: it leads the want's card on Shopping"
          onPress={() => star.mutate({ id: p.id, starred: !on })}
        />
      }
      figure={<Price cents={best?.total ?? null} currency={v.currency} verdict={p.verdict?.word} />}
      onRemove={onRemove}
      removeLabel={`Delete ${p.name}`}
      actions={
        best ? (
          <a href={best.url} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
            {best.storeName} ↗
          </a>
        ) : undefined
      }
    >
      {p.models[0] && (
        <p className="m-0 text-small">
          Sold here as <b className="font-mono font-medium text-ink">{p.models[0]}</b>
        </p>
      )}
      {why && <p className="m-0 text-ink">{why.text}</p>}
      {p.words.notFor && <p className="m-0">Not for: {lower(p.words.notFor.text)}</p>}
      <p className="m-0 text-small">
        {topFacts(v).map((k, i) => (
          <span key={k}>
            {i > 0 && " · "}
            <KindFact kind={v.kind} row={row} field={k} />
          </span>
        ))}
      </p>
      {/* the best verified offer and the deal's word on it, in one line; or why there is no price */}
      <div className="shop-deal">
        {best && p.verdict ? (
          <p className="m-0 text-small">
            <span className={`chip tone-${tone ?? "muted"}`}>{VERDICT_WORDS[p.verdict.word]}</span>{" "}
            <span>{p.verdict.line}</span>
          </p>
        ) : !best ? (
          <p className="m-0 text-small">
            {/* a price read on a store's page but not in stock says so itself; any other note follows why there is no best */}
            {p.priceFrom === "stock" ? (
              p.priceNote
            ) : (
              <>
                {noBest(p)}
                {p.priceNote && <> · {p.priceNote}</>}
              </>
            )}
          </p>
        ) : null}
        <p className="m-0 text-small">
          {best && (
            <>
              At <b className="font-medium text-ink">{best.storeName}</b> ·{" "}
            </>
          )}
          <b className="font-mono font-medium text-ink">{p.reach.read}</b> {plural(p.reach.read, "store")} read
          {p.reach.links > 0 && (
            <>
              {" "}
              · <b className="font-mono font-medium text-ink">{p.reach.links}</b> {plural(p.reach.links, "link")}
            </>
          )}
          {p.reach.blocked > 0 && (
            <>
              {" "}
              · <b className="font-mono font-medium text-ink">{p.reach.blocked}</b> blocked
            </>
          )}
        </p>
      </div>
    </Card>
  );
}

// why a product has no best price: none read, all out of stock, only from a page's words, or none sold new by a store
const noBest = (p: ProductView) => {
  const read = p.offers.filter((o) => o.read === "ok" && o.price !== null);
  if (!read.length) return "No price read";
  if (read.every((o) => o.stock === "out")) return "Out of stock where read";
  if (read.every((o) => o.method === "text")) return "Only a price from a page's words";
  return "No new price in stock from a store itself";
};

// a sentence that follows "Not for:": its first letter lowered, unless it is a name ("Not for small heads")
const lower = (s: string) => s.replace(/^Not for:?\s*/i, "").replace(/^([A-Z])(?=[a-z])/, (c) => c.toLowerCase());

// the offers of the products that have some, on the shared list with the offer kind: one filter card over them all
// (All, In stock, New only, a store), then each product's read prices, then its stores that are links, in one row
export function Offers({
  v,
  products,
  onOpen,
}: {
  v: WantView;
  products: ProductView[];
  onOpen: (product: string) => void;
}) {
  const kind = { ...OFFER_KIND, currency: v.currency };
  const read = products.flatMap((p) => p.offers.filter((o) => o.read === "ok"));
  const byId = new Map(read.map((o) => [o.id, o]));
  const rows: KindRow[] = read.map((o) => ({
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
  const state = useKind(kind, rows, { find: (r) => String(r.values.storeName) });
  const links = (p: ProductView) =>
    p.offers.filter((o) => o.read === "link" || o.read === "blocked" || o.read === "unsearched");
  return (
    <section className="grid gap-3" aria-labelledby="shop-offers">
      <SectionHead
        id="shop-offers"
        title="Offers"
        count={read.length}
        hint="Prices from the stores' own page data; a price read from a page's words is marked and never the best."
      />
      {read.length > 0 && <KindFilters state={state} findLabel="Search the stores" sorts={false} />}
      {products.map((p) => {
        const mine = state.shown.filter((r) => byId.get(r.id)?.product === p.id);
        const other = links(p);
        if (!mine.length && !other.length) return null;
        return (
          <div key={p.id} className="grid gap-2">
            <h3 className="shop-group m-0">
              <button type="button" className="shop-group-name" onClick={() => onOpen(p.id)}>
                {p.name}
              </button>
              {p.verdict && (
                <span className={`chip tone-${priceTone(p.verdict.word) ?? "muted"}`}>
                  {VERDICT_WORDS[p.verdict.word]}
                </span>
              )}
            </h3>
            {mine.length > 0 && (
              <KindList
                kind={kind}
                rows={mine}
                label={`${p.name}'s offers`}
                first={{
                  label: "Store",
                  cell: (r) => <OfferName o={byId.get(r.id)} />,
                }}
                columns={[
                  { field: "total", cell: (r) => <OfferTotal o={byId.get(r.id)} currency={v.currency} /> },
                  { field: "regular" },
                  { field: "stock", cell: (r) => stockWords(byId.get(r.id)) },
                  { field: "condition" },
                  { field: "seen", label: "Checked", cell: (r) => agoWords(byId.get(r.id)?.seen) },
                ]}
                meta={(r) => {
                  const o = byId.get(r.id);
                  return o?.best ? <span className="chip chip-caps tone-great">Best price</span> : null;
                }}
                figure={(r) => {
                  const o = byId.get(r.id);
                  return o?.total != null ? <span className="money">{money(o.total, v.currency)}</span> : null;
                }}
                lines={(r) => {
                  const o = byId.get(r.id);
                  return o ? <OfferLines o={o} currency={v.currency} /> : null;
                }}
                facts={[]}
                actions={(r) => {
                  const o = byId.get(r.id);
                  return o ? (
                    <a href={o.url} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
                      Open the store ↗
                    </a>
                  ) : null;
                }}
              />
            )}
            {other.length > 0 && <AlsoCheck offers={other} />}
          </div>
        );
      })}
      {(v.read
        ? products.some((p) => links(p).length > 0)
        : !products.some((p) => p.offers.some((o) => o.read === "ok"))) && (
        <p className="m-0 text-small text-muted">
          {v.read
            ? "The stores in Also check turn automated readers away; a later version reads them in the agent's Chrome."
            : "Store reading is off in the settings: every store is a link."}
        </p>
      )}
    </section>
  );
}

// an offer's store in the table's first column: its name, the best price marked, a price from the page's words
// marked with those words
function OfferName({ o }: { o: OfferView | undefined }) {
  if (!o) return null;
  return (
    <span className="grid gap-1">
      <a href={o.url} target="_blank" rel="noopener noreferrer" className="shop-store">
        {o.storeName} ↗
      </a>
      {(o.best || o.method === "text" || o.condition !== "new") && (
        <span className="flex flex-wrap gap-1">
          {o.best && <span className="chip chip-caps tone-great">Best price</span>}
          {o.method === "text" && (
            <span className="chip chip-caps tone-muted" title={`The page's words: “${o.words}”`}>
              From the page's words
            </span>
          )}
        </span>
      )}
    </span>
  );
}

function OfferTotal({ o, currency }: { o: OfferView | undefined; currency: string }) {
  if (!o || o.total === null) return <span className="text-muted">—</span>;
  return (
    <span
      className={cx(o.best && "kind-best")}
      title={o.shipping ? `${money(o.shipping, currency)} shipping` : undefined}
    >
      {money(o.total, currency)}
    </span>
  );
}

// a card's lines for an offer: its shipping or pickup, when it was checked, the page's words for a price read from them
function OfferLines({ o, currency }: { o: OfferView; currency: string }) {
  return (
    <>
      <p className="m-0 text-small">
        {stockWords(o)} · {o.condition === "new" ? "new" : o.condition}
        {o.regular !== null && (
          <>
            {" "}
            · regular <span className="font-mono">{money(o.regular, currency)}</span>
          </>
        )}
        {o.shipping ? (
          <>
            {" "}
            · <span className="font-mono">{money(o.shipping, currency)}</span> shipping
          </>
        ) : o.shipping === 0 ? (
          " · free shipping"
        ) : null}
        {o.pickup && " · pickup"} · {checked(o)}
      </p>
      {o.method === "text" && (
        <p className="m-0 text-small">
          Read from the page's words: <q className="text-ink">{o.words}</q>
        </p>
      )}
    </>
  );
}

const STOCK: Record<OfferView["stock"], string> = {
  in: "In stock",
  out: "Out of stock",
  preorder: "Preorder",
  unknown: "Stock unknown",
};
const stockWords = (o: OfferView | undefined) => (o ? STOCK[o.stock] : "—");
const checked = (o: OfferView | undefined) => (o ? `checked ${agoWords(o.seen)}` : "");

// the stores that are links, in one compact row: each a quiet link, a blocked one saying so
export function AlsoCheck({ offers }: { offers: OfferView[] }) {
  return (
    <p className="m-0 text-small text-muted">
      Also check:{" "}
      {offers.map((o, i) => (
        <span key={o.id}>
          {i > 0 && <span className="cite-sep"> · </span>}
          <a
            href={o.url}
            target="_blank"
            rel="noopener noreferrer"
            className="cite"
            title={o.why ? sentence(o.why) : undefined}
          >
            {o.storeName}
          </a>
          {o.read === "blocked" && " (blocked)"}
          {o.read === "unsearched" && " (not searched)"}
          {o.price !== null && ` (a search result shows ${money(o.price, o.currency)})`}
        </span>
      ))}
    </p>
  );
}

// the sources, each with its tier, its date and its host
function Sources({ sources }: { sources: SourceRef[] }) {
  if (!sources.length) return null;
  return (
    <RailPart id="shop-sources" title="Sources" count={sources.length}>
      <List label="The sources">
        {sources.map((s) => (
          <Row
            key={s.ref}
            href={s.url}
            title={<span className="block truncate">{s.title || s.host}</span>}
            line={
              <span className="flex flex-wrap items-center gap-x-2">
                <span className={`chip chip-caps tone-${TIER[s.tier].tone}`} title={TIER[s.tier].hint}>
                  {TIER[s.tier].label}
                </span>
                <span className="font-mono">{s.host}</span>
                {s.date && <span>{s.date}</span>}
                {s.read === "snippet" && <span title="Read from its search snippet only">snippet</span>}
              </span>
            }
          />
        ))}
      </List>
    </RailPart>
  );
}

// the want's log, newest first: its runs, its changes, its pings and watches; a line about a product opens it
function Log({ v, onOpen }: { v: WantView; onOpen: (product: string) => void }) {
  const [all, setAll] = useState(false);
  if (!v.log.length) return null;
  const shown = all ? v.log : v.log.slice(0, 6);
  return (
    <RailPart id="shop-log" title="Log" count={v.log.length}>
      <List label="The log">
        {shown.map((l) => (
          <Row
            key={`${l.at}-${l.text}`}
            onOpen={l.product ? () => onOpen(l.product as string) : undefined}
            title={<span className="block whitespace-normal">{l.text}</span>}
            line={
              <span title={when(l.at)}>
                {l.kind === "ping" ? "Ping · " : l.kind === "watch" ? "Watch · " : ""}
                {agoWords(l.at)}
              </span>
            }
          />
        ))}
      </List>
      {v.log.length > 6 && (
        <button type="button" className="btn btn-sm btn-quiet justify-self-start" onClick={() => setAll(!all)}>
          {all ? "Fewer" : `All ${v.log.length}`}
        </button>
      )}
    </RailPart>
  );
}

// the compared list, as wide as the page: the shared list of the want's own kind, its filters and sorts from the
// criteria; cards on a phone, a table from 64rem (the four criteria that weigh most, all of them from 80rem)
function Compared({
  v,
  onOpen,
  onRemove,
}: {
  v: WantView;
  onOpen: (product: string) => void;
  onRemove: (p: ProductView) => void;
}) {
  const rows = v.products.map(productRow);
  const byId = new Map(v.products.map((p) => [p.id, p]));
  const state = useKind(v.kind, rows, { find: (r) => `${r.values.name} ${byId.get(r.id)?.brand ?? ""}` });
  const criteria = v.kind.fields.filter((f) => f.key.startsWith("c:"));
  return (
    <section className="grid gap-3" aria-labelledby="shop-compared">
      <SectionHead
        id="shop-compared"
        title="Compared"
        count={v.products.length}
        hint="Every finalist, scored for my answers. A grey ? is a value whose quote sits outside its product's part of the page: it never ranks."
      />
      <KindFilters state={state} findLabel="Search the products" fold folded />
      {state.shown.length === 0 ? (
        <EmptyState title="No product passes these filters." line="Fewer filters may show some." />
      ) : (
        <KindList
          kind={v.kind}
          rows={state.shown}
          label="The compared products"
          first={{
            label: "Product",
            cell: (r) => {
              const p = byId.get(r.id);
              return (
                <span className="grid justify-items-start gap-1">
                  <button type="button" className="shop-product-name" onClick={() => onOpen(r.id)}>
                    {String(r.values.name)}
                  </button>
                  {p && (p.labels.length > 0 || p.evidence.thin) && (
                    <span className="flex flex-wrap gap-1">
                      <LabelChips labels={p.labels} thin={p.evidence.thin} />
                    </span>
                  )}
                </span>
              );
            },
          }}
          columns={[
            {
              field: "price",
              cell: (r) => {
                const p = byId.get(r.id);
                return p ? <Price cents={p.price} currency={v.currency} verdict={p.verdict?.word} /> : null;
              },
            },
            { field: "score", cell: (r) => <Score row={r} rows={state.shown} /> },
            ...criteria.map((f, i) => ({ field: f.key, wide: i >= 4 })),
          ]}
          meta={(r) => {
            const p = byId.get(r.id);
            return p ? (
              <>
                <LabelChips labels={p.labels} thin={p.evidence.thin} />
                {p.score !== null && (
                  <span className="text-small text-muted">
                    Score <b className="font-mono font-medium text-ink">{Math.round(p.score)}</b>
                  </span>
                )}
              </>
            ) : null;
          }}
          figure={(r) => {
            const p = byId.get(r.id);
            return p ? <Price cents={p.price} currency={v.currency} verdict={p.verdict?.word} /> : null;
          }}
          lines={(r) => {
            const p = byId.get(r.id);
            return p?.words.why[0] ? <p className="m-0 text-ink">{p.words.why[0].text}</p> : null;
          }}
          detail={(r) => {
            const p = byId.get(r.id);
            return p ? <ProductDetail p={p} onOpen={() => onOpen(p.id)} /> : null;
          }}
          onOpen={(r) => onOpen(r.id)}
          onRemove={(r) => {
            const p = byId.get(r.id);
            if (p) onRemove(p);
          }}
          removeLabel={(r) => `Delete ${String(r.values.name)}`}
        />
      )}
    </section>
  );
}

// a score, whole, the best in its column marked
function Score({ row, rows }: { row: KindRow; rows: KindRow[] }) {
  const s = row.values.score;
  if (typeof s !== "number") return <span className="text-muted">—</span>;
  const top = Math.max(...rows.map((r) => (typeof r.values.score === "number" ? r.values.score : -1)));
  return <span className={cx(s === top && rows.length > 1 && "kind-best")}>{Math.round(s)}</span>;
}

// what a row folds open: the pros, the cons, who should skip it, the must-haves no source states, its sheet
function ProductDetail({ p, onOpen }: { p: ProductView; onOpen: () => void }) {
  const said = (title: string, items: { text: string }[], tone?: string) =>
    items.length > 0 && (
      <div className="grid gap-0.5">
        <span className={cx("eyebrow", tone && `tone-${tone}`)}>{title}</span>
        {items.map((x) => (
          <p key={x.text} className="m-0 text-small text-ink">
            {x.text}
          </p>
        ))}
      </div>
    );
  return (
    <>
      {said("Pros", p.words.pros, "green")}
      {said("Cons", p.words.cons, "orange")}
      {said("Who should skip it", p.words.skip)}
      {p.flags.length > 0 && <p className="m-0 text-small text-muted">No source says: {p.flags.join(", ")}</p>}
      <button type="button" className="btn btn-sm justify-self-start" onClick={onOpen}>
        Its offers and sources
      </button>
    </>
  );
}

// the products set aside, each with why: over the budget, a must-have missing, no longer in any source
function AlsoConsidered({ v, onOpen }: { v: WantView; onOpen: (product: string) => void }) {
  if (!v.also.length) return null;
  return (
    <details className="shop-also">
      <summary className="disclosure">
        Also considered <span className="font-mono text-small text-muted">{v.also.length}</span>
      </summary>
      <List label="Also considered">
        {v.also.map((p) => (
          <Row
            key={p.id}
            onOpen={() => onOpen(p.id)}
            title={<span className="block truncate">{p.name}</span>}
            line={<span className="block truncate">{sentence(p.out || "not among the finalists")}</span>}
            end={<Price cents={p.price} currency={v.currency} verdict={p.verdict?.word} />}
          />
        ))}
      </List>
    </details>
  );
}

// what the list rests on: what was assumed, what would change the pick, where the sources disagree, what to check
// before buying, and what the run couldn't do
function Notes({ v }: { v: WantView }) {
  const r = v.result;
  if (!r) return null;
  const part = (title: string, items: string[]) =>
    items.length > 0 && (
      <div className="grid content-start gap-1">
        <span className="eyebrow">{title}</span>
        {items.map((t) => (
          <p key={t} className="m-0 text-small text-ink">
            {t}
          </p>
        ))}
      </div>
    );
  // a second check that failed is in the notes already; one that had nothing to check says nothing
  const couldnt = r.notes.map(sentence);
  const any = r.assumptions.length + r.changeIf.length + r.conflicts.length + r.before.length + couldnt.length > 0;
  if (!any) return null;
  return (
    <section className="grid gap-3" aria-labelledby="shop-notes">
      <SectionHead id="shop-notes" title="What it rests on" />
      <div className="shop-notes">
        {r.before.length > 0 && (
          <div className="callout tone-orange grid content-start gap-1">
            <span className="eyebrow tone-orange">Before you buy</span>
            {r.before.map((t) => (
              <p key={t} className="m-0 text-small text-ink">
                {t}
              </p>
            ))}
          </div>
        )}
        {part(
          "Assumed",
          r.assumptions.map((s) => s.text),
        )}
        {part(
          "What would change the pick",
          r.changeIf.map((s) => s.text),
        )}
        {part(
          "Where the sources disagree",
          r.conflicts.map((s) => s.text),
        )}
        {part("What the run couldn't do", couldnt)}
      </div>
    </section>
  );
}
