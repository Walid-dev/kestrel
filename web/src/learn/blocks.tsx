// A guide topic's blocks, rendered as the guides write them: lines (with `code`, **bold** and "like" analogies),
// entries with their example, diagram and check, callouts, tables, rules, code with its parts coloured, and the
// hand-placed diagrams. Every line meant to be heard registers with `say`, so Listen reads the page in order and
// lights the line it is on.
import { createContext, type ReactNode, useContext } from "react";
import { Link, useLocation } from "react-router";
import { readDrawing } from "../../../src/shared/blocks.ts";
import { Drawing } from "../drawing.tsx";
import { cx } from "../ui/cx.ts";
import type { Tone } from "../ui/pills.tsx";

export type Say = {
  add: (text: string, opts?: { pause?: number }) => number;
  spoken: number;
  from: (i: number) => void;
  isOpen: (key: string) => boolean;
  open: (key: string) => void;
};
type Block = Record<string, unknown>;

const arr = (v: unknown): unknown[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
// each item with its place and a key made from it: lists in a guide are fixed for the page's life
const keyed = <T,>(list: T[], prefix: string) => list.map((v, i) => ({ v, i, key: `${prefix}${i}` }));
const str = (v: unknown): string => (typeof v === "string" ? v : "");
// what Listen reads: the marks gone, and a research answer's source numbers too
export const plain = (s: string) =>
  s
    .replaceAll(/`([^`]+)`/g, "$1")
    .replaceAll(/\*\*([^*]+)\*\*/g, "$1")
    .replaceAll(/\[([^\]\n]+)\]\((?:lesson:|listing:|https?:\/\/)[^)\s]+\)/g, "$1")
    .replaceAll(/\s*\[\d+(?:\s*[,–-]\s*\d+)*\]/g, "");

// a research answer's sources by number: inside it, [2] becomes a link named for its site
export type Cite = { title: string; url: string };
export const Cites = createContext<Map<number, Cite> | null>(null);
const site = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
};

// `code` and **bold**, the guides' inline marks; inside a research answer, its [n] sources as links; in an Ask
// answer, *a stress* and [words](links) — a lesson's own (lesson:<id>) or a listing (listing:<id>) opens it here,
// any other opens a tab
// a listing's own place: on Searches, the hunt in view stays and the listing opens over it
const listingHref = (here: { pathname: string; search: string }, id: string) => {
  const p = new URLSearchParams(here.pathname === "/searches" ? here.search : "");
  p.set("open", id);
  return `/searches?${p}`;
};

export function Inline({ text }: { text: string }) {
  const cites = useContext(Cites);
  const here = useLocation();
  const out: ReactNode[] = [];
  const re =
    /`([^`]+)`|\*\*([^*]+)\*\*|\s?\[(\d+(?:\s*[,–-]\s*\d+)*)\]|\[([^\]\n]+)\]\(((?:lesson:|listing:|https?:\/\/)[^)\s]+)\)|(?<![\w*])\*(?![\s*])([^*\n]+?)(?<![\s*])\*(?![\w*])/g;
  let last = 0;
  let m: RegExpExecArray | null = re.exec(text);
  while (m) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[3] !== undefined) {
      // a source number: a link named for its site when the answer knows it, the number as written otherwise
      const nums = m[3].split(/\s*[,–-]\s*/).map(Number);
      const at = m.index;
      if (cites)
        for (const n of nums) {
          const c = cites.get(n);
          out.push(
            c ? (
              <a
                key={`${at}-${n}`}
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="cite"
                title={c.title || c.url}
                onClick={(e) => e.stopPropagation()}
              >
                {site(c.url)}
              </a>
            ) : null,
          );
        }
      else out.push(m[0]);
      last = m.index + m[0].length;
      m = re.exec(text);
      continue;
    }
    out.push(
      m[1] !== undefined ? (
        <code key={m.index} className="inline">
          {m[1]}
        </code>
      ) : m[2] !== undefined ? (
        <strong key={m.index} className="text-strong">
          {m[2]}
        </strong>
      ) : m[5]?.startsWith("lesson:") ? (
        <Link key={m.index} to={`/learn/lesson/${encodeURIComponent(m[5].slice(7))}`} className="md-link">
          {m[4]}
        </Link>
      ) : m[5]?.startsWith("listing:") ? (
        <Link key={m.index} to={listingHref(here, m[5].slice(8))} className="md-link">
          {m[4]}
        </Link>
      ) : m[5] !== undefined ? (
        <a key={m.index} href={m[5]} target="_blank" rel="noopener noreferrer" className="md-link">
          {m[4]}
        </a>
      ) : (
        <em key={m.index}>{m[6]}</em>
      ),
    );
    last = m.index + m[0].length;
    m = re.exec(text);
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

// a small highlighter: keywords, strings, numbers, comments and calls, in the shared code colours
const KEYWORDS =
  /\b(const|let|var|function|return|if|else|for|while|import|from|export|default|async|await|new|class|extends|type|interface|def|in|of|true|false|null|undefined|None|True|False|SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|CREATE|TABLE|JOIN|ON|AND|OR|NOT|GROUP|BY|ORDER|LIMIT)\b/;
export function Code({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const re =
    /(\/\/[^\n]*|#[^\n]*|--[^\n]*)|("[^"\n]*"|'[^'\n]*'|`[^`]*`)|(\b\d[\d_.]*\b)|([A-Za-z_$][\w$]*)(?=\()|([A-Za-z_]+)/g;
  let last = 0;
  let m: RegExpExecArray | null = re.exec(text);
  while (m) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const [w] = m;
    const cls = m[1] ? "c" : m[2] ? "s" : m[3] ? "n" : m[4] ? "f" : KEYWORDS.test(w) ? "k" : "";
    parts.push(
      cls ? (
        <span key={m.index} className={cls}>
          {w}
        </span>
      ) : (
        w
      ),
    );
    last = m.index + w.length;
    m = re.exec(text);
  }
  if (last < text.length) parts.push(text.slice(last));
  return <pre className="code">{parts}</pre>;
}

// one line the page reads: a sentence, a "like" analogy, or code (shown, never read)
function line(v: unknown, say: Say, key: string | number, pause?: number): ReactNode {
  if (typeof v === "string") {
    const i = say.add(plain(v), { pause });
    return (
      <p
        key={key}
        className={`say-tap m-0 ${say.spoken === i ? "reading" : ""}`}
        onClick={() => say.from(i)}
        onKeyDown={undefined}
      >
        <Inline text={v} />
      </p>
    );
  }
  if (v && typeof v === "object" && "like" in v) {
    const text = arr((v as { like: unknown }).like)
      .map(str)
      .join(" ");
    const i = say.add(plain(text), { pause });
    return (
      <p
        key={key}
        className={`like say-tap m-0 ${say.spoken === i ? "reading" : ""}`}
        onClick={() => say.from(i)}
        onKeyDown={undefined}
      >
        “<Inline text={text} />”
      </p>
    );
  }
  if (v && typeof v === "object" && "code" in v) return <Code key={key} text={str((v as { code: unknown }).code)} />;
  return null;
}
export function lines(list: unknown, say: Say, firstPause?: number): ReactNode {
  return <div className="grid gap-1">{arr(list).map((v, i) => line(v, say, i, i === 0 ? firstPause : undefined))}</div>;
}
// a heading or a label that is also heard
export function heard(text: string, say: Say): ReactNode {
  const i = say.add(plain(text));
  return (
    <span className={say.spoken === i ? "reading" : undefined}>
      <Inline text={text} />
    </span>
  );
}

function check(q: string, a: unknown, say: Say): ReactNode {
  const key = `check:${q}`;
  const qLines = lines([q], say);
  const head = heard("Check yourself", say);
  // the answer registers whatever its fold, so Listen reaches it after a pause and unfolds it as it reads
  const before = say.add("The answer.", { pause: 3500 });
  const answer = lines(a, say);
  const open = say.isOpen(key) || say.spoken >= before;
  return (
    <div key={key} className="grid gap-1.5 border-t border-dashed border-line pt-3">
      <span className="eyebrow tone-accent">{head}</span>
      {qLines}
      <div className="example" hidden={!open}>
        {answer}
      </div>
      {!open && (
        <button type="button" className="btn justify-self-start" onClick={() => say.open(key)}>
          Show the answer
        </button>
      )}
    </div>
  );
}

// ---- the diagrams: nodes, groups, edges and notes placed by hand in the guide, coloured by tone ----
// the guide's words for its colours, as the app's tones: what a part's colour means is set once, in styles.css
const TONE: Record<string, Tone> = {
  accent: "accent",
  low: "green",
  med: "yellow",
  high: "red",
  muted: "muted",
};
const toneOf = (t: string | undefined) => (t && TONE[t] ? `tone-${TONE[t]}` : "");
const ROLE: Record<string, string> = { term: "accent", data: "low", security: "med", failure: "high" };
type Node = {
  x: number;
  y: number;
  w: number;
  h: number;
  t: unknown;
  s?: unknown;
  tone?: string;
  dash?: boolean;
  mono?: boolean;
};
type Edge = {
  p: number[][];
  label?: string;
  lx?: number;
  ly?: number;
  tone?: string;
  dash?: boolean;
  arrow?: string;
  anchor?: string;
  mono?: boolean;
};
type Diagram = {
  w: number;
  h: number;
  nodes?: Node[];
  edges?: Edge[];
  groups?: Block[];
  texts?: Block[];
  label?: string;
  caption?: unknown;
};

// the guide prompt's other form names nodes by id and role and edges by from and to: draw each edge between the
// nodes' facing sides, an elbow when they don't line up
function fromRoles(d: Block): Diagram {
  const nodes = arr(d.nodes) as Block[];
  const byId = new Map(nodes.map((n) => [str(n.id), n]));
  const num = (v: unknown) => Number(v) || 0;
  const edges = (arr(d.edges) as Block[])
    .map((e): Edge | null => {
      const a = byId.get(str(e.from));
      const b = byId.get(str(e.to));
      if (!a || !b) return null;
      const [ax, ay, aw, ah] = [num(a.x), num(a.y), num(a.w), num(a.h)];
      const [bx, by, bw, bh] = [num(b.x), num(b.y), num(b.w), num(b.h)];
      const dx = bx + bw / 2 - (ax + aw / 2);
      const dy = by + bh / 2 - (ay + ah / 2);
      let p: number[][];
      if (Math.abs(dx) >= Math.abs(dy)) {
        const sx = dx > 0 ? ax + aw : ax;
        const tx = dx > 0 ? bx - 2 : bx + bw + 2;
        const sy = ay + ah / 2;
        const ty = by + bh / 2;
        const mx = (sx + tx) / 2;
        p =
          Math.abs(sy - ty) < 2
            ? [
                [sx, sy],
                [tx, sy],
              ]
            : [
                [sx, sy],
                [mx, sy],
                [mx, ty],
                [tx, ty],
              ];
      } else {
        const sy = dy > 0 ? ay + ah : ay;
        const ty = dy > 0 ? by - 2 : by + bh + 2;
        const sx = ax + aw / 2;
        const tx = bx + bw / 2;
        const my = (sy + ty) / 2;
        p =
          Math.abs(sx - tx) < 2
            ? [
                [sx, sy],
                [sx, ty],
              ]
            : [
                [sx, sy],
                [sx, my],
                [tx, my],
                [tx, ty],
              ];
      }
      return { p, label: str(e.label) || undefined, tone: ROLE[str(e.role)], dash: e.style === "dashed" };
    })
    .filter((e) => e !== null);
  return {
    w: num(d.width) || 720,
    h: num(d.height) || 400,
    nodes: nodes.map((n) => ({
      x: num(n.x),
      y: num(n.y),
      w: num(n.w),
      h: num(n.h),
      t: String(n.label ?? "")
        .split("\n")
        .slice(0, 2),
      tone: ROLE[str(n.role)],
    })),
    edges,
    label: str(d.description) || str(d.caption),
    caption: d.caption,
  };
}

export function diagram(spec: Block, say: Say, key?: string | number): ReactNode {
  const nodes0 = arr(spec.nodes) as Block[];
  const d: Diagram =
    nodes0.length && nodes0[0].label !== undefined && nodes0[0].t === undefined
      ? fromRoles(spec)
      : (spec as unknown as Diagram);
  const i = say.add(`The diagram. ${d.label ?? ""}`);
  const mark = `m-${Math.round((d.w ?? 0) * 7 + (d.h ?? 0) * 13 + (d.nodes?.length ?? 0))}`;
  return (
    <figure key={key} className={`m-0 grid gap-2 ${say.spoken === i ? "reading" : ""}`}>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface p-3">
        <svg
          viewBox={`0 0 ${d.w} ${d.h}`}
          role="img"
          aria-label={d.label ?? "a diagram"}
          className="block h-auto w-full min-w-[560px] text-ink"
        >
          <defs>
            {["", ...Object.keys(TONE)].map((t) => (
              <marker
                key={t || "plain"}
                id={`${mark}${t}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" className={t ? `${toneOf(t)} fill-tone` : "fill-current"} />
              </marker>
            ))}
          </defs>
          <g className="font-sans" fontSize="12.5" fill="currentColor">
            {keyed(arr(d.groups) as Block[], "g1-").map(({ v: g, key }) => {
              const tone = toneOf(str(g.tone));
              return (
                <g key={key} className={tone || undefined}>
                  <rect
                    x={Number(g.x)}
                    y={Number(g.y)}
                    width={Number(g.w)}
                    height={Number(g.h)}
                    rx="10"
                    fill="none"
                    strokeDasharray="6 5"
                    className={tone ? "stroke-tone" : "stroke-current"}
                    strokeOpacity={tone ? 0.8 : 0.45}
                  />
                  <text
                    x={Number(g.x) + 16}
                    y={Number(g.y) + 20}
                    fontSize="11.5"
                    className={cx("font-mono", tone ? "fill-tone" : "fill-muted")}
                  >
                    {str(g.label)}
                  </text>
                </g>
              );
            })}
            {keyed(d.edges ?? [], "g2-").map(({ v: e, key }) => {
              const tone = toneOf(e.tone);
              const arrow = e.arrow ?? "end";
              const marker = `url(#${mark}${tone ? e.tone : ""})`;
              return (
                <g key={key} className={tone || undefined}>
                  <polyline
                    points={e.p.map((pt) => pt.join(",")).join(" ")}
                    fill="none"
                    className={tone ? "stroke-tone" : "stroke-current"}
                    strokeWidth={e.tone === "muted" ? 1.2 : 1.6}
                    strokeDasharray={e.dash ? "4 4" : undefined}
                    markerEnd={arrow === "none" ? undefined : marker}
                    markerStart={arrow === "both" ? marker : undefined}
                  />
                  {e.label && (
                    <text
                      x={e.lx ?? (e.p[0][0] + e.p[1][0]) / 2}
                      y={e.ly ?? e.p[0][1] - 8}
                      textAnchor={(e.anchor ?? "middle") as "start" | "middle" | "end"}
                      fontSize="11"
                      className={cx(tone && e.tone !== "muted" ? "fill-tone" : "fill-muted", e.mono && "font-mono")}
                    >
                      {e.label}
                    </text>
                  )}
                </g>
              );
            })}
            {keyed(d.nodes ?? [], "node-").map(({ v: n, key: nodeKey }) => {
              const tone = toneOf(n.tone);
              const t = arr(n.t).map(str);
              const s = arr(n.s).map(str);
              const y0 = n.y + n.h / 2 - (t.length * 16 + s.length * 15) / 2 + 12;
              const mid = n.x + n.w / 2;
              return (
                <g key={nodeKey}>
                  <rect
                    x={n.x}
                    y={n.y}
                    width={n.w}
                    height={n.h}
                    rx="8"
                    strokeDasharray={n.dash ? "4 3" : undefined}
                    className={tone ? `${tone} dia-node` : "dia-plain"}
                    strokeWidth={tone ? 1.5 : 1}
                    strokeOpacity={tone ? 1 : 0.5}
                  />
                  {keyed(t, "text3-").map(({ v: line, i: j, key }) => (
                    <text
                      key={key}
                      x={mid}
                      y={y0 + j * 16}
                      textAnchor="middle"
                      fontWeight="600"
                      className="fill-strong"
                    >
                      {line}
                    </text>
                  ))}
                  {keyed(s, "text4-").map(({ v: line, i: j, key }) => (
                    <text
                      key={key}
                      x={mid}
                      y={y0 + t.length * 16 + 1 + j * 15}
                      textAnchor="middle"
                      fontSize="11"
                      className={cx("fill-muted", n.mono && "font-mono")}
                    >
                      {line}
                    </text>
                  ))}
                </g>
              );
            })}
            {keyed(arr(d.texts) as Block[], "text5-").map(({ v: t, key }) => (
              <text
                key={key}
                x={Number(t.x)}
                y={Number(t.y)}
                textAnchor={(str(t.anchor) || "start") as "start"}
                fontSize="11.5"
                className="font-mono fill-muted"
              >
                {str(t.t)}
              </text>
            ))}
          </g>
        </svg>
      </div>
      {d.caption != null && <figcaption className="text-detail text-muted">{lines(d.caption, say)}</figcaption>}
    </figure>
  );
}

export function block(b: Block, say: Say, key: string | number): ReactNode {
  switch (b.type) {
    case "lines":
      return <div key={key}>{lines(b.lines, say)}</div>;
    case "subhead":
      return (
        <h3 key={key} className="font-cond mt-3 text-head font-bold">
          {heard(str(b.text), say)}
        </h3>
      );
    case "code":
      return <Code key={key} text={str(b.text)} />;
    case "callout":
      return (
        <div key={key} className="callout grid gap-2">
          <span className="eyebrow tone-accent">{heard(str(b.title), say)}</span>
          {lines(b.text, say)}
        </div>
      );
    case "diagram":
      return b.diagram && typeof b.diagram === "object" ? diagram(b.diagram as Block, say, key) : null;
    case "table": {
      const head = arr(b.head).map(str);
      return (
        <div key={key} className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full border-collapse text-detail">
            <thead>
              <tr>
                {head.map((h) => (
                  <th key={h} className="border-b border-line px-3 py-2 text-left font-semibold text-strong">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keyed(arr(b.rows), "row-").map(({ v: r, i: k, key: rowKey }) => {
                const cells = arr(r).map(str);
                const i = say.add(cells.map(plain).join(": "));
                return (
                  <tr
                    key={rowKey}
                    className={cx("say-tap", say.spoken === i && "bg-accent-soft")}
                    onClick={() => say.from(i)}
                  >
                    {keyed(cells, "td6-").map(({ v: c, i: j, key }) => (
                      <td
                        key={key}
                        className={cx(
                          "px-3 py-2 align-top",
                          j === 0 && "whitespace-nowrap font-semibold",
                          k > 0 && "border-t border-line",
                        )}
                      >
                        <Inline text={c} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }
    case "rules":
      return (
        <ul key={key} className="m-0 grid list-none gap-3 p-0">
          {keyed(arr(b.items), "rule-").map(({ v: it, key: ruleKey }) => {
            const parts = arr(it).map(str);
            const i = say.add(parts.map(plain).join(" "));
            return (
              <li
                key={ruleKey}
                className={`say-tap grid gap-0.5 ${say.spoken === i ? "reading" : ""}`}
                onClick={() => say.from(i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") say.from(i);
                }}
              >
                <strong className="text-strong">
                  <Inline text={parts[0] ?? ""} />
                </strong>
                {keyed(parts.slice(1), "p7-").map(({ v: l, key }) => (
                  <p key={key} className="m-0">
                    <Inline text={l} />
                  </p>
                ))}
              </li>
            );
          })}
        </ul>
      );
    case "compare": {
      // options with points are the catalog's comparison (a report's); a lesson's own compares code
      const drawn = arr(b.items).some((x) => x && typeof x === "object" && "points" in x)
        ? readDrawing("compare", b)
        : null;
      if (drawn) return <Drawing key={key} d={drawn} />;
      return (
        <div key={key} className="grid gap-3 md:grid-cols-2">
          {keyed(arr(b.items) as Block[], "div8-").map(({ v: c, key }) => (
            <div key={key} className="grid gap-2">
              <span
                className={`chip tone-${str(c.tone) === "drop" ? "red" : str(c.tone) === "change" ? "yellow" : "green"} justify-self-start`}
              >
                {str(c.label)}
              </span>
              <Code text={str(c.code)} />
            </div>
          ))}
        </div>
      );
    }
    case "links":
      return (
        <ul key={key} className="m-0 grid list-none gap-2 p-0">
          {(arr(b.items) as Block[]).map((l) => (
            <li key={str(l.url)}>
              <a href={str(l.url)} target="_blank" rel="noopener noreferrer" className="text-accent">
                {str(l.title)} ↗
              </a>
            </li>
          ))}
        </ul>
      );
    case "entry": {
      const c = b.check && typeof b.check === "object" ? (b.check as Block) : null;
      const term = heard(str(b.term), say);
      const explain = lines(b.explain, say);
      const exHead = arr(b.example).length ? heard("Example", say) : null;
      const example = arr(b.example).length ? lines(b.example, say) : null;
      const pic = b.diagram && typeof b.diagram === "object" ? diagram(b.diagram as Block, say) : null;
      const quiz = c ? check(str(c.q), c.a, say) : null;
      return (
        <div key={key} className="grid gap-2.5 pt-2">
          <h3 className="font-cond m-0 text-head font-bold">
            {term}
            {str(b.full) && <span className="ml-2 font-sans text-detail font-normal text-muted">{str(b.full)}</span>}
          </h3>
          {explain}
          {example && (
            <div className="example grid gap-2">
              <span className="eyebrow tone-green">{exHead}</span>
              {example}
            </div>
          )}
          {pic}
          {quiz}
          {arr(b.sources).length > 0 && (
            <p className="m-0 text-small text-muted">
              Sources:{" "}
              {(arr(b.sources) as Block[]).map((s, k) => (
                <span key={str(s.url)}>
                  {k > 0 && " · "}
                  <a href={str(s.url)} target="_blank" rel="noopener noreferrer" className="text-accent">
                    {str(s.url).replace(/^https?:\/\//, "")}
                  </a>
                </span>
              ))}
            </p>
          )}
        </div>
      );
    }
    default: {
      // the catalog's other drawings (a flow, a tree, a timeline, a chart, a callout, a check), as Research writes them
      const drawn = readDrawing(str(b.type), b);
      return drawn ? <Drawing key={key} d={drawn} /> : null;
    }
  }
}
