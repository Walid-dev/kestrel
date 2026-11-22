// One listing, whole: its facts, the model's read, the deep check (run it, watch its steps, read its report), my note,
// the stages, Queue to apply and the attempts so far. A native dialog: Esc, Back and a tap outside close it.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ago, DEAL, day, type Listing, MATCH, payOf, ReadBox, STAGES, str, VERDICT } from "./cards.tsx";

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

function Section({ title, items, tone }: { title: string; items: string[]; tone?: string }) {
  if (items.length === 0) return null;
  return (
    <div className="grid gap-1">
      <span className="eyebrow" style={tone ? { color: `var(--${tone})` } : undefined}>
        {title}
      </span>
      {/* flush left: each point starts at the edge, no indent, so the width goes to the words */}
      {items.map((x) => (
        <p key={x} className="m-0 text-[14.5px] leading-relaxed">
          <span style={{ color: tone ? `var(--${tone})` : "var(--muted)" }}>•</span> {x}
        </p>
      ))}
    </div>
  );
}

function Report({ r, kind }: { r: Record<string, unknown>; kind: "jobs" | "deals" }) {
  const v = VERDICT[str(r.verdict)];
  const sources = (Array.isArray(r.sources) ? r.sources : []) as { title?: string; url?: string }[];
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {v && <span className={`chip ${v.tone}`}>{v.label}</span>}
        <span className="font-semibold" style={{ color: "var(--strong)" }}>
          {str(r.headline)}
        </span>
      </div>
      {kind === "deals" ? (
        <>
          {(typeof r.fair_low === "number" || typeof r.offer === "number") && (
            <p className="m-0 text-[14.5px]">
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
                  Offer first: <b style={{ color: "var(--green)" }}>${r.offer}</b>.
                </>
              )}
            </p>
          )}
          {str(r.price_why) && <p className="m-0 text-[14.5px]">{str(r.price_why)}</p>}
          <Section title="Check in person" items={list(r.checks)} />
          <Section title="Red flags" items={list(r.red_flags)} tone="red" />
          <Section title="Ask the seller" items={list(r.questions)} />
          {str(r.about) && (
            <p className="m-0 text-[14px]" style={{ color: "var(--muted)" }}>
              {str(r.about)}
            </p>
          )}
        </>
      ) : (
        <>
          <Section title="Where I fit" items={list(r.strengths)} tone="green" />
          <Section title="Gaps" items={list(r.gaps)} tone="yellow" />
          {str(r.pay) && (
            <div className="grid gap-1">
              <span className="eyebrow">Pay</span>
              <p className="m-0 text-[14.5px]">{str(r.pay)}</p>
            </div>
          )}
          {str(r.company) && (
            <div className="grid gap-1">
              <span className="eyebrow">The company</span>
              <p className="m-0 text-[14.5px]">{str(r.company)}</p>
            </div>
          )}
          <Section title="Red flags" items={list(r.red_flags)} tone="red" />
          <Section title="Ask them" items={list(r.questions)} />
          <Section title="Put forward" items={list(r.pitch)} tone="accent" />
        </>
      )}
      {sources.length > 0 && (
        <p className="m-0 text-xs" style={{ color: "var(--muted)" }}>
          Sources:{" "}
          {sources.map((s, i) => (
            <span key={s.url ?? i}>
              {i > 0 && " · "}
              <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                {s.title || s.url}
              </a>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

export function ListingSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const dialog = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    dialog.current?.showModal();
    // while the listing is open, only the listing scrolls: the page behind stays where it was
    const page = document.documentElement;
    const before = page.style.overflow;
    page.style.overflow = "hidden";
    return () => {
      page.style.overflow = before;
    };
  }, []);
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
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["listing", id] });
    queryClient.invalidateQueries({ queryKey: ["listings"] });
    queryClient.invalidateQueries({ queryKey: ["search-counts"] });
  };
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
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the dialog already closes from the keyboard (Esc) and Back
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
      className="m-auto max-h-[92dvh] w-[min(96vw,900px)] overflow-y-auto overscroll-contain rounded-2xl border p-0 backdrop:bg-black/60"
      style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}
    >
      {!l ? (
        <p className="p-6 text-sm" style={{ color: why ? "var(--red)" : "var(--muted)" }}>
          {why ? String((why.error as Error).message) : "Opening…"}
        </p>
      ) : (
        <div className="grid gap-3 p-4 md:p-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <span className="eyebrow">
                {[str(d.family) || str(d.category), l.source.replaceAll("-", " ")].filter(Boolean).join(" · ")}
              </span>
              <h2 className="font-cond m-0 mt-1 text-[26px] font-bold leading-tight">{str(d.title)}</h2>
              <p className="m-0 mt-1 text-[15px]">
                {str(d.org)}
                <span style={{ color: "var(--muted)" }}>
                  {[str(d.location), str(d.workMode)].filter(Boolean).map((x) => ` · ${x}`)}
                </span>
              </p>
            </div>
            <button type="button" className="btn btn-quiet" onClick={() => dialog.current?.close()}>
              Close
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {l.kind === "jobs" && payOf(d) && (
              <span
                className="font-mono rounded-lg px-2.5 py-1 text-[15px] font-bold"
                style={{ background: "var(--green)", color: "var(--bg)" }}
              >
                {payOf(d)}
              </span>
            )}
            {l.kind === "deals" && typeof d.price === "number" && (
              <span
                className="font-mono rounded-lg px-2.5 py-1 text-[17px] font-bold"
                style={{ background: "var(--green)", color: "var(--bg)" }}
              >
                ${Math.round(d.price)}
              </span>
            )}
            {l.kind === "jobs" && MATCH[l.match] && (
              <span className={`chip ${MATCH[l.match].tone}`}>
                {MATCH[l.match].label} · {l.score}
              </span>
            )}
            {l.kind === "deals" && l.deal && (
              <span className={`chip ${DEAL[l.deal.tier].tone}`}>
                {DEAL[l.deal.tier].label} · {l.deal.pct}% of usual
              </span>
            )}
            {str(d.posted) && (
              <span className="text-[13px]" style={{ color: "var(--muted)" }}>
                Posted {ago(str(d.posted))} · {day(str(d.posted))} · Found {day(l.found)}
              </span>
            )}
            <a
              href={l.link}
              target="_blank"
              rel="noopener noreferrer"
              className="btn ml-auto"
              style={{ color: "var(--accent)" }}
            >
              Open {l.kind === "deals" ? "the ad" : "the posting"} ↗
            </a>
          </div>
          {str(d.salaryNote) && (
            <p className="m-0 text-[13.5px]" style={{ color: "var(--muted)" }}>
              Pay note: {str(d.salaryNote)}
            </p>
          )}
          {str(d.why) && (
            <p className="m-0 text-[14.5px]" style={{ color: "var(--muted)" }}>
              Why: {str(d.why)}
            </p>
          )}
          {str(d.ghostWhy) && (
            <p className="m-0 rounded-lg px-3 py-2 text-[14px]" style={{ background: "var(--warn-soft)" }}>
              Signs to check: {str(d.ghostWhy)}
            </p>
          )}
          {typeof d.fit === "number" && (
            <ReadBox
              label="Model's read"
              chip={`Fit ${d.fit}/10`}
              tone={d.fit >= 7 ? "tone-green" : d.fit >= 4 ? "tone-yellow" : "tone-red"}
            >
              {str(d.fitWhy)}
            </ReadBox>
          )}

          <section className="card grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-cond m-0 text-lg font-bold">Deep check</h3>
              {l.deep?.finished && (
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {day(l.deep.finished)}
                </span>
              )}
              <button
                type="button"
                className="btn btn-primary ml-auto"
                disabled={running || deep.isPending}
                onClick={() => deep.mutate()}
              >
                {running ? "Checking…" : l.deep ? "Check again" : "Run a deep check"}
              </button>
            </div>
            {running && (
              <p className="m-0 flex items-center gap-2 text-sm" style={{ color: "var(--accent)" }}>
                <span className="dot tone-green pulse" /> {l.deep?.step || "Starting"}… the local model reads the
                posting, searches the web, then writes.
              </p>
            )}
            {l.deep?.state === "failed" && (
              <p className="m-0 text-sm" style={{ color: "var(--red)" }}>
                {l.deep.error}
              </p>
            )}
            {l.deep?.state === "done" && l.deep.report && <Report r={l.deep.report} kind={l.kind} />}
            {!l.deep && !running && (
              <p className="m-0 text-sm" style={{ color: "var(--muted)" }}>
                The local model reads {l.kind === "deals" ? "the ad" : "the posting"}, searches the web from this
                computer, and writes what it finds
                {l.kind === "deals"
                  ? ": a fair price, what to check, what to ask."
                  : ": where you fit, the gaps, the pay, the company, what to ask."}
              </p>
            )}
          </section>

          <section className="grid gap-2">
            <span className="eyebrow">My note</span>
            <textarea
              className="btn min-h-[70px] w-full resize-y text-[14.5px]"
              placeholder="Add a note…"
              value={note ?? str(d.note)}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => note !== null && note !== str(d.note) && act.mutate({ note })}
            />
          </section>

          <section className="flex flex-wrap gap-2">
            {STAGES[l.kind].map((s) => (
              <button
                key={s.status}
                type="button"
                className={`pill ${s.tone}`}
                aria-pressed={l.status === s.status}
                onClick={() => act.mutate({ status: s.status })}
              >
                <span className="dot" /> {s.label}
              </button>
            ))}
            <button
              type="button"
              className="pill"
              aria-pressed={l.starred === 1}
              onClick={() => act.mutate({ starred: l.starred === 1 ? 0 : 1 })}
            >
              <span style={{ color: "var(--yellow)" }}>★</span> {l.starred === 1 ? "Starred" : "Star"}
            </button>
            {l.kind === "jobs" && (
              <button
                type="button"
                className="btn btn-primary ml-auto"
                disabled={queue.isPending}
                onClick={() => queue.mutate()}
              >
                Queue to apply
              </button>
            )}
          </section>
          {why && (
            <p className="m-0 text-sm" style={{ color: "var(--red)" }}>
              {String((why.error as Error).message)}
            </p>
          )}

          {l.applications.length > 0 && (
            <section className="grid gap-1.5">
              <span className="eyebrow">Applications</span>
              {l.applications.map((a) => (
                <p key={a.id} className="m-0 text-[14px]">
                  <span
                    className={`chip ${a.state === "sent" ? "tone-accent" : a.state === "not-sent" ? "tone-orange" : "tone-purple"}`}
                  >
                    {a.state}
                  </span>{" "}
                  {day(a.updated)}
                  {a.reason && <span style={{ color: "var(--muted)" }}> · {a.reason}</span>}
                </p>
              ))}
            </section>
          )}
          {str(d.excerpt) && (
            <section className="grid gap-1.5">
              <span className="eyebrow">From the posting</span>
              <p className="m-0 whitespace-pre-line text-[14.5px] leading-relaxed" style={{ color: "var(--text)" }}>
                {str(d.excerpt)}
              </p>
            </section>
          )}
        </div>
      )}
    </dialog>
  );
}
