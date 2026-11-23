// The drawings every agent in kestrel may write and every page draws the same way (v0.8): the model names the parts
// in a small JSON object of a kind from this catalog, and the page lays it out with its own components. The model never
// writes HTML or places anything itself. Each object is untrusted: its reader keeps what fits and drops the rest, and
// one that doesn't read shows as plain words instead. Markdown keeps what models already write well (text, lists,
// code, tables). Ask writes a drawing as a fenced block (its kind as the fence's language); Research writes it as one of
// its report's blocks ({"type": "<kind>", …}). Nothing from Node here: the web reads this file too.

export type Drawing =
  | { kind: "flow"; title: string; steps: string[] }
  | { kind: "compare"; items: { title: string; points: string[] }[] }
  | { kind: "tree"; title: string; root: string; branches: { label: string; leaves: string[] }[] }
  | { kind: "timeline"; title: string; events: { when: string; what: string }[] }
  | { kind: "chart"; title: string; unit: string; bars: { label: string; value: number }[] }
  | { kind: "callout"; tone: "tip" | "warn"; title: string; text: string }
  | { kind: "check"; q: string; a: string };
export type Kind = Drawing["kind"];

type O = Record<string, unknown>;
const obj = (v: unknown): O | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as O) : null);
const text = (v: unknown, max = 300): string =>
  (typeof v === "string" ? v : typeof v === "number" ? String(v) : "").trim().slice(0, max);
const texts = (v: unknown, most: number, max = 300): string[] =>
  (Array.isArray(v) ? v : typeof v === "string" ? [v] : [])
    .map((x) => text(x, max))
    .filter(Boolean)
    .slice(0, most);
const objs = (v: unknown, most: number): O[] =>
  (Array.isArray(v) ? v : [])
    .map(obj)
    .filter((x): x is O => x !== null)
    .slice(0, most);
const number = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[,\s]/g, "")) : Number.NaN;
  return Number.isFinite(n) ? n : null;
};

// each kind: when it helps (said to the model), its shape (shown to the model), and its reader (null: it didn't read)
export const CATALOG: Record<Kind, { when: string; shape: string; read: (d: O) => Drawing | null }> = {
  flow: {
    when: "the steps of a process in the order they happen (a request's path, how something works); not dates",
    shape: '{"title": "<what it shows>", "steps": ["<3 to 7 short steps>"]}',
    read: (d) => {
      const steps = texts(d.steps, 9);
      return steps.length >= 2 ? { kind: "flow", title: text(d.title), steps } : null;
    },
  },
  compare: {
    when: "two or three options side by side",
    shape: '{"items": [{"title": "<option>", "points": ["<short point>"]}]}',
    read: (d) => {
      const items = objs(d.items, 3)
        // the names models also use for a column's title and its points
        .map((x) => ({
          title: text(x.title ?? x.name ?? x.label, 80),
          points: texts(x.points ?? x.pros ?? x.items, 8),
        }))
        .filter((x) => x.title);
      return items.length >= 2 ? { kind: "compare", items } : null;
    },
  },
  tree: {
    when: "a whole and its parts, or the kinds of a thing with an example of each (instead of a list of them)",
    shape:
      '{"title": "<what it shows>", "root": "<the whole>", "branches": [{"label": "<a part>", "leaves": ["<its own parts, if any>"]}]}',
    read: (d) => {
      const branches = objs(d.branches, 6)
        .map((x) => ({ label: text(x.label, 80), leaves: texts(x.leaves, 6, 120) }))
        .filter((x) => x.label);
      const root = text(d.root, 80);
      return root && branches.length >= 2 ? { kind: "tree", title: text(d.title), root, branches } : null;
    },
  },
  timeline: {
    when: "anything told by date or by version: a history, releases over the years, a schedule (not a flow)",
    shape: '{"title": "<what it shows>", "events": [{"when": "<a date or a time>", "what": "<what happened>"}]}',
    read: (d) => {
      const events = objs(d.events, 12)
        .map((x) => ({ when: text(x.when, 40), what: text(x.what, 200) }))
        .filter((x) => x.when && x.what);
      return events.length >= 2 ? { kind: "timeline", title: text(d.title), events } : null;
    },
  },
  chart: {
    when: "2 to 10 numbers of the same unit to compare at a glance (sizes, prices, counts)",
    shape: '{"title": "<what it shows>", "unit": "<the unit>", "bars": [{"label": "<name>", "value": <a number>}]}',
    read: (d) => {
      const bars = objs(d.bars, 10)
        .map((x) => ({ label: text(x.label, 60), value: number(x.value) }))
        .filter((x): x is { label: string; value: number } => Boolean(x.label) && x.value !== null && x.value >= 0);
      return bars.length >= 2 && bars.some((b) => b.value > 0)
        ? { kind: "chart", title: text(d.title), unit: text(d.unit, 20), bars }
        : null;
    },
  },
  callout: {
    when: "the answer's main warning when it warns of a danger or a mistake (warn), or one tip worth remembering (tip)",
    shape: '{"tone": "warn" | "tip", "title": "<a short label>", "text": "<one or two sentences>"}',
    read: (d) => {
      const body = texts(d.text, 4, 400).join(" ");
      return body
        ? { kind: "callout", tone: d.tone === "warn" ? "warn" : "tip", title: text(d.title, 60), text: body }
        : null;
    },
  },
  check: {
    when: "when I ask to be tested, or after teaching: one question, its answer hidden until I ask (never written in the text)",
    shape: '{"q": "<a question>", "a": "<its answer>"}',
    read: (d) => {
      const q = text(d.q, 300);
      const a = text(d.a, 600);
      return q && a ? { kind: "check", q, a } : null;
    },
  },
};

export const isKind = (k: string): k is Kind => Object.hasOwn(CATALOG, k);

export function readDrawing(kind: string, d: unknown): Drawing | null {
  const o = obj(d);
  return isKind(kind) && o ? CATALOG[kind].read(o) : null;
}

// the catalog in a prompt: Ask's fenced blocks, or Research's typed ones
export function catalogLines(kinds: Kind[], as: "fence" | "typed"): string[] {
  return kinds.map((k) =>
    as === "fence"
      ? `- ${CATALOG[k].when}: \`\`\`${k}\n${CATALOG[k].shape}\n\`\`\``
      : `- ${CATALOG[k].when}: {"type": "${k}", ${CATALOG[k].shape.slice(1)}`,
  );
}

// the drawings in a whole answer (the evals and the tests read them here; the page parses as the answer streams)
export function drawingsIn(answer: string): { kind: Kind; drawing: Drawing | null }[] {
  const out: { kind: Kind; drawing: Drawing | null }[] = [];
  // the closing fence on a line of its own, or at the end of the JSON's last line (models write both)
  for (const m of answer.replaceAll("\r", "").matchAll(/^\s*```(\w+)[^\n]*\n([\s\S]*?)```/gm)) {
    if (!isKind(m[1])) continue;
    let d: unknown = null;
    try {
      d = JSON.parse(m[2]);
    } catch {
      d = null;
    }
    out.push({ kind: m[1], drawing: readDrawing(m[1], d) });
  }
  return out;
}
