// Apply: the one place that turns my notes into changes, and every state of it, where the notes are. On a computer it
// heads the notes' column, which stays beside the text as I scroll; on a phone it is a bar held at the screen's foot
// while I read, and it comes to rest above the notes at the end of the document. One filled button at a time: Apply,
// then Review the changes (or Try again). After a save it says so, with Download and Save as PDF.
import type { ReactNode } from "react";
import type { Draft } from "../../../src/shared/notes.ts";
import { cx } from "../ui/cx.ts";
import { notesWord, type Pace, plainWhy, Speed, sentence, Writing } from "./parts.tsx";

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

export function Apply(p: ApplyProps) {
  const { bar = false } = p;
  const changes =
    p.draft?.status === "ready" ? Object.values(p.draft.perDocument).reduce((n, r) => n + r.placed.length, 0) : 0;
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

  if (p.editing) {
    // the phone's bar steps aside while I edit (the editing head holds Save); the column says why Apply waits
    if (bar || (p.open === 0 && !p.draft)) return null;
    return <p className="m-0 text-small text-muted">Save or cancel your edit first, then Apply.</p>;
  }
  if (p.saved)
    return box(
      "tone-green",
      <>
        <p className="note-apply-say">
          Saved <b className="text-ink">{p.saved.changes === 1 ? "1 change" : `${p.saved.changes} changes`}</b>
          {bar ? "." : <> to {p.saved.name}. The earlier text is kept.</>}
          {p.open > 0 && (
            <span className="text-muted">
              {" "}
              <b className="text-ink">{p.open}</b> still open.
            </span>
          )}
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
    );
  if (p.draft?.status === "making")
    return box(
      "tone-accent",
      <>
        <div className="note-apply-say">
          <Writing model={p.draft.model} />
          {!bar && (
            <span className="mt-1 block text-small text-muted">
              You can leave: the changes open here when ready. Notes added now wait for the next Apply.
            </span>
          )}
        </div>
        <div className="note-apply-acts">
          <button type="button" className="btn btn-sm btn-quiet" onClick={p.onStop}>
            Stop
          </button>
        </div>
      </>,
    );
  if (p.draft?.status === "ready")
    return box(
      "tone-accent",
      <>
        <p className="note-apply-say">
          Changes ready · <b className="text-ink font-mono tabular-nums">{changes}</b> to check
        </p>
        <div className="note-apply-acts">
          <button type="button" className="btn btn-primary" onClick={p.onReview}>
            Review the changes
          </button>
        </div>
      </>,
    );
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
            <button type="button" className="btn btn-primary" disabled={p.applying} onClick={p.onApply}>
              Try again
            </button>
          )}
        </div>
      </>,
    );
  if (p.open === 0) return null;
  return (
    <div className={cx("note-apply-how", bar && "note-apply-row")}>
      <Speed value={p.speed} onChange={p.onSpeed} hint={!bar} />
      <button type="button" className="btn btn-primary" disabled={p.applying} onClick={p.onApply}>
        Apply {notesWord(p.open)}
      </button>
    </div>
  );
}
