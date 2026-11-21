// The note sheet: a native dialog (showModal), which Esc and Android's Back close. The words being typed live on the
// device until Save or Discard, so closing the app mid-note loses nothing.
import { useEffect, useRef } from "react";
import type { PlacedNote } from "../../../src/shared/notes.ts";

export type SheetTarget =
  | { kind: "new"; quote: string; start: number } // on selected words
  | { kind: "whole" } // on the whole document
  | { kind: "edit"; note: PlacedNote };

const draftKey = (docId: string, t: SheetTarget) =>
  `kestrel-note:${docId}:${t.kind === "edit" ? t.note.id : t.kind === "whole" ? "whole" : `new:${t.start}`}`;

export function NoteSheet({
  docId,
  target,
  onSave,
  onDelete,
  onClose,
}: {
  docId: string;
  target: SheetTarget;
  onSave: (text: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const key = draftKey(docId, target);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const kept = (() => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  })();
  const clear = () => {
    try {
      localStorage.removeItem(key);
    } catch {
      // storage can be off
    }
  };
  const on =
    target.kind === "whole"
      ? "the whole document"
      : target.kind === "new"
        ? `“${target.quote}”`
        : target.note.quote === ""
          ? "the whole document"
          : `“${target.note.quote}”`;
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      className="m-auto w-[min(92vw,480px)] rounded-2xl border p-0 backdrop:bg-black/50"
      style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--text)" }}
    >
      <form
        className="grid gap-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          const text = box.current?.value ?? "";
          clear();
          onSave(text);
        }}
      >
        <h2 className="font-cond text-lg font-bold">Your note</h2>
        <p className="break-words text-sm" style={{ color: "var(--muted)" }}>
          On {on}
        </p>
        <textarea
          ref={box}
          rows={4}
          autoFocus
          defaultValue={kept ?? (target.kind === "edit" ? target.note.text : "")}
          placeholder="What should change here?"
          className="w-full rounded-xl border p-3 text-[15px]"
          style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}
          onKeyDown={(e) => {
            // Enter submits, the app's rule; Shift+Enter makes the line
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              (e.target as HTMLTextAreaElement).form?.requestSubmit();
            }
          }}
          onInput={(e) => {
            try {
              localStorage.setItem(key, (e.target as HTMLTextAreaElement).value);
            } catch {
              // kept only until the sheet closes
            }
          }}
        />
        <p className="font-mono text-[11px]" style={{ color: "var(--muted)" }}>
          Enter saves · Shift+Enter for a new line
        </p>
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary">
            Save
          </button>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              clear();
              dialog.current?.close();
            }}
          >
            Discard
          </button>
          {target.kind === "edit" && (
            <button
              type="button"
              className="btn btn-danger ml-auto"
              onClick={() => {
                clear();
                onDelete();
              }}
            >
              Delete
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
