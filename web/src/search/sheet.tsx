// One listing, whole: its facts, the model's read, the deep check (run it, watch its steps, read its report), my note,
// the stages, Apply and the attempts so far. The shared Dialog, wide: Esc, Back, a tap outside and its ✕ close it,
// and it keeps the page behind still.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { cx } from "../ui/cx.ts";
import { Dialog } from "../ui/dialog.tsx";
import { Pills, type Tone } from "../ui/pills.tsx";
import {
  ApplyButton,
  ago,
  DEAL,
  day,
  type Listing,
  MATCH,
  moneyTone,
  payOf,
  ReadBox,
  STAGES,
  sourceName,
  str,
  VERDICT,
} from "./cards.tsx";

type Deep = {
  state: "running" | "done" | "failed";
  step: string;
  started: string;
  finished: string | null;
  report: Record<string, unknown> | null;
  error: string;
};
type Full = Listing & {
  deep: Deep | null;
  applications: { id: string; state: string; reason: string; started: string; updated: string }[];
};

const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function Section({ title, items, tone }: { title: string; items: string[]; tone?: Tone }) {
  if (items.length === 0) return null;
  return (
    <div className="grid gap-1">
      <span className={cx("eyebrow", tone && `tone-${tone}`)}>{title}</span>
      {/* flush left: each point starts at the edge, no indent, so the width goes to the words */}
      {items.map((x) => (
        <p key={x} className="m-0 text-detail">
          <span className={tone ? `tone-${tone} text-tone` : "text-muted"}>•</span> {x}
        </p>
      ))}
    </div>
  );
}

// a few plain words under an eyebrow: the report's pay, its company
function Said({ title, text }: { title: string; text: string }) {
  if (!text) return null;
  return (
    <div className="grid gap-1">
      <span className="eyebrow">{title}</span>
      <p className="m-0 text-detail">{text}</p>
    </div>
  );
}

function Report({ r, kind }: { r: Record<string, unknown>; kind: "jobs" | "deals" }) {
  const v = VERDICT[str(r.verdict)];
  const sources = (Array.isArray(r.sources) ? r.sources : []) as { title?: string; url?: string }[];
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {v && <span className={`chip tone-${v.tone}`}>{v.label}</span>}
        <span className="font-semibold text-strong">{str(r.headline)}</span>
      </div>
      {kind === "deals" ? (
        <>
          {(typeof r.fair_low === "number" || typeof r.offer === "number") && (
            <p className="m-0 text-detail">
              {typeof r.fair_low === "number" && typeof r.fair_high === "number" && (
                <>
                  Fair:{" "}
                  <b>
                    ${r.fair_low}–${r.fair_high}
                  </b>
                  .{" "}
                </>
              )}
              {typeof r.offer === "number" && (
                <>
                  Offer first: <b className="text-green">${r.offer}</b>.
                </>
              )}
            </p>
          )}
          {str(r.price_why) && <p className="m-0 text-detail">{str(r.price_why)}</p>}
          <Section title="Check in person" items={list(r.checks)} />
          <Section title="Red flags" items={list(r.red_flags)} tone="red" />
          <Section title="Ask the seller" items={list(r.questions)} />
          {str(r.about) && <p className="m-0 text-detail text-muted">{str(r.about)}</p>}
        </>
      ) : (
        <>
          <Section title="Where I fit" items={list(r.strengths)} tone="green" />
          <Section title="Gaps" items={list(r.gaps)} tone="yellow" />
          <Said title="Pay" text={str(r.pay)} />
          <Said title="The company" text={str(r.company)} />
          <Section title="Red flags" items={list(r.red_flags)} tone="red" />
          <Section title="Ask them" items={list(r.questions)} />
          <Section title="Put forward" items={list(r.pitch)} tone="accent" />
        </>
      )}
      {sources.length > 0 && (
        <p className="m-0 text-small text-muted">
          Sources:{" "}
          {sources.map((s, i) => (
            <span key={s.url ?? i}>
              {i > 0 && " · "}
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-accent">
                {s.title || s.url}
              </a>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

const APP_TONE: Record<string, Tone> = { sent: "accent", "not-sent": "orange" };

export function ListingSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState<string | null>(null);
  const full = useQuery({
    queryKey: ["listing", id],
    queryFn: async () => {
      const res = await fetch(`/api/search/listings/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`the listing didn't load (${res.status})`);
      return (await res.json()) as Full;
    },
    // while a deep check runs, its steps arrive every two seconds
    refetchInterval: (q) => (q.state.data?.deep?.state === "running" ? 2000 : false),
  });
  // the button stays busy until the listing's new state is in, so it never flashes back to Apply
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["listing", id] }),
      queryClient.invalidateQueries({ queryKey: ["listings"] }),
      queryClient.invalidateQueries({ queryKey: ["search-counts"] }),
    ]);
  const act = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/search/listings/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `${res.status}`);
    },
    onSettled: refresh,
  });
  const deep = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/search/listings/${encodeURIComponent(id)}/deep`, { method: "POST" });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `${res.status}`);
    },
    onSettled: refresh,
  });
  const queue = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/apply/queue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listing: id }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `${res.status}`);
    },
    onSettled: refresh,
  });

  const l = full.data;
  const d = l?.data ?? {};
  const why = [full, act, deep, queue].find((m) => m.isError);
  const running = l?.deep?.state === "running";
  const pay = l?.kind === "jobs" ? payOf(d) : "";
  const where = [str(d.location), str(d.workMode)].filter(Boolean);

  if (!l)
    return (
      <Dialog open onClose={onClose} wide title={full.isError ? "The listing didn't open" : "Opening…"}>
        {why && <p className="text-red">{String((why.error as Error).message)}</p>}
      </Dialog>
    );
  return (
    <Dialog
      open
      onClose={onClose}
      wide
      eyebrow={[str(d.family) || str(d.category), sourceName(l.source)].filter(Boolean).join(" · ")}
      // the listing's head: its title, the company and where, then the pay or price and the match (listing-head keeps
      // the head on top while the sheet scrolls, styles.css). The {" "} between its parts change nothing on screen
      // (a grid and a flex row drop them) but keep the words apart when the title is read out, as the box's name
      title={
        <span className="listing-head grid gap-1">
          <span>{str(d.title)}</span>{" "}
          <span className="font-sans text-body font-normal text-ink">
            {str(d.org)}
            {where.length > 0 && (
              <span className="text-muted">
                {str(d.org) && " · "}
                {where.join(" · ")}
              </span>
            )}
          </span>{" "}
          <span className="flex flex-wrap items-center gap-2 pt-1 font-sans font-normal">
            {pay && <span className={cx("money text-body", moneyTone(l.match))}>{pay}</span>}
            {l.kind === "deals" && typeof d.price === "number" && (
              <span className={cx("money text-head", l.deal && moneyTone(l.deal.tier))}>${Math.round(d.price)}</span>
            )}{" "}
            {l.kind === "jobs" && MATCH[l.match] && (
              <span className={`chip tone-${MATCH[l.match].tone}`}>
                {MATCH[l.match].label} · {l.score}
              </span>
            )}
            {l.kind === "deals" && l.deal && (
              <span className={`chip tone-${DEAL[l.deal.tier].tone}`}>
                {DEAL[l.deal.tier].label} · {l.deal.pct}% of usual
              </span>
            )}
          </span>
        </span>
      }
      // the sheet's own actions at its foot, the main one last: the posting itself, and Apply
      actions={
        <>
          <a href={l.link} target="_blank" rel="noopener noreferrer" className="btn">
            Open {l.kind === "deals" ? "the ad" : "the posting"} ↗
          </a>
          {l.kind === "jobs" && (
            <ApplyButton state={l.applications[0]?.state} onQueue={() => queue.mutate()} pending={queue.isPending} />
          )}
        </>
      }
    >
      <div className="grid gap-3 pb-1">
        {str(d.posted) && (
          <p className="text-small text-muted">
            Posted {ago(str(d.posted))} · {day(str(d.posted))} · Found {day(l.found)}
          </p>
        )}
        {str(d.salaryNote) && <p className="text-small text-muted">Pay note: {str(d.salaryNote)}</p>}
        {str(d.why) && <p className="text-detail text-muted">Why: {str(d.why)}</p>}
        {str(d.ghostWhy) && (
          <p className="rounded-lg bg-warn-soft px-3 py-2 text-detail">Signs to check: {str(d.ghostWhy)}</p>
        )}
        {typeof d.fit === "number" && (
          <ReadBox
            label="Model's read"
            chip={`Fit ${d.fit}/10`}
            chipTone={d.fit >= 7 ? "green" : d.fit >= 4 ? "yellow" : "red"}
          >
            {str(d.fitWhy)}
          </ReadBox>
        )}

        <section className="card card-stack">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-cond m-0 text-head font-bold">Deep check</h3>
            {l.deep?.finished && <span className="text-small text-muted">{day(l.deep.finished)}</span>}
            <button
              type="button"
              className="btn ml-auto inline-flex items-center gap-2"
              disabled={running || deep.isPending}
              onClick={() => deep.mutate()}
            >
              {(running || deep.isPending) && <span className="spin" />}
              {running ? "Checking…" : l.deep ? "Check again" : "Run a deep check"}
            </button>
          </div>
          {running && (
            <p className="m-0 flex items-center gap-2 text-detail text-accent">
              <span className="dot tone-green pulse" /> {l.deep?.step || "Starting"}… the local model reads the posting,
              searches the web, then writes.
            </p>
          )}
          {l.deep?.state === "failed" && <p className="m-0 text-detail text-red">{l.deep.error}</p>}
          {l.deep?.state === "done" && l.deep.report && <Report r={l.deep.report} kind={l.kind} />}
          {!l.deep && !running && (
            <p className="m-0 text-detail text-muted">
              The local model reads {l.kind === "deals" ? "the ad" : "the posting"}, searches the web from this
              computer, and writes what it finds
              {l.kind === "deals"
                ? ": a fair price, what to check, what to ask."
                : ": where you fit, the gaps, the pay, the company, what to ask."}
            </p>
          )}
        </section>

        {/* the note saves when I leave the box, so it is the shared box's look without its Enter-sends rule */}
        <label className="field field-tall">
          <span className="eyebrow">My note</span>
          <span className="field-box">
            <textarea
              className="field-input"
              placeholder="Add a note…"
              value={note ?? str(d.note)}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => note !== null && note !== str(d.note) && act.mutate({ note })}
            />
          </span>
        </label>

        {/* Star wraps in line after the stage pills, not on a row of its own (styles.css); the label stands over
            them both, and the group keeps its name for a screen reader */}
        <div className="grid gap-2">
          <span className="eyebrow" aria-hidden="true">
            Stage
          </span>
          <div className="pills-inline flex flex-wrap items-center gap-2">
            <Pills
              label="Stage"
              options={STAGES[l.kind].map((s) => ({ value: s.status, label: s.label, tone: s.tone }))}
              value={l.status}
              onChange={(s) => act.mutate({ status: s })}
            />
            <button
              type="button"
              className="pill"
              aria-pressed={l.starred === 1}
              onClick={() => act.mutate({ starred: l.starred === 1 ? 0 : 1 })}
            >
              <span className="text-yellow">★</span> {l.starred === 1 ? "Starred" : "Star"}
            </button>
          </div>
        </div>
        {why && <p className="text-detail text-red">{String((why.error as Error).message)}</p>}

        {l.applications.length > 0 && (
          <section className="grid gap-1.5">
            <span className="eyebrow">Applications</span>
            {l.applications.map((a) => (
              <p key={a.id} className="m-0 text-detail">
                <span className={`chip tone-${APP_TONE[a.state] ?? "purple"}`}>{a.state}</span> {day(a.updated)}
                {a.reason && <span className="text-muted"> · {a.reason}</span>}
              </p>
            ))}
          </section>
        )}
        {str(d.excerpt) && (
          <section className="grid gap-1.5">
            <span className="eyebrow">From the posting</span>
            <p className="m-0 whitespace-pre-line text-body text-ink">{str(d.excerpt)}</p>
          </section>
        )}
      </div>
    </Dialog>
  );
}
