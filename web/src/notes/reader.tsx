// The reader: the document rendered the way VS Code previews Markdown (a PDF's text keeps its lines), through the one
// part every document shares (ui/doc.tsx): Read, Edit, and Side by side on a computer, with Download and Save as PDF.
// My notes show as marks on the rendered words and as a list beside. Selecting words notes exactly those words of the
// source; a tap on a paragraph notes the paragraph; a button takes a note on the whole document; the sheet is a
// native dialog.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import type { DocumentFull, Draft, PlacedNote } from "../../../src/shared/notes.ts";
import { Ask } from "../ask.tsx";
import { useConfirm } from "../ui/confirm.tsx";
import { cx } from "../ui/cx.ts";
import { Doc, type DocMode, type Saved } from "../ui/doc.tsx";
import { EmptyState } from "../ui/empty.tsx";
import { blockAt, sourceAt } from "../ui/markdown.tsx";
import { Page, PageHead } from "../ui/page.tsx";
import { NoteSheet, type SheetTarget } from "./note-sheet.tsx";
import { NotesList } from "./notes-list.tsx";
import { type Pace, Speed, sentence, Writing } from "./parts.tsx";
import { Review } from "./review.tsx";

export const LAST_DOC = "kestrel-notes-last";

// a PDF's text: the upload keeps the PDF's name (src/domain/notes/pdf.ts), and only a PDF upload may
const isPdfText = (d: { name: string; source: string }) => d.source === "upload" && /\.pdf$/i.test(d.name);

export function Reader() {
  const sure = useConfirm();
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const article = useRef<HTMLElement>(null);
  const [sheet, setSheet] = useState<SheetTarget | null>(null);
  const [speed, setSpeed] = useState<Pace>("careful");
  const [mode, setMode] = useState<DocMode>("read");
  // what I picked in the document, waiting for its note: the words, where they start, where the button shows
  const [pick, setPick] = useState<{
    quote: string;
    start: number;
    shown: string;
    x: number;
    y: number;
    words: boolean;
  } | null>(null);
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
      // the status alone: the page puts it in words
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as DocumentFull;
    },
    // a document kestrel doesn't have stays gone: say so at once rather than after three tries
    retry: (n, e) => e.message !== "404" && n < 3,
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
  // a deleted note's card goes with it, so the focus can't go back to its ✕ or to its box's opener: once the card is
  // gone (the effect below), the focus goes to the notes' heading, where the keyboard carries on, rather than to the
  // top of the page
  const notesHead = useRef<HTMLHeadingElement>(null);
  const removed = useRef("");
  const removeNote = (noteId: string) => {
    removed.current = noteId;
    remove.mutate(noteId);
  };

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
      queryClient.invalidateQueries({ queryKey: ["versions", id] });
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
      queryClient.invalidateQueries({ queryKey: ["versions", id] });
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
  // my own edit, from the editor: saved on the revision it started from; the screen shows the new text before the
  // editor closes
  const saveText = async (text: string, rev: string): Promise<Saved> => {
    const res = await fetch(`/api/notes/documents/${id}/text`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, rev }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; rev?: string };
    if (!res.ok) {
      // the editor keeps my words and their revision; Read, Download and new notes must show the document as it is
      // now (after a 409, the other device's text), not the one cached before
      queryClient.invalidateQueries({ queryKey: ["doc", id] });
      queryClient.invalidateQueries({ queryKey: ["notes", id] });
      return { error: data.error ?? `The save didn't land (${res.status}).`, rev: data.rev };
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["doc", id] }),
      queryClient.invalidateQueries({ queryKey: ["notes", id] }),
      queryClient.invalidateQueries({ queryKey: ["versions", id] }),
      queryClient.invalidateQueries({ queryKey: ["draft", id] }),
    ]);
    return {};
  };

  const placed = notes.data?.notes ?? [];
  useEffect(() => {
    if (!removed.current || placed.some((n) => n.id === removed.current)) return;
    removed.current = "";
    // without scrolling: on a phone the notes sit under the document, and a note deleted from its mark there must
    // leave the page where I was reading
    if (!document.activeElement || document.activeElement === document.body)
      notesHead.current?.focus({ preventScroll: true });
  }, [placed]);
  const current = draft.data?.draft ?? null;
  // when the ask finishes while I watch, the changes open by themselves
  const wasMaking = useRef(false);
  useEffect(() => {
    if (current?.status === "ready" && wasMaking.current) setReview(true);
    wasMaking.current = current?.status === "making";
  }, [current?.status]);

  // picking words (or, on a phone, tapping a paragraph) shows a small "Note" button beside them; its tap opens the
  // note. No mode to switch on first: selecting is how a note starts (my ask, 2026-11-23: selecting did nothing).
  // The rendered words map back to the source through their places (ui/markdown.tsx), so a note covers exactly the
  // characters I picked, the hidden marks between them included.
  const onSelect = (ev: React.MouseEvent | React.TouchEvent) => {
    const sel = getSelection();
    const el = article.current;
    // every way out clears the last pick, so a Note button never stays for words no longer selected
    if (!sel || !el || !doc.data) return setPick(null);
    const target = ev.target as HTMLElement;
    const tap = sel.isCollapsed || sel.rangeCount === 0;
    // a tap on a link opens the link; words selected across or into a link are noted like any others
    if (target.closest("button") || (tap && target.closest("a"))) return setPick(null);
    if (tap) {
      const block = blockAt(target, el);
      const touch = matchMedia("(pointer: coarse)").matches;
      const quote = block ? doc.data.text.slice(block.from, block.to) : "";
      if (touch && block && quote.trim() !== "") {
        const r = block.el.getBoundingClientRect();
        setPick({
          quote,
          start: block.from,
          shown: block.el.textContent ?? quote,
          x: r.left + r.width / 2,
          y: r.bottom,
          words: false,
        });
      } else setPick(null);
      return;
    }
    const r = sel.getRangeAt(0);
    // a range runs in document order whichever way it was dragged
    const from = sourceAt(el, r.startContainer, r.startOffset, "start");
    const to = sourceAt(el, r.endContainer, r.endOffset, "end");
    if (from === null || to === null || to <= from) return setPick(null);
    const quote = doc.data.text.slice(from, to);
    if (quote.trim() === "") return setPick(null);
    const box = r.getBoundingClientRect();
    setPick({ quote, start: from, shown: sel.toString(), x: box.left + box.width / 2, y: box.bottom, words: true });
  };
  // the Note button, centred under the words but never past the screen's edges (it is about 210 px wide)
  const inside = (x: number) => Math.min(Math.max(x, 116), window.innerWidth - 116);
  // the button stays by the words only while they sit still, and only while I read
  useEffect(() => {
    if (!pick) return;
    const hide = () => setPick(null);
    window.addEventListener("scroll", hide, { passive: true });
    return () => window.removeEventListener("scroll", hide);
  }, [pick]);
  useEffect(() => {
    if (mode !== "read") setPick(null);
  }, [mode]);
  const openNotes = (notes.data?.notes ?? []).filter((n) => n.state === "open").length;
  const versions = useQuery({
    queryKey: ["versions", id],
    queryFn: async () => {
      const res = await fetch(`/api/notes/documents/${id}/versions`);
      if (!res.ok) throw new Error(`versions: ${res.status}`);
      return (await res.json()) as { versions: { id: string; savedAt: string; chars: number; start: string }[] };
    },
  });
  const restore = useMutation({
    mutationFn: async (vid: string) => {
      const res = await fetch(`/api/notes/documents/${id}/versions/${vid}/restore`, { method: "POST" });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `${res.status}`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["doc", id] });
      queryClient.invalidateQueries({ queryKey: ["notes", id] });
      queryClient.invalidateQueries({ queryKey: ["versions", id] });
    },
  });

  const back = { to: "/notes?list=1", label: "Notes" };
  if (doc.isError)
    return (
      <Page title="This document didn't open" back={back}>
        {doc.error.message === "404" ? (
          <EmptyState
            title="Kestrel doesn't have this document any more."
            line="It may have been forgotten, or its file moved. Open it again from Notes, or upload it."
            action={
              <Link to="/notes?list=1" className="btn btn-primary">
                Open Notes
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="It didn't load."
            line="Kestrel didn't answer as it should. Try again in a moment."
            action={
              <button type="button" className="btn btn-primary" onClick={() => doc.refetch()}>
                Try again
              </button>
            }
          />
        )}
      </Page>
    );
  if (!doc.data) return null;
  const d = doc.data;
  const pdf = isPdfText(d);
  const reading = mode === "read";
  // side by side takes the whole width: my notes go under it
  const side = mode === "side";
  // the edit's controls come once there is something for them to do: open notes to turn into an edit, a draft on
  // its way or ready, a save to undo. Until then the document starts right under its title (on a phone, the first
  // screen is the document, not a row of buttons that can't be used yet)
  const asking = openNotes > 0 && (!current || current.status === "failed");
  const tools = reading && (asking || current !== null || d.previous);
  const deleteNote = async (n: PlacedNote) => {
    const yes = await sure({
      title: "Delete this note?",
      body: n.text.length > 120 ? `“${n.text.slice(0, 120)}…”` : `“${n.text}”`,
      yes: "Delete",
      danger: true,
    });
    if (yes) removeNote(n.id);
  };
  return (
    // the page's frame and head by hand (PageHead, not Page): on a computer the notes column rises beside the head,
    // so it shows whole beside the text, as it did before the shared parts. Rows: the bar, the head, the document;
    // the column spans all three, and the last row takes what the column needs past them, so the head's rows never
    // stretch. Side by side takes the whole width, and the notes go under it.
    <main
      className={cx(
        "page note-reader",
        !side && "lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_auto_1fr] lg:items-start",
      )}
    >
      <PageHead
        back={back}
        eyebrow={
          <>
            {pdf ? "An uploaded PDF" : d.source === "upload" ? "Uploaded to kestrel" : "A file on this computer"}
            {d.path ? ` · ${d.path.split("/").slice(-2).join("/")}` : ""}
          </>
        }
        title={d.name}
        line={
          pdf ? (
            <>
              <span className="lg:hidden">The PDF stays as it is: you edit its text here.</span>
              <span className="hidden lg:inline">
                The PDF file itself is unchanged, and kestrel keeps no copy of it. You edit its text here; Save as PDF,
                under Download, makes a new PDF from it.
              </span>
            </>
          ) : (
            <>
              {/* on a phone, upright or turned, the document should start high: the short line, and only until the
                first note; the whole explanation where a computer has the room */}
              {placed.length === 0 && <span className="lg:hidden">Select words to leave a note, or tap Edit.</span>}
              {/* one line: the back bar above takes its tap size, and the document should start no lower than it did
                  (Edit, and Earlier versions in the column, say the rest) */}
              <span className="hidden lg:inline">
                Select words to leave a note, then turn them into an edit you check first.
              </span>
            </>
          )
        }
        actions={
          reading && (
            <button
              type="button"
              className="btn"
              aria-label="A note on the whole document"
              onClick={() => setSheet({ kind: "whole" })}
            >
              {/* the bar keeps one row on a phone: the short name there, the whole one where there is room */}
              <span className="sm:hidden">+ Note</span>
              <span className="hidden sm:inline">+ A note on the whole document</span>
            </button>
          )
        }
      />
      <div className="grid min-w-0 gap-4">
        {tools && (
          <div className="flex flex-wrap items-center gap-2">
            {asking && (
              <>
                <button type="button" className="btn btn-primary" disabled={ask.isPending} onClick={() => ask.mutate()}>
                  Turn my {openNotes === 1 ? "note" : `${openNotes} notes`} into an edit
                </button>
                <Speed value={speed} onChange={setSpeed} />
              </>
            )}
            {current?.status === "making" && <Writing model={current.model} />}
            {current?.status === "ready" && (
              <button type="button" className="btn btn-primary" onClick={() => setReview(true)}>
                Review the changes
              </button>
            )}
            {current?.status === "failed" && (
              <button type="button" className="btn btn-danger" onClick={() => discard.mutate(current.id)}>
                Clear the failed ask
              </button>
            )}
            {d.previous && (
              <button type="button" className="btn btn-quiet" onClick={() => undo.mutate()}>
                Undo the last save
              </button>
            )}
          </div>
        )}
        {reading && (askWhy || current?.status === "failed") && (
          <p role="alert" className="m-0 rounded-xl border border-line bg-warn-soft px-4 py-3 text-detail">
            {sentence(askWhy || current?.error || "")}
          </p>
        )}
        <Doc
          key={id}
          id={id}
          name={d.name}
          text={d.text}
          rev={d.rev}
          marks={placed}
          onMark={(noteId) => {
            const n = placed.find((x) => x.id === noteId);
            if (n) setSheet({ kind: "edit", note: n });
          }}
          articleRef={article}
          onPick={onSelect}
          onSave={saveText}
          printHref={`/notes/${encodeURIComponent(id)}/print`}
          onMode={setMode}
        />
      </div>
      <div className={cx("grid gap-4", !side && "lg:sticky lg:top-6 lg:col-start-2 lg:row-span-3 lg:row-start-1")}>
        <NotesList
          notes={placed}
          headRef={notesHead}
          onOpen={(n) => setSheet({ kind: "edit", note: n })}
          onDelete={deleteNote}
        />
        {(versions.data?.versions.length ?? 0) > 0 && (
          <details className="card card-stack">
            <summary className="font-cond cursor-pointer text-head font-bold text-strong">
              Earlier versions · {versions.data?.versions.length}
            </summary>
            <p className="m-0 text-small text-muted">
              The text as it was before each save, here in kestrel. Restore brings one back.
            </p>
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {versions.data?.versions.map((v) => (
                <li key={v.id} className="flex items-center gap-2 rounded-xl bg-surface-2 py-2 pr-2 pl-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-detail font-semibold text-strong">
                      {new Date(v.savedAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="block truncate text-small text-muted">{v.start}</span>
                  </span>
                  <button
                    type="button"
                    className="btn shrink-0"
                    disabled={restore.isPending}
                    onClick={async () => {
                      const yes = await sure({
                        title: "Bring this version back?",
                        body: "What the document says now is kept as a version too.",
                        yes: "Restore",
                      });
                      if (yes) restore.mutate(v.id);
                    }}
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
            {restore.isError && (
              <p role="alert" className="m-0 text-detail text-red">
                {sentence((restore.error as Error).message)}
              </p>
            )}
          </details>
        )}
      </div>
      {pick && reading && (
        <button
          type="button"
          className="note-pick"
          // where the words are: known only at run time, so it reaches the class as two variables
          style={{ "--x": `${inside(pick.x)}px`, "--y": `${pick.y + 8}px` } as CSSProperties}
          // keep the selection: the press must not clear it before the note opens
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setSheet({ kind: "new", quote: pick.quote, start: pick.start, shown: pick.shown });
            setPick(null);
          }}
        >
          ✎ Note on {pick.words ? "these words" : "this paragraph"}
        </button>
      )}
      {/* Ask, about this document, the whole page wide under it: it proposes notes as cards, which join mine on a tap */}
      <div className="min-w-0 lg:col-span-full">
        <Ask
          app="notes"
          refId={id}
          title="Ask about this document"
          placeholder="Ask, or say what should change"
          starters={["Where is it weakest?", "What could be cut?", "Check it for clarity and mistakes"]}
          onChange={changed}
        />
      </div>
      {review && current?.status === "ready" && (
        <Review
          draft={current}
          targets={{ [id]: d.path ?? "the upload, kept in kestrel" }}
          texts={{ [id]: current.perDocument[id]?.oldText ?? d.text }}
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
            if (sheet.kind === "edit") removeNote(sheet.note.id);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </main>
  );
}
