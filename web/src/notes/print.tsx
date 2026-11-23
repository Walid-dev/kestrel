// Save as PDF: one document on clean paper (a white page, black ink, the same headings and lists, page margins) with
// nothing of the app around it, so the browser's own print makes the new PDF; no package, nothing made on the
// computer's side. A page of its own (/notes/<id>/print, opened in a tab of its own) because a home-screen app on the
// iPhone can't print in place: there, Share, Print, Save to Files. On a computer the print dialog opens by itself
// (Save as PDF is in it) and the tab closes after.
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Link, useParams } from "react-router";
import { docKind } from "../../../src/shared/markdown.ts";
import type { DocumentFull } from "../../../src/shared/notes.ts";
import { Markdown } from "../ui/markdown.tsx";

// a computer: a fine pointer that can hover (an iPad with a trackpad still shares through its own sheet)
const computer = () => matchMedia("(pointer: fine) and (hover: hover)").matches && navigator.maxTouchPoints < 2;

export function NotesPrint() {
  const { id = "" } = useParams();
  const doc = useQuery({
    queryKey: ["doc", id],
    queryFn: async () => {
      const res = await fetch(`/api/notes/documents/${id}`);
      if (!res.ok) throw new Error(`document: ${res.status}`);
      return (await res.json()) as DocumentFull;
    },
  });
  // the page's title is the PDF's file name the browser offers
  useEffect(() => {
    if (!doc.data) return;
    const before = document.title;
    document.title = doc.data.name.replace(/\.[^.]+$/, "") || doc.data.name;
    return () => {
      document.title = before;
    };
  }, [doc.data]);
  // on a computer, the print dialog once the fonts are in; the tab it opened in closes after
  const printed = useRef(false);
  useEffect(() => {
    if (!doc.data || printed.current || !computer()) return;
    let gone = false;
    document.fonts.ready.then(() =>
      requestAnimationFrame(() => {
        if (gone || printed.current) return;
        printed.current = true;
        window.addEventListener("afterprint", () => window.close(), { once: true });
        window.print();
      }),
    );
    return () => {
      gone = true;
    };
  }, [doc.data]);

  if (doc.isError)
    return (
      <div className="paper-view">
        <p className="paper-bar">This document didn't open: {String(doc.error.message)}</p>
      </div>
    );
  if (!doc.data) return <div className="paper-view" />;
  return (
    <div className="paper-view">
      <div className="paper-bar">
        <Link to={`/notes/${encodeURIComponent(id)}`} className="paper-back">
          ← Back to the document
        </Link>
        <span className="paper-how">
          {computer()
            ? "In the print dialog, choose Save as PDF."
            : "To keep it as a PDF: tap Share, then Print, then Save to Files."}
        </span>
        <button type="button" className="btn" onClick={() => window.print()}>
          Print
        </button>
      </div>
      <article className="paper">
        <Markdown text={doc.data.text} kind={docKind(doc.data.name)} />
      </article>
    </div>
  );
}
