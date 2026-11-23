// The reader: the document as written, styled line by line for reading — each paragraph a block of its own with a
// coloured edge, headings in colour, code on its own ground — my notes as marks in the text and as a list beside.
// In note mode, selecting words notes exactly those words; a tap on a paragraph notes the paragraph; a button takes a
// note on the whole document; the sheet is a native dialog.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { type Line, lineKinds, segments } from "../../../src/shared/marks.ts";
import type { DocumentFull, Draft, PlacedNote } from "../../../src/shared/notes.ts";
import { Ask } from "../ask.tsx";
import { NoteSheet, type SheetTarget } from "./note-sheet.tsx";
import { NotesList } from "./notes-list.tsx";
import { Review } from "./review.tsx";

const LOOK: Record<Line["kind"], string> = {
  h1: "font-cond text-[28px] font-bold leading-tight mt-5 mb-1",
  h2: "font-cond text-[22px] font-bold leading-snug mt-4 mb-1",
  h3: "font-cond text-[18px] font-bold mt-3",
  bullet: "reader-line pl-6",
  fence: "font-mono text-[13.5px]",
  code: "font-mono text-[13.5px] reader-code",
  blank: "h-2.5",
  plain: "reader-line",
};
const INK: Partial<Record<Line["kind"], string>> = { h1: "var(--strong)", h2: "var(--purple)", h3: "var(--cyan)" };

// where the selection sits in the whole text: the line div's offset, plus the text before the node inside it
function offsetIn(article: HTMLElement, node: Node, offset: number): number | null {
  const el = node instanceof HTMLElement ? node : node.parentElement;
  const lineEl = el?.closest("[data-at]") as HTMLElement | null;
  if (!lineEl || !article.contains(lineEl)) return null;
  let before = 0;
  const walker = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (t === node) return Number(lineEl.dataset.at) + before + offset;
    before += (t.textContent ?? "").length;
  }
  return Number(lineEl.dataset.at) + before; // the selection edge sits at the line's end
}

export const LAST_DOC = "kestrel-notes-last";

export function Reader() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const article = useRef<HTMLDivElement>(null);
  const [sheet, setSheet] = useState<SheetTarget | null>(null);
  const [speed, setSpeed] = useState<"careful" | "fast">("careful");
  const [noteMode, setNoteMode] = useState(false);
  const [review, setReview] = useState(false);
  const [askWhy, setAskWhy] = useState("");
  // the last document opened is where Notes opens next time, on this device
  useEffect(() => {
    try {
      localStorage.setItem(LAST_DOC, id);
    } catch {
      // storage off: Notes opens on its list instead
    }
  }, [id]);

  const doc = useQuery({
    queryKey: ["doc", id],
    queryFn: async () => {
      const res = await fetch(`/api/notes/documents/${id}`);
      if (!res.ok) throw new Error(`document: ${res.status}`);
      return (await res.json()) as DocumentFull;
    },
  });
  const notes = useQuery({
    queryKey: ["notes", id],
    queryFn: async () => {
      const res = await fetch(`/api/notes/documents/${id}/notes`);
      if (!res.ok) throw new Error(`notes: ${res.status}`);
      return (await res.json()) as { notes: PlacedNote[] };
    },
  });
  const changed = () => queryClient.invalidateQueries({ queryKey: ["notes", id] });
  const save = useMutation({
    mutationFn: async (input: { target: SheetTarget; text: string }) => {
      const { target, text } = input;
      const [url, body] =
        target.kind === "edit"
          ? [`/api/notes/note/${target.note.id}`, { text }]
          : [
              `/api/notes/documents/${id}/notes`,
              target.kind === "whole" ? { text } : { text, quote: target.quote, start: target.start },
            ];
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `${res.status}`);
    },
    onSettled: changed,
  });
  const remove = useMutation({
    mutationFn: async (noteId: string) => {
      await fetch(`/api/notes/note/${noteId}`, { method: "DELETE" });
    },
    onSettled: changed,
  });

  const draft = useQuery({
    queryKey: ["draft", id],
    queryFn: async () => {
      const res = await fetch(`/api/notes/documents/${id}/draft`);
      if (!res.ok) throw new Error(`draft: ${res.status}`);
      return (await res.json()) as { draft: Draft | null };
    },
    // while the model writes, the screen checks on it every 2 seconds
    refetchInterval: (q) => (q.state.data?.draft?.status === "making" ? 2000 : false),
  });
  const ask = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/notes/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documents: [id], speed }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `${res.status}`);
    },
    onSuccess: () => setAskWhy(""),
    onError: (e) => setAskWhy(e.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["draft", id] }),
  });
  const [saveWhy, setSaveWhy] = useState("");
  const saveDoc = useMutation({
    mutationFn: async (documentId: string) => {
      const res = await fetch(`/api/notes/drafts/${current?.id}/save`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ document: documentId }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `${res.status}`);
    },
    onSuccess: () => {
      setSaveWhy("");
      setReview(false);
    },
    onError: (e) => setSaveWhy(e.message),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["doc", id] });
      queryClient.invalidateQueries({ queryKey: ["notes", id] });
      queryClient.invalidateQueries({ queryKey: ["draft", id] });
    },
  });
  const undo = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/notes/documents/${id}/undo`, { method: "POST" });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `${res.status}`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["doc", id] });
      queryClient.invalidateQueries({ queryKey: ["notes", id] });
    },
  });
  const discard = useMutation({
    mutationFn: async (draftId: string) => {
      await fetch(`/api/notes/drafts/${draftId}/discard`, { method: "POST" });
    },
    onSettled: () => {
      setReview(false);
      queryClient.invalidateQueries({ queryKey: ["draft", id] });
    },
  });

  const lines = useMemo(() => (doc.data ? lineKinds(doc.data.text) : []), [doc.data]);
  const placed = notes.data?.notes ?? [];
  const current = draft.data?.draft ?? null;
  // when the ask finishes while I watch, the changes open by themselves
  const wasMaking = useRef(false);
  useEffect(() => {
    if (current?.status === "ready" && wasMaking.current) setReview(true);
    wasMaking.current = current?.status === "making";
  }, [current?.status]);

  const onSelect = (ev: React.MouseEvent | React.TouchEvent) => {
    if (!noteMode) return;
    const sel = getSelection();
    const el = article.current;
    if (!sel || !el || !doc.data) return;
    // a tap, no words selected: the paragraph under it (a mark keeps its own way). It is decided here, once — a click
    // handler came after the note box took the focus, found the selection gone and swapped the words for the paragraph
    if (sel.isCollapsed) {
      const target = ev.target as HTMLElement;
      if (target.closest("button")) return;
      const lineEl = target.closest("[data-at]") as HTMLElement | null;
      const ln = lineEl ? lines.find((x) => x.at === Number(lineEl.dataset.at)) : undefined;
      if (ln && ln.text.trim() !== "") setSheet({ kind: "new", quote: ln.text, start: ln.at });
      return;
    }
    const r = sel.getRangeAt(0);
    const a = offsetIn(el, r.startContainer, r.startOffset);
    const b = offsetIn(el, r.endContainer, r.endOffset);
    if (a === null || b === null || a === b) return;
    const [s, e] = a < b ? [a, b] : [b, a];
    const quote = doc.data.text.slice(s, e);
    if (quote.trim() === "") return;
    // note mode is on: selecting words asks for the note at once
    setSheet({ kind: "new", quote, start: s });
  };

  if (doc.isError)
    return (
      <p
        className="rounded-xl border px-4 py-3 text-sm"
        style={{ borderColor: "var(--line)", background: "var(--warn-soft)" }}
      >
        This document didn't open: {String(doc.error.message)}
      </p>
    );
  if (!doc.data) return null;
  return (
    <main className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="mb-1 flex flex-wrap items-center gap-3 lg:col-start-1">
        <Link to="/notes?list=1" className="btn">
          Documents
        </Link>
        <p
          className="font-mono min-w-0 flex-1 truncate text-[11px] uppercase tracking-[0.18em]"
          style={{ color: "var(--muted)" }}
        >
          {doc.data.name}
        </p>
        {noteMode && (
          <button type="button" className="btn" onClick={() => setSheet({ kind: "whole" })}>
            Note on the document
          </button>
        )}
        <button
          type="button"
          role="switch"
          aria-checked={noteMode}
          className="btn"
          style={
            noteMode
              ? { background: "var(--accent-soft)", borderColor: "var(--accent)", color: "var(--accent)" }
              : undefined
          }
          onClick={() => setNoteMode((v) => !v)}
        >
          {noteMode ? "Notes on" : "Notes off"}
        </button>
      </div>
      {doc.data.path && (
        <p className="font-mono mb-3 break-all text-[11px] lg:col-start-1" style={{ color: "var(--muted)" }}>
          {doc.data.path}
        </p>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2 lg:col-start-1">
        {(!current || current.status === "failed") && (
          <>
            <button type="button" className="btn btn-primary" disabled={ask.isPending} onClick={() => ask.mutate()}>
              Ask for changes
            </button>
            <div
              className="font-mono flex overflow-hidden rounded-full border text-xs"
              style={{ borderColor: "var(--line)" }}
            >
              {(["careful", "fast"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className="cursor-pointer px-3 py-1.5"
                  style={
                    speed === s
                      ? { background: "var(--accent-soft)", color: "var(--accent)" }
                      : { color: "var(--muted)" }
                  }
                  onClick={() => setSpeed(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </>
        )}
        {current?.status === "making" && (
          <span className="font-mono flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
            <span className="block h-2 w-2 animate-pulse rounded-full" style={{ background: "var(--accent)" }} />
            the {current.model.includes("Qwen") || current.model.includes("careful") ? "careful" : "fast"} model is
            writing…
          </span>
        )}
        {current?.status === "ready" && (
          <button type="button" className="btn btn-primary" onClick={() => setReview(true)}>
            Review the changes
          </button>
        )}
        {doc.data?.previous && (
          <button type="button" className="btn btn-quiet" onClick={() => undo.mutate()}>
            Undo the last save
          </button>
        )}
        {current?.status === "failed" && (
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => discard.mutate(current.id)}
            title={current.error}
          >
            the ask failed — clear it
          </button>
        )}
      </div>
      {(askWhy || current?.status === "failed") && (
        <p
          className="mb-3 rounded-xl border px-4 py-3 text-sm"
          style={{ borderColor: "var(--line)", background: "var(--warn-soft)" }}
        >
          {askWhy || current?.error}
        </p>
      )}
      <article
        ref={article}
        onMouseUp={onSelect}
        onTouchEnd={onSelect}
        className={`reader rounded-2xl border p-4 md:p-6 ${noteMode ? "noting" : ""}`}
        style={{ borderColor: "var(--line)", background: "var(--surface)" }}
      >
        {lines.map((ln) => (
          <div
            key={ln.n}
            data-at={ln.at}
            className={LOOK[ln.kind]}
            style={{ color: INK[ln.kind] ?? (ln.kind === "fence" ? "var(--muted)" : undefined) }}
          >
            {segments(ln, placed).map((seg) => {
              const open = () => {
                const n = placed.find((x) => x.id === seg.noteId);
                if (n) setSheet({ kind: "edit", note: n });
              };
              return seg.noteId ? (
                <button
                  key={seg.at}
                  type="button"
                  className="inline cursor-pointer rounded px-0.5 text-left"
                  style={{
                    background: "var(--pink-soft)",
                    color: "inherit",
                    font: "inherit",
                    border: "none",
                    boxShadow: "inset 0 -2px var(--pink)",
                  }}
                  onClick={open}
                >
                  {seg.text}
                </button>
              ) : (
                seg.text
              );
            })}
            {ln.text === "" && " "}
          </div>
        ))}
      </article>
      <div className="lg:col-start-2 lg:row-start-1 lg:row-span-4 lg:sticky lg:top-6">
        <NotesList
          notes={placed}
          onOpen={(n) => setSheet({ kind: "edit", note: n })}
          onDelete={(n) => remove.mutate(n.id)}
        />
        {/* Ask, about this document: it proposes notes as cards, which join these once I tap them */}
        <div className="mt-4">
          <Ask
            app="notes"
            refId={id}
            title="Ask about this document"
            placeholder="Ask, or say what should change"
            starters={["Where is it weakest?", "What could be cut?", "Check it for clarity and mistakes"]}
            onChange={changed}
          />
        </div>
      </div>
      {review && current?.status === "ready" && (
        <Review
          draft={current}
          targets={{ [id]: doc.data.path ?? "the upload, kept in kestrel" }}
          texts={{ [id]: current.perDocument[id]?.oldText ?? doc.data.text }}
          onSave={(documentId) => saveDoc.mutate(documentId)}
          saving={saveDoc.isPending}
          saveWhy={saveWhy}
          onDiscard={() => discard.mutate(current.id)}
          onClose={() => setReview(false)}
        />
      )}
      {sheet && (
        <NoteSheet
          docId={id}
          target={sheet}
          onSave={async (text) => {
            await save.mutateAsync({ target: sheet, text });
            getSelection()?.removeAllRanges();
          }}
          onDelete={() => {
            if (sheet.kind === "edit") remove.mutate(sheet.note.id);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </main>
  );
}
