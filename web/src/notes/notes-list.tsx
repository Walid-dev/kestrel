// The document's notes under the reader: each with its words (or "the whole document"), detached when the words are
// gone. Tapping one opens it in the sheet.
import type { PlacedNote } from "../../../src/shared/notes.ts";

export function NotesList({ notes, onOpen }: { notes: PlacedNote[]; onOpen: (n: PlacedNote) => void }) {
  if (notes.length === 0) return null;
  return (
    <section className="mt-4 grid gap-2">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--muted)" }}>
        Your notes
      </h3>
      {notes.map((n) => (
        <button
          key={n.id}
          type="button"
          onClick={() => onOpen(n)}
          className="cursor-pointer rounded-xl border p-3 text-left"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        >
          <span className="font-mono block break-words text-xs" style={{ color: "var(--muted)" }}>
            {n.quote === "" ? "the whole document" : `“${n.quote.length > 80 ? `${n.quote.slice(0, 80)}…` : n.quote}”`}
            {n.detached && (
              <span
                className="ml-2 rounded-full px-2 py-0.5"
                style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
              >
                detached: its words are gone
              </span>
            )}
            {n.state === "done" && (
              <span
                className="ml-2 rounded-full px-2 py-0.5"
                style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
              >
                done
              </span>
            )}
          </span>
          <span className="mt-1 block text-sm">{n.text}</span>
        </button>
      ))}
    </section>
  );
}
