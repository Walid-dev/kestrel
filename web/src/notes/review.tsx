// The review, read like a code diff: minus lines out (red), plus lines in (green), the whole document when it is
// small so the change reads in its place. One row of buttons; Save names the file it writes. A native dialog.
import { useEffect, useRef } from "react";
import type { Draft } from "../../../src/shared/notes.ts";
import { type DiffRow, diffRows } from "./diff.ts";

const ROW: Record<DiffRow["kind"], { mark: string; style: React.CSSProperties }> = {
  same: { mark: " ", style: {} },
  del: { mark: "−", style: { background: "var(--del-soft)", color: "var(--red)" } },
  add: { mark: "+", style: { background: "var(--add-soft)", color: "var(--green)" } },
  skip: { mark: "⋯", style: { color: "var(--muted)" } },
};

export function Review({
  draft,
  targets,
  texts,
  onSave,
  saving,
  saveWhy,
  onDiscard,
  onClose,
}: {
  draft: Draft;
  targets: Record<string, string>;
  texts: Record<string, string>;
  onSave: (documentId: string) => void;
  saving: boolean;
  saveWhy: string;
  onDiscard: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const one = draft.documents.length === 1 ? draft.documents[0] : null;
  const oneResult = one ? draft.perDocument[one.id] : null;
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the dialog already closes from the keyboard (Esc) and Back
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => {
        // clicking outside the box closes it, like Esc and Back (the draft stays)
        if (e.target === dialog.current) dialog.current?.close();
      }}
      className="m-auto max-h-[88dvh] w-[min(94vw,760px)] overflow-y-auto rounded-2xl border p-0 backdrop:bg-black/50"
      style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--text)" }}
    >
      <div className="grid gap-4 p-5">
        <h2 className="font-cond text-lg font-bold">The changes, before anything is saved</h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {draft.overview}
        </p>
        {draft.documents.map((d) => {
          const result = draft.perDocument[d.id];
          const old = texts[d.id];
          if (!result || old === undefined) return null;
          return (
            <section key={d.id} className="grid gap-2">
              <h3 className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--muted)" }}>
                {d.name} · {result.placed.length} placed
                {result.leftOut.length ? ` · ${result.leftOut.length} left out` : ""}
              </h3>
              <div
                className="overflow-x-auto rounded-xl border py-2 text-[13px] leading-relaxed"
                style={{ borderColor: "var(--line)", background: "var(--bg)" }}
              >
                {diffRows(old, result.newText).map((row, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: display-only rows that never reorder
                  <div key={i} className="flex gap-2 px-3" style={ROW[row.kind].style}>
                    <span className="font-mono w-3 shrink-0 select-none text-right">{ROW[row.kind].mark}</span>
                    <span className="min-w-0 whitespace-pre-wrap break-words">{row.text || " "}</span>
                  </div>
                ))}
              </div>
              {!one && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className={result.savedAt ? "btn btn-quiet" : "btn btn-primary"}
                    disabled={saving || Boolean(result.savedAt) || result.placed.length === 0}
                    onClick={() => onSave(d.id)}
                  >
                    {result.savedAt ? "Saved" : "Save"}
                  </button>
                  <span className="font-mono break-all text-xs" style={{ color: "var(--muted)" }}>
                    writes {targets[d.id] ?? d.name}
                  </span>
                </div>
              )}
              {result.leftOut.map((lost) => (
                <p
                  key={lost.change.find}
                  className="rounded-xl px-3 py-2 text-sm"
                  style={{ background: "var(--warn-soft)" }}
                >
                  Left out — {lost.reason}: “{lost.change.find.slice(0, 80)}”
                </p>
              ))}
            </section>
          );
        })}
        {draft.unanswered.length > 0 && (
          <section className="grid gap-1">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--muted)" }}>
              Not answered
            </h3>
            {draft.unanswered.map((u) => (
              <p key={u.note} className="text-sm" style={{ color: "var(--muted)" }}>
                {u.reason}
              </p>
            ))}
          </section>
        )}
        {saveWhy && (
          <p className="rounded-xl px-3 py-2 text-sm" style={{ background: "var(--warn-soft)" }}>
            {saveWhy}
          </p>
        )}
        {one && (
          <p className="font-mono break-all text-xs" style={{ color: "var(--muted)" }}>
            Save writes {targets[one.id] ?? one.name}
          </p>
        )}
        <div className="flex items-center gap-2">
          {one && oneResult && (
            <button
              type="button"
              className={oneResult.savedAt ? "btn btn-quiet" : "btn btn-primary"}
              disabled={saving || Boolean(oneResult.savedAt) || oneResult.placed.length === 0}
              onClick={() => onSave(one.id)}
            >
              {oneResult.savedAt ? "Saved" : "Save"}
            </button>
          )}
          <button type="button" className="btn btn-quiet" onClick={() => dialog.current?.close()}>
            Close
          </button>
          <button type="button" className="btn btn-danger ml-auto" onClick={onDiscard}>
            Discard the draft
          </button>
        </div>
      </div>
    </dialog>
  );
}
