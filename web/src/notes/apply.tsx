// Apply: the one place that turns my notes into changes, and every state of it, where the notes are. On a computer it
// heads the notes' column, which stays beside the text as I scroll; on a phone it is a bar held at the screen's foot
// while I read, and it comes to rest above the notes at the end of the document (on a short screen, a phone on its
// side, it sits in the document's head instead). One filled button at a time: Apply, then Review the changes (or Try
// again, its pace still mine to change). While the model works it says how far it is: which model, how many notes,
// the time so far against what it usually takes, and the step (Working, below); Stop stays quiet. After a save it says
// so, with Download and Save as PDF, and Apply comes back under that line for the notes still open.
import { type ReactNode, useEffect, useState } from "react";
import type { Draft } from "../../../src/shared/notes.ts";
import { cx } from "../ui/cx.ts";
import { notesWord, type Pace, paceOf, plainWhy, Speed, sentence } from "./parts.tsx";

export type AppliedSave = { changes: number; name: string };

export type ApplyProps = {
  // open notes, waiting for Apply
  open: number;
  draft: Draft | null;
  // the document is being edited by hand: Apply waits for that edit to end
  editing?: boolean;
  speed: Pace;
  onSpeed: (p: Pace) => void;
  onApply: () => void;
  applying: boolean;
  // the ask refused before any draft (another one is being made, the set is too long)
  askWhy: string;
  onStop: () => void;
  onReview: () => void;
  // a failed ask set aside: the notes stay open
  onDismiss: () => void;
  // the last save, on this page, until I close it or leave a note
  saved?: AppliedSave | null;
  onCloseSaved?: () => void;
  // what the saved line offers: the new text as a file, the print page, Undo
  onDownload?: () => void;
  printHref?: string;
  onUndo?: () => void;
  undoing?: boolean;
  // the phone's bar: one row, no hint lines
  bar?: boolean;
};

// a count, in the numbers' voice
const num = (n: number) => <b className="font-mono text-ink tabular-nums">{n}</b>;

export function Apply(p: ApplyProps) {
  const { bar = false } = p;
  // the changes still to check: a set's document already saved has had its review
  const changes =
    p.draft?.status === "ready"
      ? Object.values(p.draft.perDocument).reduce((n, r) => n + (r.savedAt ? 0 : r.placed.length), 0)
      : 0;
  const failed = p.draft?.status === "failed" || p.askWhy !== "";
  // failed and saved put their buttons on a row of their own, under the words
  const box = (tone: string, children: ReactNode) => (
    <div
      className={cx("note-apply-box", tone, (tone === "tone-orange" || tone === "tone-green") && "note-apply-stack")}
      role={tone === "tone-orange" ? "alert" : undefined}
    >
      {children}
    </div>
  );

  // the model's changes, waiting for their review
  const ready = box(
    "tone-accent",
    <>
      <p className="note-apply-say">Changes ready · {num(changes)} to check</p>
      <div className="note-apply-acts">
        <button type="button" className="btn btn-primary" onClick={p.onReview}>
          Review the changes
        </button>
      </div>
    </>,
  );
  // the pace and Apply, for the notes waiting
  const how = (
    <div className={cx("note-apply-how", bar && "note-apply-row")}>
      <Speed value={p.speed} onChange={p.onSpeed} hint={!bar} />
      <button type="button" className="btn btn-primary" disabled={p.applying} onClick={p.onApply}>
        Apply {notesWord(p.open)}
      </button>
    </div>
  );
  if (p.editing) {
    // the phone's bar steps aside while I edit (the editing head holds Save); the column says why Apply waits
    if (bar || (p.open === 0 && !p.draft)) return null;
    return <p className="m-0 text-small text-muted">Save or cancel your edit first, then Apply.</p>;
  }
  if (p.saved)
    return (
      <div className="note-apply-pair">
        {box(
          "tone-green",
          <>
            <p className="note-apply-say">
              Saved {num(p.saved.changes)} {p.saved.changes === 1 ? "change" : "changes"}
              {bar ? "." : <> to {p.saved.name}. The earlier text is kept.</>}
              {p.open > 0 && <span className="text-muted"> {num(p.open)} still open.</span>}
            </p>
            <button
              type="button"
              className="btn btn-icon btn-quiet note-apply-x"
              aria-label="Close"
              title="Close"
              onClick={p.onCloseSaved}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            <div className="note-apply-acts">
              {p.onDownload && (
                <button type="button" className="btn btn-sm" onClick={p.onDownload}>
                  Download
                </button>
              )}
              {p.printHref && (
                <a href={p.printHref} target="_blank" rel="noopener" className="btn btn-sm">
                  Save as PDF
                </a>
              )}
              {p.onUndo && (
                <button type="button" className="btn btn-sm btn-quiet" disabled={p.undoing} onClick={p.onUndo}>
                  Undo
                </button>
              )}
            </div>
          </>,
        )}
        {/* what comes next, under the line: a set's other documents still to review, or the notes left open (a
            change dropped, one not placed) for the next Apply */}
        {p.draft?.status === "ready" && changes > 0 ? ready : p.open > 0 && !p.draft && how}
      </div>
    );
  if (p.draft?.status === "making") return <Working draft={p.draft} bar={bar} onStop={p.onStop} />;
  if (p.draft?.status === "ready") return ready;
  if (failed)
    return box(
      "tone-orange",
      <>
        <p className={cx("note-apply-say", bar && "line-clamp-2")}>
          {p.askWhy
            ? sentence(p.askWhy)
            : `The model didn't answer: ${plainWhy(p.draft?.error ?? "")}. Your notes are kept.`}
        </p>
        <div className="note-apply-acts">
          <button type="button" className="btn btn-quiet" onClick={p.onDismiss}>
            Dismiss
          </button>
          {p.open > 0 && (
            <>
              {/* a pace that timed out can be retried on the other one in one step */}
              <Speed value={p.speed} onChange={p.onSpeed} hint={false} />
              <button type="button" className="btn btn-primary" disabled={p.applying} onClick={p.onApply}>
                Try again
              </button>
            </>
          )}
        </div>
      </>,
    );
  if (p.open === 0) return null;
  return how;
}

// a time so far, as Live says it: "40s", "2m 05s"
const took = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
};
// what a model usually takes, rounded as one says it: "about 40s", "about 3 min"
const about = (ms: number) =>
  ms < 60_000 ? `about ${Math.round(ms / 10_000) * 10 || 10}s` : `about ${Math.round(ms / 60_000)} min`;

// the clock, once a second while the work runs
function useNow(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

// the model at work on the notes, where the eye is: what it does (n notes, which model), the time so far against what
// it usually takes, and the steps (the model reads, writes the changes, counted as they come, then I check each one).
// The phone's bar says the step and the time in two short lines; the column shows the steps whole. The review opens
// by itself when the changes are in (the page watches for it).
function Working({ draft, bar, onStop }: { draft: Draft; bar: boolean; onStop: () => void }) {
  const now = useNow();
  const pace = paceOf(draft.model);
  const so = took(now - Date.parse(draft.createdAt));
  const usual = draft.usualMs === null ? "" : `usually ${about(draft.usualMs)}`;
  const writing = draft.step === "writing" || draft.step === "placing";
  const written = draft.written > 0 ? ` · ${draft.written} so far` : "";
  // what the model reads: one document, or a set's
  const what = `${draft.documents.length > 1 ? `the ${draft.documents.length} documents` : "the document"} and ${notesWord(draft.notes)}`;
  const doing = writing ? `Writing the changes${written}` : `Reading ${what}`;
  const stop = (
    <div className="note-apply-acts">
      <button type="button" className="btn btn-sm btn-quiet" onClick={onStop}>
        Stop
      </button>
    </div>
  );
  if (bar)
    return (
      <div className="note-apply-box note-work tone-accent" role="status">
        <p className="note-apply-say">
          <span className="note-work-now">
            <span className="dot pulse" aria-hidden="true" />
            {doing}
          </span>{" "}
          <span className="note-work-meta">
            {sentence(pace)} model · <span className="font-mono tabular-nums">{so}</span>
            {usual && ` · ${usual}`}
          </span>
        </p>
        {stop}
      </div>
    );
  const steps: { text: string; state: "done" | "now" | "next" }[] = [
    { text: `Read ${what}`, state: writing ? "done" : "now" },
    { text: `Write the changes${written}`, state: writing ? "now" : "next" },
    { text: "You check each one, then Save", state: "next" },
  ];
  return (
    <div className="note-apply-box note-work-col tone-accent" role="status">
      <div className="note-work-head">
        <p className="m-0 text-detail font-medium text-strong">Applying {notesWord(draft.notes)}</p>
        <span className="font-mono text-small text-ink tabular-nums" title="The time so far">
          {so}
        </span>
      </div>
      <p className="m-0 text-small text-muted">
        The {pace} model{usual ? ` · ${usual}` : pace === "careful" ? " · a few minutes" : ""}
      </p>
      <ol className="note-work-steps">
        {steps.map((st) => (
          <li key={st.text} data-state={st.state}>
            <span className="note-work-mark" aria-hidden="true">
              {st.state === "done" ? "✓" : st.state === "now" ? <span className="dot pulse" /> : "○"}
            </span>
            {st.text}
          </li>
        ))}
      </ol>
      <div className="note-work-foot">
        <span className="text-small text-muted" title="Notes added now wait for the next Apply.">
          You can leave: the review opens here.
        </span>
        {stop}
      </div>
    </div>
  );
}
