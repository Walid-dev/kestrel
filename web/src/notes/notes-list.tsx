// The document's notes, a part of the reader's rail (headed by its eyebrow, "Your notes · 3", as News' Earlier days):
// the open ones first, each with its words (or "the whole document"), a tap to open, and the card's ✕ to delete it
// right here; Apply heads them (apply.tsx, passed in). The notes a save answered fold away under Done, so a good save
// never looks like an error: only an open note says it is detached.
import type { ReactNode, Ref } from "react";
import { bare } from "../../../src/shared/markdown.ts";
import type { PlacedNote } from "../../../src/shared/notes.ts";
import { Card } from "../ui/card.tsx";
import { EmptyState } from "../ui/empty.tsx";
import { RailPart } from "../ui/rail.tsx";

const quoted = (n: PlacedNote) => {
  if (n.quote === "") return "The whole document";
  const words = bare(n.quote);
  return `“${words.length > 80 ? `${words.slice(0, 80)}…` : words}”`;
};

export function NotesList({
  notes,
  headRef,
  apply,
  onOpen,
  onDelete,
}: {
  notes: PlacedNote[];
  // where the focus lands when a deleted note's card takes its ✕ with it
  headRef?: Ref<HTMLHeadingElement>;
  // Apply and its states, under the heading
  apply?: ReactNode;
  onOpen: (n: PlacedNote) => void;
  onDelete: (n: PlacedNote) => void;
}) {
  const open = notes.filter((n) => n.state === "open");
  const done = notes.filter((n) => n.state === "done");
  const card = (n: PlacedNote) => (
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
          {n.state === "open" && n.detached && <span className="chip chip-caps tone-orange">detached</span>}
        </>
      }
    />
  );
  return (
    <RailPart id="notes-mine" headRef={headRef} title="Your notes" count={open.length || undefined}>
      {apply}
      {/* none open: the column says how a note starts, so it never stands empty */}
      {open.length === 0 ? (
        <EmptyState
          title={done.length ? "No open notes." : "No notes yet."}
          line="Select words in the document, then tap Note beside them, and say what should change."
        />
      ) : (
        open.map(card)
      )}
      {done.length > 0 && (
        <details className="note-fold">
          <summary className="disclosure">
            Done <span className="font-mono text-small text-muted tabular-nums">{done.length}</span>
          </summary>
          {done.map(card)}
        </details>
      )}
    </RailPart>
  );
}
