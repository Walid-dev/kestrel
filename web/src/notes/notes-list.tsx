// The document's notes: each with its words (or "the whole document"), a tap to open, and a small × to delete it
// right here. Detached and done notes say so.
import type { PlacedNote } from "../../../src/shared/notes.ts";

export function NotesList({
  notes,
  onOpen,
  onDelete,
}: {
  notes: PlacedNote[];
  onOpen: (n: PlacedNote) => void;
  onDelete: (n: PlacedNote) => void;
}) {
  if (notes.length === 0) return null;
  return (
    <section className="mt-5 grid gap-3 lg:mt-0">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--muted)" }}>
        Your notes
      </h3>
      {notes.map((n) => (
        <div key={n.id} className="card flex items-start gap-3">
          <button type="button" onClick={() => onOpen(n)} className="min-w-0 flex-1 cursor-pointer text-left">
            <span className="font-mono block break-words text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
              {n.quote === ""
                ? "the whole document"
                : `“${n.quote.length > 80 ? `${n.quote.slice(0, 80)}…` : n.quote}”`}
              {n.detached && (
                <span
                  className="ml-2 rounded-full px-2 py-0.5"
                  style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
                >
                  detached
                </span>
              )}
              {n.state === "done" && (
                <span
                  className="ml-2 rounded-full px-2 py-0.5"
                  style={{ background: "var(--add-soft)", color: "var(--green)" }}
                >
                  done
                </span>
              )}
            </span>
            <span className="mt-2 block text-[15px] leading-relaxed">{n.text}</span>
          </button>
          <button
            type="button"
            aria-label="Delete this note"
            title="Delete this note"
            className="shrink-0 cursor-pointer rounded-full border px-2 py-0.5 text-xs"
            style={{ borderColor: "var(--line)", color: "var(--muted)" }}
            onClick={() => onDelete(n)}
          >
            ×
          </button>
        </div>
      ))}
    </section>
  );
}
