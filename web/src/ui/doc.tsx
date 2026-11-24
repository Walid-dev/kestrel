// One part for every document I read or edit. Read shows it rendered (ui/markdown.tsx). Edit shows its source in a
// plain editor: mono, growing with the text; Enter makes a new line; Cmd/Ctrl+S or Cmd/Ctrl+Enter saves; Esc or
// Cancel goes back to reading and keeps the words. On a computer-wide screen, Side by side shows the source on the
// left and the preview on the right, as VS Code does. Words not saved yet wait on this device until Save or Discard.
// Its head holds the switch and Download: the text as a file, Save as PDF (a clean print page), Copy.
import { useDeferredValue, useEffect, useId, useRef, useState } from "react";
import { type DocKind, docKind } from "../../../src/shared/markdown.ts";
import { type Mark, Markdown } from "./markdown.tsx";

export type DocMode = "read" | "edit" | "side";
// a save's answer: nothing when it landed; the reason when it didn't, with the newer revision when the document
// changed since the edit began (the words can then go over it on purpose)
export type Saved = { error?: string; rev?: string };

// the file a download makes: a PDF's text as .txt under the PDF's name, a Markdown note as .md, others as they are
export function downloadName(name: string, kind: DocKind): string {
  if (/\.pdf$/i.test(name)) return `${name.slice(0, -4)}.txt`;
  if (kind === "markdown" && !/\.(md|markdown|mdown|mkd|mdx)$/i.test(name)) return `${name}.md`;
  return name;
}

// the app opened from the iPhone's home screen, where a download can't land (see downloadText)
function homeScreenApp(): boolean {
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches
  );
}

export function downloadText(name: string, text: string, kind: DocKind) {
  const file = downloadName(name, kind);
  const type = /\.(md|markdown|mdown|mkd|mdx)$/i.test(file) ? "text/markdown" : "text/plain";
  const body = text.endsWith("\n") ? text : `${text}\n`; // a text file ends with a newline
  // From the home screen, a download ends on a screen with no way back (WebKit bug 290847): the file goes through the
  // share sheet instead, where Save to Files is one of the rows. Shared as plain text, the type iOS takes.
  if (homeScreenApp()) {
    const shared = new File([body], file, { type: "text/plain" });
    if (navigator.canShare?.({ files: [shared] })) {
      navigator.share({ files: [shared] }).catch(() => {
        // the sheet closed without a pick: nothing to do
      });
      return;
    }
  }
  const url = URL.createObjectURL(new Blob([body], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = file;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// the words being edited, kept on this device, with the revision they started from
type Kept = { text: string; rev: string };
const keyOf = (id: string) => `kestrel-doc:${id}`;
function readKept(id: string): Kept | null {
  try {
    const kept = JSON.parse(localStorage.getItem(keyOf(id)) ?? "null") as Kept | null;
    return kept && typeof kept.text === "string" && typeof kept.rev === "string" ? kept : null;
  } catch {
    return null;
  }
}
function writeKept(id: string, kept: Kept | null) {
  try {
    if (kept) localStorage.setItem(keyOf(id), JSON.stringify(kept));
    else localStorage.removeItem(keyOf(id));
  } catch {
    // storage off or full: the words stay on screen until the page closes
  }
}

// a computer-wide screen, where Side by side has room
function useWide(): boolean {
  const query = "(min-width: 1024px)";
  const [wide, setWide] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

export function Doc({
  id,
  name,
  text,
  rev,
  marks,
  onMark,
  articleRef,
  onPick,
  onSave,
  printHref,
  onMode,
}: {
  id: string;
  name: string;
  text: string;
  rev: string;
  marks?: Mark[];
  onMark?: (noteId: string) => void;
  articleRef?: React.Ref<HTMLElement>;
  onPick?: (e: React.MouseEvent | React.TouchEvent) => void;
  onSave?: (text: string, rev: string) => Promise<Saved>;
  printHref?: string;
  onMode?: (mode: DocMode) => void;
}) {
  const kind = docKind(name);
  const wide = useWide();
  const [mode, setMode] = useState<DocMode>("read");
  const [lastEdit, setLastEdit] = useState<"edit" | "side">("edit"); // where "Go on editing" goes back to
  const shown: DocMode = mode === "side" && !wide ? "edit" : mode;
  const [draft, setDraft] = useState<Kept | null>(() => readKept(id));
  const [why, setWhy] = useState<Saved | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = draft !== null && draft.text !== text;
  const source = useRef<HTMLTextAreaElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const whyBox = useRef<HTMLDivElement>(null);
  const previewText = useDeferredValue(draft?.text ?? text); // typing stays quick; the preview follows a beat behind

  useEffect(() => onMode?.(shown), [shown, onMode]);
  // a refused save says why above the editor: brought into view, since typing far down leaves it off screen
  useEffect(() => {
    if (why?.error) whyBox.current?.scrollIntoView({ block: "nearest" });
  }, [why]);

  // the words wait on this device: written a moment after typing stops, and when the page goes away
  const latest = useRef({ draft, text });
  latest.current = { draft, text };
  useEffect(() => {
    const t = setTimeout(() => writeKept(id, draft && draft.text !== text ? draft : null), 400);
    return () => clearTimeout(t);
  }, [id, draft, text]);
  useEffect(() => {
    const flush = () => {
      const { draft: d, text: t } = latest.current;
      writeKept(id, d && d.text !== t ? d : null);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [id]);

  const edit = (m: "edit" | "side") => {
    if (!draft) setDraft({ text, rev });
    setWhy(null);
    setMode(m);
    setLastEdit(m);
  };
  // back to reading: the words stay kept when they differ from the document
  const leave = () => {
    if (draft && draft.text === text) setDraft(null);
    setMode("read");
  };
  const discard = () => {
    setDraft(null);
    writeKept(id, null);
    setWhy(null);
    setMode("read");
  };
  const save = async (over?: string) => {
    if (!draft || !onSave || busy) return;
    if (!dirty) return leave();
    setBusy(true);
    // a request that never arrived (Wi-Fi, Tailscale, a restart) gets plain words, not the browser's "Load failed"
    const r = await onSave(draft.text, over ?? draft.rev).catch(
      (): Saved => ({ error: "The save didn't reach kestrel. Your words are kept on this device: try Save again." }),
    );
    setBusy(false);
    if (r.error) return setWhy(r);
    setWhy(null);
    setDraft(null);
    writeKept(id, null);
    setMode("read");
    setSaved(true);
    setTimeout(() => setSaved(false), 4000);
  };
  // Cmd/Ctrl+S saves wherever the focus is while editing (the browser would offer to save the page)
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (shown === "read") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown]);

  // side by side, the two panes scroll together: the same share of the way down
  const syncing = useRef(false);
  const follow = (from: HTMLElement | null, to: HTMLElement | null) => {
    if (!from || !to || syncing.current) return;
    syncing.current = true;
    const share = from.scrollTop / Math.max(1, from.scrollHeight - from.clientHeight);
    to.scrollTop = share * (to.scrollHeight - to.clientHeight);
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  };

  // a tap on a mark opens its note (a link with a mark inside keeps its own tap); anything else may start a note
  const up = (e: React.MouseEvent | React.TouchEvent) => {
    const mark = (e.target as Element).closest<HTMLElement>("[data-note]");
    if (mark?.dataset.note && onMark && !mark.closest("a") && getSelection()?.isCollapsed !== false) {
      if (e.type === "touchend") e.preventDefault(); // no second, mouse-made tap after it
      onMark(mark.dataset.note);
      return;
    }
    onPick?.(e);
  };

  const editor = (
    <textarea
      ref={source}
      className="doc-src"
      value={draft?.text ?? text}
      aria-label={`The text of ${name}`}
      spellCheck
      onChange={(e) => setDraft({ text: e.target.value, rev: draft?.rev ?? rev })}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          save();
        } else if (e.key === "Escape" && !e.nativeEvent.isComposing) {
          // (while an input method composes, Esc only cancels the composing)
          e.preventDefault();
          leave();
        }
      }}
      onScroll={shown === "side" ? () => follow(source.current, preview.current) : undefined}
    />
  );

  return (
    <section className="doc" data-mode={shown}>
      <div className={`doc-bar ${shown === "read" ? "" : "doc-bar-editing"}`}>
        <fieldset className="seg seg-modes doc-modes" aria-label="Read or edit">
          <button type="button" aria-pressed={shown === "read"} onClick={leave}>
            Read
          </button>
          {onSave && (
            <button type="button" aria-pressed={shown === "edit"} onClick={() => edit("edit")}>
              Edit
            </button>
          )}
          {onSave && wide && (
            <button type="button" aria-pressed={shown === "side"} onClick={() => edit("side")}>
              Side by side
            </button>
          )}
        </fieldset>
        {shown === "read" ? (
          <div className="doc-tools">
            {saved && <span className="doc-status">Saved. The earlier text is kept as a version.</span>}
            <Downloads name={name} text={text} kind={kind} printHref={printHref} />
          </div>
        ) : (
          <div className="doc-tools">
            <span className="doc-status">
              {busy ? "Saving…" : dirty ? "Not saved yet · kept on this device" : "No changes"}
            </span>
            <button type="button" className="btn btn-primary" disabled={!dirty || busy} onClick={() => save()}>
              Save
            </button>
            <button type="button" className="btn btn-quiet" onClick={leave}>
              Cancel
            </button>
          </div>
        )}
      </div>
      {why?.error && (
        <div ref={whyBox} className="doc-why" role="alert">
          {/* the server's reasons start in lower case, as they read in its log */}
          <span className="doc-say">{why.error.charAt(0).toUpperCase() + why.error.slice(1)}</span>
          {why.rev && (
            <button type="button" className="btn" onClick={() => save(why.rev)}>
              Save mine over it
            </button>
          )}
        </div>
      )}
      {shown === "read" && dirty && (
        <div className="doc-kept">
          <span className="doc-say">You have changes not saved yet, kept on this device.</span>
          <button type="button" className="btn" onClick={() => edit(lastEdit)}>
            Go on editing
          </button>
          <button type="button" className="btn btn-quiet" onClick={discard}>
            Discard them
          </button>
        </div>
      )}
      {shown === "read" && (
        <article ref={articleRef} onMouseUp={up} onTouchEnd={up} className="reader doc-read">
          <Markdown text={text} kind={kind} marks={marks} />
        </article>
      )}
      {shown === "edit" && (
        <>
          {editor}
          <p className="doc-hint">Cmd+S or Ctrl+S saves · Esc goes back to reading and keeps your words</p>
        </>
      )}
      {shown === "side" && (
        <div className="doc-side">
          {editor}
          <div ref={preview} className="reader doc-preview" onScroll={() => follow(preview.current, source.current)}>
            <Markdown text={previewText} kind={kind} />
          </div>
        </div>
      )}
    </section>
  );
}

// Download: the text as a file, Save as PDF (the print page, in a tab of its own), Copy. A small menu under its
// button; a tap outside, Esc or a scroll closes it.
function Downloads({ name, text, kind, printHref }: { name: string; text: string; kind: DocKind; printHref?: string }) {
  const menuId = `doc-menu-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState<"" | "yes" | "no">("");
  useEffect(() => {
    const m = menu.current;
    if (!m) return;
    // placed before it shows, right edges lined up with its button: under it when it fits, else above it (on a phone
    // the button may sit low, and a scroll closes the menu, so a menu cut off at the bottom could never be reached);
    // with no room either way, it scrolls inside itself
    const place = (e: Event) => {
      if ((e as ToggleEvent).newState !== "open" || !trigger.current) return;
      const r = trigger.current.getBoundingClientRect();
      // its height, measured while hidden from sight (a closed popover takes no room)
      m.style.cssText = "display: block; visibility: hidden; max-height: none";
      const tall = m.offsetHeight;
      m.style.cssText = "";
      const screen = Math.min(window.innerHeight, window.visualViewport?.height ?? Number.POSITIVE_INFINITY);
      const below = screen - r.bottom - 6 - 8;
      const above = r.top - 6 - 8;
      const down = tall <= below || below >= above;
      if (down) m.style.top = `${r.bottom + 6}px`;
      else m.style.bottom = `${window.innerHeight - r.top + 6}px`;
      m.style.maxHeight = `${Math.max(120, down ? below : above)}px`;
      m.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
      setCopied("");
    };
    const hide = () => {
      try {
        if (m.matches(":popover-open")) m.hidePopover();
      } catch {
        // a browser without popovers shows the menu inline: nothing to close
      }
    };
    m.addEventListener("beforetoggle", place);
    window.addEventListener("scroll", hide, { passive: true });
    return () => {
      m.removeEventListener("beforetoggle", place);
      window.removeEventListener("scroll", hide);
    };
  }, []);
  const close = () => menu.current?.hidePopover();
  return (
    <>
      <button ref={trigger} type="button" className="btn doc-menu-button" popoverTarget={menuId}>
        Download
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="M3 4.5 6 7.5l3-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      <div ref={menu} id={menuId} popover="auto" className="doc-menu">
        <button
          type="button"
          onClick={() => {
            downloadText(name, text, kind);
            close();
          }}
        >
          <span className="doc-menu-what">Download {downloadName(name, kind)}</span>
          <span className="doc-menu-why">The text as a file</span>
        </button>
        {printHref && (
          <a href={printHref} target="_blank" rel="noopener" onClick={close}>
            <span className="doc-menu-what">Save as PDF</span>
            <span className="doc-menu-why">A clean page to print or keep as a PDF</span>
          </a>
        )}
        <button
          type="button"
          onClick={() =>
            navigator.clipboard?.writeText(text).then(
              () => setCopied("yes"),
              () => setCopied("no"),
            ) ?? setCopied("no")
          }
        >
          <span className="doc-menu-what">{copied === "yes" ? "Copied" : "Copy the text"}</span>
          <span className="doc-menu-why">
            {copied === "no" ? "This browser didn't allow it: use Download" : "To paste it elsewhere"}
          </span>
        </button>
      </div>
    </>
  );
}
