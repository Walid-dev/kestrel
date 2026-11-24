// Ask, on any page: a conversation with the computer's model about what the page shows. The same box on every app:
// a one-line head (what it asks about, and Start over), the conversation so far (kept, so leaving loses nothing), a
// few first questions to tap, and a line to ask with its send button inside. The answer grows as the model writes it
// — the page reads it again three times a second until it lands — and reads like a lesson (my ask, 2026-11-23: "the
// learn page has a good design with the little boxes"): the direct answer first in its own tile, each section under
// a lesson's heading, each point of a list in a tile of its own, a quote in the example's box, code in colour.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { type Drawing as D, isKind, readDrawing } from "../../src/shared/blocks.ts";
import { Drawing } from "./drawing.tsx";
import { Code, Inline } from "./learn/blocks.tsx";

type Card = { label: string; state: "open" | "done" | "failed"; result: string };
type Message = {
  id: string;
  role: "me" | "model";
  text: string;
  state: "writing" | "done" | "failed";
  error: string;
  model: string;
  at: string;
  cards?: Card[];
};

async function call(url: string, method: string, body?: unknown): Promise<{ messages: Message[] }> {
  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { messages?: Message[]; error?: string };
  if (!res.ok) throw new Error(data.error ?? `${res.status}`);
  return { messages: data.messages ?? [] };
}

// Ask's mark, also on a button that opens it (a news story's Ask)
export const Spark = ({ size = 16 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
    <path d="M12 2.5c.6 4.6 2.9 6.9 7.5 7.5-4.6.6-6.9 2.9-7.5 7.5-.6-4.6-2.9-6.9-7.5-7.5 4.6-.6 6.9-2.9 7.5-7.5Z" />
    <path d="M19 15.5c.3 2 1.2 2.9 3.2 3.2-2 .3-2.9 1.2-3.2 3.2-.3-2-1.2-2.9-3.2-3.2 2-.3 2.9-1.2 3.2-3.2Z" />
  </svg>
);

export function Ask({
  app,
  refId,
  title = "Ask",
  placeholder = "Ask about this page",
  starters = [],
  onChange,
  open,
  onOpen,
  defaultOpen = true,
  bare = false,
}: {
  app: string;
  refId: string;
  title?: string;
  placeholder?: string;
  starters?: string[];
  onChange?: () => void; // a change I made from a card: the page reads its data again
  // open or closed: the page may hold it (Searches' Ask button); else it is kept per app in this browser
  open?: boolean;
  onOpen?: (open: boolean) => void;
  defaultOpen?: boolean;
  // inside a card of the page's own (a news story, under its foot): no card and no head; the page shows it only
  // while open, and Start over sits beside the line to ask. The title names it for a screen reader
  bare?: boolean;
}) {
  const kept = `kestrel-ask:${app}`;
  const [own, setOwn] = useState(() => {
    try {
      const v = localStorage.getItem(kept);
      return v ? v === "open" : defaultOpen;
    } catch {
      return defaultOpen;
    }
  });
  const isOpen = bare || (open ?? own);
  const setOpen = (v: boolean) => {
    if (onOpen) onOpen(v);
    else setOwn(v);
    try {
      localStorage.setItem(kept, v ? "open" : "closed");
    } catch {
      // storage off: it stays as it is for this visit
    }
  };
  const queryClient = useQueryClient();
  const key = ["ask", app, refId];
  const where = new URLSearchParams({ app, ref: refId });
  const [text, setText] = useState("");
  const thread = useQuery({
    queryKey: key,
    queryFn: () => call(`/api/ask?${where}`, "GET"),
    // while an answer is being written, read it again as it grows
    refetchInterval: (q) => (q.state.data?.messages.some((m) => m.state === "writing") ? 350 : false),
  });
  const send = useMutation({
    mutationFn: (question: string) => call("/api/ask", "POST", { app, ref: refId, text: question }),
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
      setText("");
    },
  });
  // my tap on a change the model proposed: it runs, and its card says what happened
  const act = useMutation({
    mutationFn: (input: { id: string; card: number }) => call("/api/ask/act", "POST", input),
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
      onChange?.();
    },
  });
  const clear = useMutation({
    mutationFn: () => call(`/api/ask?${where}`, "DELETE"),
    onSuccess: () => queryClient.setQueryData(key, { messages: [] }),
  });
  const messages = thread.data?.messages ?? [];
  const writing = messages.some((m) => m.state === "writing");
  const busy = writing || send.isPending;
  const ask = (q: string) => {
    if (q.trim() && !busy) send.mutate(q.trim());
  };
  const failed = [thread, send, clear, act].find((x) => x.isError);
  const startOver = isOpen && messages.length > 0 && (
    <button
      type="button"
      className="btn btn-icon"
      aria-label="Start over"
      title="Start over"
      disabled={writing || clear.isPending}
      onClick={() => clear.mutate()}
    >
      <svg
        viewBox="0 0 24 24"
        width="15"
        height="15"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v5h5" />
      </svg>
    </button>
  );
  const compose = (
    <form
      className="ask-compose"
      onSubmit={(e) => {
        e.preventDefault();
        ask(text);
      }}
    >
      <textarea
        className="ask-input"
        rows={1}
        aria-label={placeholder}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            ask(text);
          }
        }}
      />
      <button
        type="submit"
        className="ask-send"
        aria-label={busy ? "Answering" : "Ask"}
        title={busy ? "Answering" : "Ask"}
        disabled={!text.trim() || busy}
      >
        {busy ? (
          <span className="spin" />
        ) : (
          <svg
            viewBox="0 0 24 24"
            width="17"
            height="17"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
          </svg>
        )}
      </button>
    </form>
  );

  return (
    <section
      className={bare ? "ask" : `card ask ${isOpen ? "" : "ask-closed"}`}
      aria-busy={writing}
      aria-label={bare ? title : undefined}
    >
      {!bare && (
        <header className="ask-head">
          <button
            type="button"
            className="ask-toggle"
            aria-expanded={isOpen}
            title={`${isOpen ? "Close" : "Open"} · the computer's own model`}
            onClick={() => setOpen(!isOpen)}
          >
            <span className="ask-spark">
              <Spark />
            </span>
            <span className="ask-title">{title}</span>
            {!isOpen && messages.length > 0 && (
              <span className="ask-count">
                {writing ? "answering…" : `${messages.filter((m) => m.role === "me").length} asked`}
              </span>
            )}
            <svg
              className="ask-chevron"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {startOver}
        </header>
      )}

      {isOpen &&
        messages.map((m) =>
          m.role === "me" ? (
            <p key={m.id} className="ask-mine">
              {m.text}
            </p>
          ) : (
            <div key={m.id} className="ask-answer">
              {m.text ? (
                <Answer text={m.text} writing={m.state === "writing"} />
              ) : m.state === "writing" ? (
                <span className="ask-thinking">
                  <span className="spin" /> Thinking
                </span>
              ) : null}
              {m.state === "failed" && <p className="ask-failed">It didn't finish ({m.error}). Ask again.</p>}
              {(m.cards ?? []).map((c, i) => (
                <div key={c.label} className={`ask-card ${c.state}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-strong">{c.label}</span>
                    {c.state !== "open" && (
                      <span className={`mt-0.5 block text-small ${c.state === "done" ? "text-green" : "text-red"}`}>
                        {c.state === "done" ? "✓ " : ""}
                        {c.result}
                      </span>
                    )}
                  </span>
                  {c.state === "open" && (
                    <button
                      type="button"
                      className="btn btn-primary shrink-0"
                      disabled={act.isPending}
                      onClick={() => act.mutate({ id: m.id, card: i })}
                    >
                      Do it
                    </button>
                  )}
                </div>
              ))}
            </div>
          ),
        )}

      {isOpen && messages.length === 0 && starters.length > 0 && (
        <div className="ask-starters">
          {starters.map((s) => (
            <button key={s} type="button" className="pill" disabled={send.isPending} onClick={() => ask(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      {isOpen &&
        (bare ? (
          // no head to hold Start over: it sits beside the line to ask
          <div className="ask-line">
            {compose}
            {startOver}
          </div>
        ) : (
          compose
        ))}
      {isOpen && failed && <p className="ask-failed">{(failed.error as Error).message}</p>}
    </section>
  );
}

// ---- the answer, read like a lesson: the model writes Markdown, the page lays it out in the lessons' boxes ----

type Part =
  | { k: "p" | "h" | "quote"; text: string }
  | { k: "ul" | "ol"; items: string[] }
  | { k: "code"; text: string }
  | { k: "table"; head: string[]; rows: string[][] }
  | { k: "hr" }
  | { k: "drawn"; d: D } // a drawing of the catalog's (src/shared/blocks.ts)
  | { k: "drawing" }; // a drawing still being written

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

// a drawing's JSON as its part, read by the catalog; while the answer still writes it, a placeholder; once whole, one
// that doesn't read shows what it said
function drawing(kind: string, body: string, closed: boolean): Part {
  let d: unknown = null;
  try {
    d = JSON.parse(body);
  } catch {
    d = null;
  }
  const drawn = d === null ? null : readDrawing(kind, d);
  if (drawn) return { k: "drawn", d: drawn };
  return closed ? { k: "code", text: body } : { k: "drawing" };
}

// line by line; an answer still being written parses too (an open fence is code so far). A line in bold alone
// ("**Why it's the weakest**") is a heading, as models write them.
export function parseMarkdown(src: string): Part[] {
  const lines = src.replaceAll("\r", "").split("\n");
  const out: Part[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ k: "p", text: para.join(" ") });
    para = [];
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      flush();
      const body: string[] = [];
      const lang = line.replace(/^\s*```\s*/, "").split(/\s/)[0];
      // kestrel's own blocks (a look it runs, a change it proposes) are JSON too, never shown
      const own = ["find", "action", "read", "web", "page"].includes(lang);
      const json = isKind(lang) || own;
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) {
        // a block of JSON may close its fence at the end of its last line (`…]}```), as models write it too
        const end = json ? lines[i].match(/^(.*\S)\s*```\s*$/) : null;
        if (end) {
          body.push(end[1]);
          break;
        }
        body.push(lines[i]);
      }
      const closed = i < lines.length;
      // the model's own blocks (a find it runs, a change it proposes) are for kestrel, never shown as code; its
      // drawings (the catalog's kinds) become one once their JSON is whole
      if (isKind(lang)) out.push(drawing(lang, body.join("\n"), closed));
      else if (!own) out.push({ k: "code", text: body.join("\n") });
      i++;
      continue;
    }
    if (!line.trim()) {
      flush();
      i++;
      continue;
    }
    const heading = line.match(/^\s*#{1,6}\s+(.*?)\s*#*\s*$/) ?? line.match(/^\s*\*\*([^*]+)\*\*:?\s*$/);
    if (heading) {
      flush();
      out.push({ k: "h", text: heading[1] });
      i++;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flush();
      out.push({ k: "hr" });
      i++;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? "")) {
      flush();
      const head = cells(line);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]); i++) rows.push(cells(lines[i]));
      out.push({ k: "table", head, rows });
      continue;
    }
    const listOf = (re: RegExp, k: "ul" | "ol") => {
      flush();
      const items: string[] = [];
      while (i < lines.length && lines[i].trim()) {
        const m = lines[i].match(re);
        if (m) items.push(m[1]);
        else if (/^\s{2,}\S/.test(lines[i]) && items.length) items[items.length - 1] += ` ${lines[i].trim()}`;
        else break;
        i++;
      }
      out.push({ k, items });
    };
    if (/^\s*[-*•]\s+/.test(line)) {
      listOf(/^\s*[-*•]\s+(.*)$/, "ul");
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      listOf(/^\s*\d+[.)]\s+(.*)$/, "ol");
      continue;
    }
    if (/^\s*>/.test(line)) {
      flush();
      const quote: string[] = [];
      for (; i < lines.length && /^\s*>/.test(lines[i]); i++) quote.push(lines[i].replace(/^\s*>\s?/, ""));
      out.push({ k: "quote", text: quote.join(" ") });
      continue;
    }
    para.push(line.trim());
    i++;
  }
  flush();
  return out;
}

// a point of a list: "**Term**: what it says" reads as a lesson's word and its meaning
function Point({ text }: { text: string }) {
  const term = text.match(/^\*\*([^*]+)\*\*\s*[:—–-]\s*(.+)$/);
  if (!term) return <Inline text={text} />;
  return (
    <>
      <b className="text-strong">
        <Inline text={term[1]} />
      </b>
      <span className="text-ink">
        {" "}
        <Inline text={term[2]} />
      </span>
    </>
  );
}

function Answer({ text, writing }: { text: string; writing: boolean }) {
  const parts = parseMarkdown(text);
  const lead = parts.findIndex((p) => p.k === "p");
  // a short line ending in a colon just before a quote ("Example rewrite:") is the quote's own label
  const labelOf = (n: number) => {
    const before = parts[n - 1];
    return before?.k === "p" && before.text.length <= 60 && /:\s*$/.test(before.text)
      ? before.text.replace(/:\s*$/, "")
      : "";
  };
  return (
    <>
      {parts.map((p, n): ReactNode => {
        const key = `${p.k}${n}`;
        switch (p.k) {
          case "p":
            if (parts[n + 1]?.k === "quote" && labelOf(n + 1)) return null; // it labels the quote below
            // the first paragraph is the direct answer: its own tile, the way a lesson opens with what to say
            return n === lead && lead < 2 ? (
              <p key={key} className="ask-lead">
                <Inline text={p.text} />
              </p>
            ) : (
              <p key={key} className="ask-p">
                <Inline text={p.text} />
              </p>
            );
          case "h":
            return (
              <h4 key={key} className="ask-h">
                <Inline text={p.text} />
              </h4>
            );
          case "ul":
          case "ol":
            return (
              <ul key={key} className="ask-points">
                {p.items.map((it, j) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: an answer's list only grows at its end
                  <li key={j}>
                    <span className="ask-mark" aria-hidden="true">
                      {p.k === "ol" ? j + 1 : "•"}
                    </span>
                    <span className="min-w-0">
                      <Point text={it} />
                    </span>
                  </li>
                ))}
              </ul>
            );
          case "quote":
            return (
              <div key={key} className="read-box grid gap-1">
                <span className="eyebrow tone-accent">
                  <Inline text={labelOf(n) || "Note"} />
                </span>
                <p className="m-0">
                  <Inline text={p.text} />
                </p>
              </div>
            );
          case "code":
            return <Code key={key} text={p.text} />;
          case "drawn":
            return <Drawing key={key} d={p.d} />;
          case "drawing":
            return (
              <span key={key} className="ask-thinking">
                <span className="spin" /> Drawing
              </span>
            );
          case "table":
            return (
              <div key={key} className="overflow-x-auto rounded-xl border border-line bg-surface">
                <table className="w-full border-collapse text-detail">
                  <thead>
                    <tr>
                      {p.head.map((h, j) => (
                        <th
                          // biome-ignore lint/suspicious/noArrayIndexKey: a table's columns are fixed once written
                          key={j}
                          className="border-b border-line px-3 py-2 text-left font-semibold text-strong"
                        >
                          <Inline text={h} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {p.rows.map((r, j) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: an answer's rows only grow at the end
                      <tr key={j}>
                        {r.map((c, k) => (
                          <td
                            // biome-ignore lint/suspicious/noArrayIndexKey: a row's cells are fixed once written
                            key={k}
                            className={`px-3 py-2 align-top ${j ? "border-t border-line" : ""}`}
                          >
                            <Inline text={c} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return <hr key={key} className="m-0 border-0 border-t border-line" />;
        }
      })}
      {writing && <span className="caret" aria-hidden="true" />}
    </>
  );
}
