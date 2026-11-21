// The reader: the document as written, styled line by line, my notes as marks in the text and as a list below.
// Selecting words offers a note on them; a button takes a note on the whole document; the sheet is a native dialog.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import { type Line, lineKinds, segments } from "../../../src/shared/marks.ts";
import type { DocumentFull, Draft, PlacedNote } from "../../../src/shared/notes.ts";
import { NoteSheet, type SheetTarget } from "./note-sheet.tsx";
import { NotesList } from "./notes-list.tsx";
import { Review } from "./review.tsx";

const LOOK: Record<Line["kind"], string> = {
  h1: "font-cond text-2xl font-bold mt-4",
  h2: "font-cond text-xl font-bold mt-3",
  h3: "font-cond text-lg font-bold mt-2",
  bullet: "",
  fence: "font-mono text-sm",
  code: "font-mono text-sm",
  blank: "h-4",
  plain: "",
};

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

export function Reader() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const article = useRef<HTMLDivElement>(null);
  const [sheet, setSheet] = useState<SheetTarget | null>(null);
  const [pending, setPending] = useState<{ quote: string; start: number } | null>(null);
  const [speed, setSpeed] = useState<"careful" | "fast">("careful");
  const [review, setReview] = useState(false);
  const [askWhy, setAskWhy] = useState("");

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

  const onSelect = () => {
    const sel = getSelection();
    const el = article.current;
    if (!sel || sel.isCollapsed || !el || !doc.data) return setPending(null);
    const r = sel.getRangeAt(0);
    const a = offsetIn(el, r.startContainer, r.startOffset);
    const b = offsetIn(el, r.endContainer, r.endOffset);
    if (a === null || b === null || a === b) return setPending(null);
    const [s, e] = a < b ? [a, b] : [b, a];
    const quote = doc.data.text.slice(s, e);
    if (quote.trim() === "") return setPending(null);
    setPending({ quote, start: s });
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
    <main>
      <div className="mb-3 flex items-baseline gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--muted)" }}>
          {doc.data.name}
        </p>
        <button
          type="button"
          className="font-mono ml-auto cursor-pointer rounded-full border px-3 py-1 text-xs"
          style={{ borderColor: "var(--line)", color: "var(--accent)" }}
          onClick={() => setSheet({ kind: "whole" })}
        >
          Note on the document
        </button>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(!current || current.status === "failed") && (
          <>
            <button
              type="button"
              className="font-cond cursor-pointer rounded-xl px-4 py-2 font-bold"
              style={{ background: "var(--accent)", color: "var(--bg)" }}
              disabled={ask.isPending}
              onClick={() => ask.mutate()}
            >
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
          <button
            type="button"
            className="font-cond cursor-pointer rounded-xl px-4 py-2 font-bold"
            style={{ background: "var(--accent)", color: "var(--bg)" }}
            onClick={() => setReview(true)}
          >
            Review the changes
          </button>
        )}
        {doc.data?.previous && (
          <button
            type="button"
            className="font-mono cursor-pointer rounded-full border px-3 py-1 text-xs"
            style={{ borderColor: "var(--line)", color: "var(--muted)" }}
            onClick={() => undo.mutate()}
          >
            Undo the last save
          </button>
        )}
        {current?.status === "failed" && (
          <button
            type="button"
            className="cursor-pointer rounded-full border px-3 py-1 text-xs"
            style={{ borderColor: "var(--line)", color: "var(--warn)" }}
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
        className="rounded-2xl border p-5 leading-relaxed"
        style={{ borderColor: "var(--line)", background: "var(--surface)" }}
      >
        {lines.map((ln) => (
          <div
            key={ln.n}
            data-at={ln.at}
            className={LOOK[ln.kind]}
            style={ln.kind === "code" || ln.kind === "fence" ? { color: "var(--muted)" } : undefined}
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
                    background: "var(--accent-soft)",
                    color: "inherit",
                    font: "inherit",
                    border: "none",
                    boxShadow: "inset 0 -2px var(--accent)",
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
      {pending && !sheet && (
        <div className="fixed inset-x-0 bottom-6 z-10 flex justify-center">
          <button
            type="button"
            className="font-cond cursor-pointer rounded-full px-5 py-2.5 font-bold shadow-lg"
            style={{ background: "var(--accent)", color: "var(--bg)" }}
            onClick={() => setSheet({ kind: "new", ...pending })}
          >
            Note on the selection
          </button>
        </div>
      )}
      <NotesList notes={placed} onOpen={(n) => setSheet({ kind: "edit", note: n })} />
      {review && current?.status === "ready" && (
        <Review
          draft={current}
          targets={{ [id]: doc.data.path ?? "the upload, kept in kestrel" }}
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
          onSave={(text) => {
            save.mutate({ target: sheet, text });
            setSheet(null);
            setPending(null);
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
