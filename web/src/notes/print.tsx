// Save as PDF: one document on clean paper (a white page, black ink, the same headings and lists, page margins) with
// nothing of the app around it, so the browser's own print makes the new PDF; no package, nothing made on the
// computer's side. A page of its own (/notes/<id>/print, opened in a tab of its own) because a home-screen app on the
// iPhone can't print in place: there, Share, Print, Save to Files. On a computer the print dialog opens by itself
// (Save as PDF is in it) and the tab closes after. On Android the button opens the system's print screen, whose list
// at the top (a printer's name) holds Save as PDF: the page says so first, as three short steps, and never opens it
// by itself. On paper it is set like a well-made document (styles.css, "Save as PDF"): no browser header or footer
// (the date, the title, the page's address), close type, and a CV's look for a document that starts like one.
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { Link, useParams } from "react-router";
import { type DocKind, docKind, parse } from "../../../src/shared/markdown.ts";
import type { DocumentFull } from "../../../src/shared/notes.ts";
import { Markdown } from "../ui/markdown.tsx";

// which way to a PDF this device takes. A computer: a fine pointer that can hover (an iPad with a trackpad still
// shares through its own sheet). Android: Chrome's print screen. Else the iPhone's (or iPad's) share sheet.
type Device = "computer" | "android" | "iphone";
const device = (): Device =>
  matchMedia("(pointer: fine) and (hover: hover)").matches && navigator.maxTouchPoints < 2
    ? "computer"
    : /Android/i.test(navigator.userAgent)
      ? "android"
      : "iphone";
const ANDROID = ["Tap Save as PDF", "At the top, pick Save as PDF", "Tap the round PDF button"];
const HOW: Record<Device, ReactNode> = {
  computer: "In the print dialog, choose Save as PDF.",
  // the list at the top of Android's print screen shows a printer's name; Save as PDF is one of its entries
  android: (
    <ol className="paper-steps" title="The list at the top shows a printer's name: open it, and Save as PDF is in it.">
      {ANDROID.map((step, i) => (
        <li key={step} className="paper-step">
          <span className="paper-step-n">{i + 1}</span>
          {step}
        </li>
      ))}
    </ol>
  ),
  iphone: "To keep it as a PDF: tap Share, then Print, then Save to Files.",
};

// a document that starts like a CV: a PDF's (or a text's) lines whose first line is short and ends no sentence (a
// name), with section headings further on. On paper the name is large, the lines under it small (a role, a contact
// line), the headings take a rule, and a line over a list (a role and its dates) is bold.
function startsLikeCv(text: string, kind: DocKind): boolean {
  if (kind !== "lines") return false;
  const blocks = parse(text, kind);
  const name = text.trimStart().split("\n", 1)[0].trim();
  return (
    blocks[0]?.k === "para" && name.length <= 40 && !/[.!?:;,]$/.test(name) && blocks.some((b) => b.k === "heading")
  );
}

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
    if (!doc.data || printed.current || device() !== "computer") return;
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

  const cv = useMemo(() => (doc.data ? startsLikeCv(doc.data.text, docKind(doc.data.name)) : false), [doc.data]);
  if (doc.isError)
    return (
      <div className="paper-view">
        <p className="paper-bar">This document didn't open: {String(doc.error.message)}</p>
      </div>
    );
  if (!doc.data) return <div className="paper-view" />;
  const on = device();
  return (
    <div className="paper-view">
      <div className="paper-bar">
        <Link to={`/notes/${encodeURIComponent(id)}`} className="paper-back">
          ← Back to the document
        </Link>
        <div className="paper-how">{HOW[on]}</div>
        <button type="button" className="btn" onClick={() => window.print()}>
          {on === "iphone" ? "Print" : "Save as PDF"}
        </button>
      </div>
      <article className={cv ? "paper paper-cv" : "paper"}>
        <Markdown text={doc.data.text} kind={docKind(doc.data.name)} />
      </article>
    </div>
  );
}
