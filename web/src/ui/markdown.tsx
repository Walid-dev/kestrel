// A document, rendered: the blocks and runs src/shared/markdown.ts parses, drawn as React elements (never raw HTML).
// Every piece of text carries its place in the source (data-at), and every block its words' range (data-from and
// data-to), so my notes' marks show on the rendered words (across bold text or a link too) and a selection, or a tap
// on a paragraph, maps back to the exact characters of the source. A mark is a plain inline <mark> carrying its note
// (data-note), so it hugs the words like a highlighter, spaces and all; the document opens the note on a tap
// (ui/doc.tsx). The look lives in styles.css under .md.
import { type ReactNode, useMemo } from "react";
import { type Block, type DocKind, type Leaf, parse, type Run, wordsRange } from "../../../src/shared/markdown.ts";
import { segments } from "../../../src/shared/marks.ts";

// a note's place in the source; one that lost its words (null) marks nothing
export type Mark = { id: string; at: number | null; end: number | null };

type Ctx = { marks: Mark[] };

export function Markdown({ text, kind, marks }: { text: string; kind: DocKind; marks?: Mark[] }) {
  // parsed once per text: typing in the editor re-parses only what it shows
  const blocks = useMemo(() => parse(text, kind), [text, kind]);
  const placed = useMemo(() => (marks ?? []).filter((m) => m.at !== null && m.end !== null && m.end > m.at), [marks]);
  return <div className={`md md-is-${kind}`}>{drawBlocks(blocks, { marks: placed }, false)}</div>;
}

// where the source holds a block's words, for a tap that notes the paragraph
const range = (runs: Run[]) => {
  const r = wordsRange(runs);
  return r ? { "data-from": r[0], "data-to": r[1] } : {};
};

function drawBlocks(blocks: Block[], ctx: Ctx, tight: boolean): ReactNode[] {
  return blocks.map((b) => {
    const key = `${b.k}${b.from}`;
    switch (b.k) {
      case "heading": {
        const H = `h${b.level}` as const;
        return (
          <H key={key} className={`md-h md-h${b.level}`} data-slug={b.slug} {...range(b.runs)}>
            {drawRuns(b.runs, ctx)}
          </H>
        );
      }
      case "para":
        // in a tight list an item's words sit right after its marker, with no paragraph's room around them
        return tight ? (
          <div key={key} className="md-tight" {...range(b.runs)}>
            {drawRuns(b.runs, ctx)}
          </div>
        ) : (
          <p key={key} className="md-p" {...range(b.runs)}>
            {drawRuns(b.runs, ctx)}
          </p>
        );
      case "code":
        return (
          <pre key={key} className="md-pre" {...range(b.runs)} data-lang={b.lang || undefined}>
            <code>{b.runs.map((l) => drawLeaf(l, ctx))}</code>
          </pre>
        );
      case "quote":
        return (
          <blockquote key={key} className="md-quote">
            {drawBlocks(b.blocks, ctx, false)}
          </blockquote>
        );
      case "list": {
        const items = b.items.map((it) => (
          <li key={it.from} className={it.check === null ? undefined : "md-task"}>
            {it.check !== null && (
              <span
                className="md-check"
                data-done={it.check || undefined}
                role="img"
                aria-label={it.check ? "Done" : "To do"}
              />
            )}
            {drawBlocks(it.blocks, ctx, b.tight)}
          </li>
        ));
        return b.ordered ? (
          <ol key={key} className="md-list" start={b.start === 1 ? undefined : b.start}>
            {items}
          </ol>
        ) : (
          <ul key={key} className="md-list">
            {items}
          </ul>
        );
      }
      case "table":
        return (
          // its own frame: a wide table scrolls inside it on a phone, never the page
          <div key={key} className="md-table">
            <table>
              <thead>
                <tr>
                  {b.head.map((c, n) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: a row's cells never move
                    <th key={n} style={{ textAlign: b.align[n] ?? undefined }} {...range(c.runs)}>
                      {drawRuns(c.runs, ctx)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r) => (
                  <tr key={r[0].from}>
                    {r.map((c, n) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: a row's cells never move
                      <td key={n} style={{ textAlign: b.align[n] ?? undefined }} {...range(c.runs)}>
                        {drawRuns(c.runs, ctx)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case "hr":
        return <hr key={key} className="md-hr" />;
    }
    return null;
  });
}

// the first leaf's place: a stable key for a run that holds others
const firstAt = (r: Run): number => ("kids" in r ? (r.kids[0] ? firstAt(r.kids[0]) : -1) : r.at);

function drawRuns(runs: Run[], ctx: Ctx): ReactNode[] {
  return runs.map((r, n) => {
    if (r.k === "text" || r.k === "code") return drawLeaf(r, ctx);
    if (r.k === "br") return <br key={`br${r.at}`} />;
    const key = `${r.k}${firstAt(r)}:${n}`;
    if (r.k === "em") return <em key={key}>{drawRuns(r.kids, ctx)}</em>;
    if (r.k === "strong") return <strong key={key}>{drawRuns(r.kids, ctx)}</strong>;
    if (r.k === "del") return <del key={key}>{drawRuns(r.kids, ctx)}</del>;
    return (
      <a
        key={key}
        className="md-link"
        href={r.href}
        title={r.title || undefined}
        {...(r.href.startsWith("#")
          ? { onClick: (e: React.MouseEvent<HTMLAnchorElement>) => toPart(e, r.href.slice(1)) }
          : { target: "_blank", rel: "noopener noreferrer" })}
      >
        {drawRuns(r.kids, ctx)}
      </a>
    );
  });
}

// a #part link scrolls to its heading in this document; the page's address stays as it is
function toPart(e: React.MouseEvent<HTMLAnchorElement>, part: string) {
  const root = e.currentTarget.closest(".md");
  let slug = part;
  try {
    slug = decodeURIComponent(part);
  } catch {
    // a malformed escape: look for it as written
  }
  const target = [...(root?.querySelectorAll<HTMLElement>("[data-slug]") ?? [])].find(
    (h) => h.dataset.slug === slug.toLowerCase(),
  );
  if (!target) return;
  e.preventDefault();
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

// one leaf: its words in pieces, each piece at its place; a piece a note covers is a mark carrying the note
function drawLeaf(l: Leaf, ctx: Ctx): ReactNode {
  const end = l.at + l.text.length;
  const touched = ctx.marks.some((m) => (m.at as number) < end && (m.end as number) > l.at);
  const pieces = touched ? segments(l, ctx.marks) : [{ at: l.at, text: l.text, noteId: null }];
  const drawn = pieces.map((p) =>
    p.noteId === null ? (
      <span key={p.at} data-at={p.at}>
        {p.text}
      </span>
    ) : (
      <mark key={p.at} className="doc-mark" data-at={p.at} data-note={p.noteId}>
        {p.text}
      </mark>
    ),
  );
  return l.k === "code" ? (
    <code key={`c${l.at}`} className="md-code">
      {drawn}
    </code>
  ) : (
    drawn
  );
}

// ---- from the page back to the source ----

// a point of the selection (a node and an offset in it) as a place in the source: inside a piece, the piece's place
// plus the characters before the point; between pieces, the next piece's start (or the last one's end)
export function sourceAt(root: HTMLElement, node: Node, offset: number): number | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const piece = node.parentElement?.closest<HTMLElement>("[data-at]");
    if (piece && root.contains(piece)) return Number(piece.dataset.at) + offset;
  }
  if (!root.contains(node)) return null;
  const pieces = root.querySelectorAll<HTMLElement>("[data-at]");
  if (pieces.length === 0) return null;
  const point = document.createRange();
  point.setStart(
    node,
    Math.min(offset, node.nodeType === Node.TEXT_NODE ? (node.textContent ?? "").length : node.childNodes.length),
  );
  // the pieces run in document order: find the first one that starts after the point
  let lo = 0;
  let hi = pieces.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (point.comparePoint(pieces[mid], 0) > 0) hi = mid;
    else lo = mid + 1;
  }
  if (lo < pieces.length) return Number(pieces[lo].dataset.at);
  const last = pieces[pieces.length - 1];
  return Number(last.dataset.at) + (last.textContent ?? "").length;
}

// the block a tap landed in: its words' range in the source, and the element to place a button by
export function blockAt(target: Element, root: HTMLElement): { from: number; to: number; el: HTMLElement } | null {
  const el = target.closest<HTMLElement>("[data-from]");
  if (!el || !root.contains(el)) return null;
  return { from: Number(el.dataset.from), to: Number(el.dataset.to), el };
}
