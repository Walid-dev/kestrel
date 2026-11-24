// The note sheet, in the app's one box (ui/dialog.tsx): Esc, Back, a tap outside and ✕ close it. The words being
// typed live on the device until Save or Discard, so closing it, or the app, mid-note loses nothing.
import { useEffect, useRef, useState } from "react";
import { bare } from "../../../src/shared/markdown.ts";
import type { PlacedNote } from "../../../src/shared/notes.ts";
import { enterSends } from "../keys.ts";
import { Dialog } from "../ui/dialog.tsx";
import { sentence } from "./parts.tsx";

export type SheetTarget =
  | { kind: "new"; quote: string; start: number; shown?: string } // on selected words (shown: as I saw them)
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
  onSave: (text: string) => Promise<void>;
  onDelete: () => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false); // one save at a time: no double submits, no closing mid-flight
  const key = draftKey(docId, target);
  const [kept] = useState(() => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  });
  // kept words or a note being changed: the cursor waits at their end, so what I type next follows them. The Dialog
  // (a child, so its effect runs first) has just given the box the focus; this moves the cursor inside it.
  useEffect(() => {
    const t = box.current;
    if (t) t.setSelectionRange(t.value.length, t.value.length);
  }, []);
  const clear = () => {
    try {
      localStorage.removeItem(key);
    } catch {
      // storage can be off
    }
  };
  const save = async () => {
    if (busy) return;
    const text = box.current?.value ?? "";
    setBusy(true);
    try {
      // the kept words clear only after the save lands; a failure keeps the sheet open with the reason (R2-7)
      await onSave(text);
      clear();
      onClose();
    } catch (err) {
      setWhy((err as Error).message || "the save didn't land: try again");
    } finally {
      setBusy(false);
    }
  };
  const on =
    target.kind === "whole"
      ? "the whole document"
      : target.kind === "new"
        ? `“${(target.shown ?? target.quote).trim()}”`
        : target.note.quote === ""
          ? "the whole document"
          : `“${bare(target.note.quote)}”`;
  return (
    <Dialog
      open
      onClose={onClose}
      busy={busy}
      title="Your note"
      actions={
        <>
          {target.kind === "edit" && (
            <button
              type="button"
              className="btn btn-danger mr-auto"
              disabled={busy}
              onClick={() => {
                clear();
                onDelete();
              }}
            >
              Delete
            </button>
          )}
          <button
            type="button"
            className="btn btn-quiet"
            disabled={busy}
            onClick={() => {
              clear();
              onClose();
            }}
          >
            Discard
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="grid gap-3">
        {/* a long passage shows its start: the note is what is being written here */}
        <p className="line-clamp-4 break-words text-detail text-muted">On {on}</p>
        {/* the shared Field's look, without its send button: Save sits with Discard at the box's foot, and the box
            takes the first focus (data-autofocus), which Field can't be asked for */}
        <div className="field field-tall">
          <div className="field-box">
            <textarea
              ref={box}
              data-autofocus
              rows={4}
              className="field-input"
              aria-label="Your note"
              defaultValue={kept ?? (target.kind === "edit" ? target.note.text : "")}
              placeholder="What should change here?"
              enterKeyHint="done"
              onKeyDown={enterSends(save)}
              onInput={(e) => {
                try {
                  localStorage.setItem(key, (e.target as HTMLTextAreaElement).value);
                } catch {
                  // kept only until the sheet closes
                }
              }}
            />
          </div>
          <span className="field-hint">Enter saves · Shift+Enter for a new line</span>
        </div>
        {why && (
          <p role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-detail">
            {sentence(why.replace(/\.$/, ""))}. Your words are kept here.
          </p>
        )}
      </div>
    </Dialog>
  );
}
