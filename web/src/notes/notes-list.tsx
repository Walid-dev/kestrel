// The document's notes: each with its words (or "the whole document"), a tap to open, and the card's ✕ to delete it
// right here. Detached and done notes say so.
import { bare } from "../../../src/shared/markdown.ts";
import type { PlacedNote } from "../../../src/shared/notes.ts";
import { Card } from "../ui/card.tsx";
import { EmptyState } from "../ui/empty.tsx";

const quoted = (n: PlacedNote) => {
  if (n.quote === "") return "The whole document";
  const words = bare(n.quote);
  return `“${words.length > 80 ? `${words.slice(0, 80)}…` : words}”`;
};

export function NotesList({
  notes,
  onOpen,
  onDelete,
}: {
  notes: PlacedNote[];
  onOpen: (n: PlacedNote) => void;
  onDelete: (n: PlacedNote) => void;
}) {
  return (
    <section className="grid gap-3" aria-labelledby="notes-mine">
      <h2 id="notes-mine" className="font-cond m-0 text-head font-bold">
        Your notes{notes.length > 0 && <span className="font-mono ml-2 text-small text-muted">{notes.length}</span>}
      </h2>
      {/* none yet: the column says how a note starts, so it never stands empty */}
      {notes.length === 0 ? (
        <EmptyState
          title="No notes yet."
          line="Select words in the document, then tap Note beside them, and say what should change."
        />
      ) : (
        notes.map((n) => (
          <Card
            key={n.id}
            // the note's own words are what I look for; the words it sits on come first, small
            title={<span className="line-clamp-4 font-sans text-body font-normal text-ink">{n.text}</span>}
            onOpen={() => onOpen(n)}
            onRemove={() => onDelete(n)}
            removeLabel="Delete this note"
            meta={
              <>
                <span className="font-mono min-w-0 break-words text-small text-muted">{quoted(n)}</span>
                {n.detached && <span className="chip chip-caps tone-orange">detached</span>}
                {n.state === "done" && <span className="chip chip-caps tone-green">done</span>}
              </>
            }
          />
        ))
      )}
    </section>
  );
}
