// Ask, on any page: a conversation with the computer's model about what the page shows. The same box on every app:
// the conversation so far (kept, so leaving loses nothing), a few first questions to tap, and a line to ask. The
// answer grows as the model writes it — the page reads it again three times a second until it lands — and reads as
// Markdown in the lessons' own marks: bold, `code`, lists, code in colour, tables, links to a lesson.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
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

export function Ask({
  app,
  refId,
  title = "Ask",
  placeholder = "Ask about this page",
  starters = [],
  onChange,
}: {
  app: string;
  refId: string;
  title?: string;
  placeholder?: string;
  starters?: string[];
  onChange?: () => void; // a change I made from a card: the page reads its data again
}) {
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
  const ask = (q: string) => {
    if (q.trim() && !writing && !send.isPending) send.mutate(q.trim());
  };
  const failed = [thread, send, clear, act].find((x) => x.isError);

  return (
    <section className="card ask grid gap-3" aria-busy={writing}>
      <div className="flex items-center gap-2">
        <span style={{ color: "var(--purple)" }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
            <path d="M12 2.5c.6 4.6 2.9 6.9 7.5 7.5-4.6.6-6.9 2.9-7.5 7.5-.6-4.6-2.9-6.9-7.5-7.5 4.6-.6 6.9-2.9 7.5-7.5Z" />
            <path d="M19 15.5c.3 2 1.2 2.9 3.2 3.2-2 .3-2.9 1.2-3.2 3.2-.3-2-1.2-2.9-3.2-3.2 2-.3 2.9-1.2 3.2-3.2Z" />
          </svg>
        </span>
        <span className="eyebrow" style={{ color: "var(--purple)" }}>
          {title}
        </span>
        <span className="text-[12px]" style={{ color: "var(--muted)" }}>
          the computer's model
        </span>
        {messages.length > 0 && (
          <button
            type="button"
            className="btn btn-quiet ml-auto !py-1 text-[12.5px]"
            disabled={writing || clear.isPending}
            onClick={() => clear.mutate()}
          >
            Start over
          </button>
        )}
      </div>

      {messages.map((m) =>
        m.role === "me" ? (
          <p key={m.id} className="ask-mine m-0">
            {m.text}
          </p>
        ) : (
          <div key={m.id} className="ask-answer">
            {m.text ? (
              <Markdown text={m.text} />
            ) : m.state === "writing" ? (
              <span className="eyebrow inline-flex items-center gap-2" style={{ color: "var(--purple)" }}>
                <span className="spin" /> Thinking
              </span>
            ) : null}
            {m.state === "writing" && m.text && <span className="caret" aria-hidden="true" />}
            {m.state === "failed" && (
              <p className="m-0 text-[13.5px]" style={{ color: "var(--red)" }}>
                It didn't finish ({m.error}). Ask again.
              </p>
            )}
            {(m.cards ?? []).map((c, i) => (
              <div key={c.label} className="ask-card">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold" style={{ color: "var(--strong)" }}>
                    {c.label}
                  </span>
                  {c.state !== "open" && (
                    <span
                      className="block text-[13px]"
                      style={{ color: c.state === "done" ? "var(--green)" : "var(--red)" }}
                    >
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

      {messages.length === 0 && starters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {starters.map((s) => (
            <button key={s} type="button" className="pill" disabled={send.isPending} onClick={() => ask(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(text);
        }}
      >
        <textarea
          className="btn min-h-[44px] min-w-0 flex-1 resize-none text-left text-[15px] leading-relaxed"
          style={{ fieldSizing: "content", maxHeight: "40vh" } as React.CSSProperties}
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
          className="btn btn-primary inline-flex shrink-0 items-center gap-2"
          disabled={!text.trim() || writing || send.isPending}
        >
          {(writing || send.isPending) && <span className="spin" />}
          {writing ? "Answering" : "Ask"}
        </button>
      </form>
      {failed && (
        <p className="m-0 text-sm" style={{ color: "var(--red)" }}>
          {(failed.error as Error).message}
        </p>
      )}
    </section>
  );
}

// ---- Markdown, as the model writes it: paragraphs, headings, lists, quotes, code fences and tables ----

type Part =
  | { k: "p" | "h" | "quote"; text: string }
  | { k: "ul" | "ol"; items: string[] }
  | { k: "code"; text: string }
  | { k: "table"; head: string[]; rows: string[][] }
  | { k: "hr" };

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

// line by line; an answer still being written parses too (an open fence is code so far)
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
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) body.push(lines[i]);
      // the model's own blocks (a find it runs, a change it proposes) are for kestrel, never shown as code
      if (!/^\s*```\s*(find|action)\b/.test(line)) out.push({ k: "code", text: body.join("\n") });
      i++;
      continue;
    }
    if (!line.trim()) {
      flush();
      i++;
      continue;
    }
    const heading = line.match(/^\s*#{1,6}\s+(.*?)\s*#*\s*$/);
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

export function Markdown({ text }: { text: string }) {
  return (
    <>
      {parseMarkdown(text).map((p, n): ReactNode => {
        const key = `${p.k}${n}`;
        switch (p.k) {
          case "p":
            return (
              <p key={key} className="m-0">
                <Inline text={p.text} />
              </p>
            );
          case "h":
            return (
              <h4 key={key} className="font-cond m-0 mt-1 text-[17px] font-bold" style={{ color: "var(--strong)" }}>
                <Inline text={p.text} />
              </h4>
            );
          case "ul":
          case "ol": {
            const List = p.k;
            return (
              <List key={key} className={`m-0 grid gap-1 pl-5 ${p.k === "ul" ? "list-disc" : "list-decimal"}`}>
                {p.items.map((it, j) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: an answer's list only grows at its end
                  <li key={j}>
                    <Inline text={it} />
                  </li>
                ))}
              </List>
            );
          }
          case "quote":
            return (
              <div key={key} className="callout">
                <p className="m-0">
                  <Inline text={p.text} />
                </p>
              </div>
            );
          case "code":
            return <Code key={key} text={p.text} />;
          case "table":
            return (
              <div
                key={key}
                className="overflow-x-auto rounded-xl border"
                style={{ borderColor: "var(--line)", background: "var(--surface)" }}
              >
                <table className="w-full border-collapse text-[13.5px]">
                  <thead>
                    <tr>
                      {p.head.map((h, j) => (
                        <th
                          // biome-ignore lint/suspicious/noArrayIndexKey: a table's columns are fixed once written
                          key={j}
                          className="px-3 py-2 text-left font-semibold"
                          style={{ borderBottom: "1px solid var(--line)", color: "var(--strong)" }}
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
                            className="px-3 py-2 align-top"
                            style={{ borderTop: j ? "1px solid var(--line)" : undefined }}
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
            return <hr key={key} className="m-0 border-0 border-t" style={{ borderColor: "var(--line)" }} />;
        }
      })}
    </>
  );
}
