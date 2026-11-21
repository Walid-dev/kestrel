// The review: the model's overview, each change as a word diff, what was left out and why, and the notes the text
// alone couldn't answer. A native dialog (showModal); Save joins in the next step — nothing touches a file here.

import { useEffect, useRef } from "react";
import type { Draft } from "../../../src/shared/notes.ts";
import { wordDiff } from "./diff.ts";

const COLORS = {
  del: { background: "var(--warn-soft)", color: "var(--warn)", textDecoration: "line-through" },
  add: { background: "var(--accent-soft)", color: "var(--accent)" },
  same: {},
} as const;

export function Review({
  draft,
  targets,
  onSave,
  saving,
  saveWhy,
  onDiscard,
  onClose,
}: {
  draft: Draft;
  targets: Record<string, string>;
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
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      className="m-auto max-h-[85dvh] w-[min(94vw,640px)] overflow-y-auto rounded-2xl border p-0 backdrop:bg-black/50"
      style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--text)" }}
    >
      <div className="grid gap-4 p-5">
        <h2 className="font-cond text-lg font-bold">The changes, before anything is saved</h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {draft.overview}
        </p>
        {draft.documents.map((d) => {
          const result = draft.perDocument[d.id];
          if (!result) return null;
          return (
            <section key={d.id} className="grid gap-2">
              <h3 className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--muted)" }}>
                {d.name} · {result.placed.length} placed
                {result.leftOut.length ? ` · ${result.leftOut.length} left out` : ""}
              </h3>
              {result.placed.map((p) => (
                <div
                  key={p.at}
                  className="rounded-xl border p-3 text-sm leading-relaxed"
                  style={{ borderColor: "var(--line)", background: "var(--bg)" }}
                >
                  {wordDiff(p.change.find, p.change.replace).map((piece, i) =>
                    piece.kind === "same" ? (
                      piece.text
                    ) : (
                      // biome-ignore lint/suspicious/noArrayIndexKey: pieces are display-only and never reorder
                      <span key={i} className="rounded px-0.5" style={COLORS[piece.kind]}>
                        {piece.text}
                      </span>
                    ),
                  )}
                </div>
              ))}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="font-cond cursor-pointer rounded-xl px-4 py-2 font-bold"
                  style={
                    result.savedAt
                      ? { background: "var(--surface-2)", color: "var(--muted)" }
                      : { background: "var(--accent)", color: "var(--bg)" }
                  }
                  disabled={saving || Boolean(result.savedAt) || result.placed.length === 0}
                  onClick={() => onSave(d.id)}
                >
                  {result.savedAt ? "Saved" : "Save"}
                </button>
                <span className="font-mono break-all text-xs" style={{ color: "var(--muted)" }}>
                  writes {targets[d.id] ?? d.name}
                </span>
              </div>
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
        <div className="flex gap-2">
          <button
            type="button"
            className="cursor-pointer rounded-xl border px-4 py-2"
            style={{ borderColor: "var(--line)", color: "var(--muted)" }}
            onClick={() => dialog.current?.close()}
          >
            Close
          </button>
          <button
            type="button"
            className="ml-auto cursor-pointer rounded-xl border px-4 py-2"
            style={{ borderColor: "var(--line)", color: "var(--warn)" }}
            onClick={onDiscard}
          >
            Discard the draft
          </button>
        </div>
      </div>
    </dialog>
  );
}
