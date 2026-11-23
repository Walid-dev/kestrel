// The catalog's drawings, laid out by the page (src/shared/blocks.ts names the kinds and reads them): Ask's answers,
// Research's reports and the lessons all draw them here, the same way. Each part's words keep the inline marks.
import { type CSSProperties, useState } from "react";
import type { Drawing as D } from "../../src/shared/blocks.ts";
import { Inline } from "./learn/blocks.tsx";

// steps and branches each take a colour of their own, in this order, so the eye follows one to the next
const COLOURS = [
  "var(--accent)",
  "var(--green)",
  "var(--purple)",
  "var(--orange)",
  "var(--cyan)",
  "var(--yellow)",
  "var(--pink)",
];
const tint = (i: number) => ({ "--c": COLOURS[i % COLOURS.length] }) as CSSProperties;
const nice = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export function Drawing({ d }: { d: D }) {
  switch (d.kind) {
    case "flow":
      return (
        <figure className="ask-flow">
          {d.title && <figcaption className="eyebrow">{d.title}</figcaption>}
          <ol>
            {d.steps.map((st, j) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a drawing's parts are fixed once written
              <li key={j} style={tint(j)}>
                <span className="ask-step">{j + 1}</span>
                <span className="min-w-0 pt-0.5">
                  <Inline text={st} />
                </span>
              </li>
            ))}
          </ol>
        </figure>
      );
    case "compare":
      return (
        <div className="ask-compare">
          {d.items.map((it, j) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a drawing's parts are fixed once written
            <section key={j}>
              <h5>
                <Inline text={it.title} />
              </h5>
              {it.points.map((pt, k) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a drawing's parts are fixed once written
                <p key={k}>
                  <Inline text={pt} />
                </p>
              ))}
            </section>
          ))}
        </div>
      );
    case "tree":
      // the whole on top, its parts below in their colours, each with its own parts; a column when narrow
      return (
        <figure className="d-tree">
          {d.title && <figcaption className="eyebrow">{d.title}</figcaption>}
          <div className="d-tree-root">
            <Inline text={d.root} />
          </div>
          <ul>
            {d.branches.map((b, j) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a drawing's parts are fixed once written
              <li key={j} style={tint(j)}>
                <b>
                  <Inline text={b.label} />
                </b>
                {b.leaves.map((l, k) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a drawing's parts are fixed once written
                  <span key={k}>
                    <Inline text={l} />
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </figure>
      );
    case "timeline":
      return (
        <figure className="d-timeline">
          {d.title && <figcaption className="eyebrow">{d.title}</figcaption>}
          <ol>
            {d.events.map((e, j) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a drawing's parts are fixed once written
              <li key={j} style={tint(j)}>
                <span className="d-when">{e.when}</span>
                <span className="d-dot" aria-hidden="true" />
                <span className="min-w-0">
                  <Inline text={e.what} />
                </span>
              </li>
            ))}
          </ol>
        </figure>
      );
    case "chart": {
      // one measure, so one colour: each bar's length is its share of the biggest, its number beside it
      const top = Math.max(...d.bars.map((b) => b.value));
      return (
        <figure className="d-chart">
          {(d.title || d.unit) && (
            <figcaption className="eyebrow">
              {d.title}
              {d.unit && <span style={{ color: "var(--muted)" }}>{d.title ? ` · ${d.unit}` : d.unit}</span>}
            </figcaption>
          )}
          {d.bars.map((b, j) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a drawing's parts are fixed once written
            <div key={j} className="d-bar">
              <span className="truncate">{b.label}</span>
              <span className="d-track">
                <span className="d-fill" style={{ width: `${top ? Math.max(1.5, (b.value / top) * 100) : 0}%` }} />
              </span>
              <span className="font-mono">{nice(b.value)}</span>
            </div>
          ))}
        </figure>
      );
    }
    case "callout":
      return (
        <aside className={`d-callout ${d.tone === "warn" ? "d-warn" : ""}`}>
          <span className="eyebrow">{d.title || (d.tone === "warn" ? "Watch out" : "Tip")}</span>
          <p className="m-0">
            <Inline text={d.text} />
          </p>
        </aside>
      );
    case "check":
      return <Check q={d.q} a={d.a} />;
  }
}

// a question to test myself: the answer stays hidden until I ask for it
function Check({ q, a }: { q: string; a: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="d-check">
      <span className="eyebrow d-check-label">Check yourself</span>
      <p className="m-0 font-semibold" style={{ color: "var(--strong)" }}>
        <Inline text={q} />
      </p>
      {shown ? (
        <p className="m-0">
          <Inline text={a} />
        </p>
      ) : (
        <button type="button" className="btn justify-self-start" onClick={() => setShown(true)}>
          Show the answer
        </button>
      )}
    </div>
  );
}
