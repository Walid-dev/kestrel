// Research: ask anything; the computer's model searches the web, quick or deep, and writes the answer like a lesson —
// the point first, short lines to hear one by one, the words explained, its sources numbered. Every answer is kept.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { block, heard, type Say } from "./learn/blocks.tsx";
import { type Spoken, useReader } from "./learn/voice.ts";

type Level = "quick" | "deep";
type Row = {
  id: string;
  question: string;
  level: Level;
  state: "running" | "done" | "failed";
  step: string;
  started: string;
  error: string;
  title: string;
  short: string;
};
type Report = {
  title: string;
  short: string;
  blocks: Record<string, unknown>[];
  words: { w: string; m: string }[];
  unsure: string[];
  sources: number[];
  refs: { n: number; title: string; url: string }[];
  read: number[];
  model: string;
};
type Full = Omit<Row, "title" | "short"> & { report: Report | null };

const LEVELS: [Level, string, string][] = [
  ["quick", "Quick", "one search, three pages, about a minute"],
  ["deep", "Deep", "several searches, six pages, a few minutes"],
];
const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = (await res.json().catch(() => ({}))) as { error?: string; id?: string };
  if (!res.ok) throw new Error(j.error ?? `${res.status}`);
  return j;
}

export function Research() {
  const [params, setParams] = useSearchParams();
  const open = params.get("open");
  return open ? (
    <ReportView id={open} onBack={() => setParams({})} />
  ) : (
    <Ask onOpen={(id) => setParams({ open: id })} />
  );
}

function Ask({ onOpen }: { onOpen: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState("");
  const [level, setLevel] = useState<Level>("quick");
  const list = useQuery({
    queryKey: ["research"],
    queryFn: async () => {
      const res = await fetch("/api/research");
      if (!res.ok) throw new Error(`The answers didn't load (${res.status})`);
      return (await res.json()) as { research: Row[] };
    },
    refetchInterval: (q) => (q.state.data?.research.some((r) => r.state === "running") ? 2000 : false),
  });
  const ask = useMutation({
    mutationFn: () => send("/api/research", "POST", { question, level }),
    onSuccess: () => {
      setQuestion("");
      queryClient.invalidateQueries({ queryKey: ["research"] });
    },
  });
  const rows = list.data?.research ?? [];
  const running = rows.find((r) => r.state === "running");
  return (
    <main className="grid gap-4">
      <header className="grid gap-1">
        <h2 className="font-cond m-0 text-[34px] font-bold uppercase leading-none tracking-tight">Research</h2>
        <p className="m-0 text-[15px]" style={{ color: "var(--muted)" }}>
          Ask anything. The computer's model searches the web and writes the answer plainly, like a lesson you can
          listen to.
        </p>
      </header>
      <section className="card grid gap-3">
        <textarea
          className="btn min-h-[96px] text-[15px] leading-relaxed"
          placeholder="How does something work, what should I choose, what changed lately…"
          value={question}
          maxLength={1000}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && question.trim()) ask.mutate();
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          {LEVELS.map(([k, label, hint]) => (
            <button key={k} type="button" className="pill" aria-pressed={level === k} onClick={() => setLevel(k)}>
              {label} <span style={{ color: "var(--muted)", fontWeight: 400 }}>· {hint}</span>
            </button>
          ))}
          <button
            type="button"
            className="btn btn-primary ml-auto"
            disabled={!question.trim() || ask.isPending || Boolean(running)}
            onClick={() => ask.mutate()}
          >
            {running ? "Researching…" : "Research"}
          </button>
        </div>
        {ask.isError && (
          <p className="m-0 text-sm" style={{ color: "var(--red)" }}>
            {(ask.error as Error).message}
          </p>
        )}
      </section>

      {running && (
        <section className="card flex items-center gap-3">
          <span className="dot tone-green pulse" />
          <div className="min-w-0">
            <p className="m-0 truncate font-semibold" style={{ color: "var(--strong)" }}>
              {running.question}
            </p>
            <p className="m-0 text-[13px]" style={{ color: "var(--muted)" }}>
              {running.step || "Starting"}…
            </p>
          </div>
        </section>
      )}

      {rows.filter((r) => r.state !== "running").length > 0 && <span className="eyebrow">Kept</span>}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows
          .filter((r) => r.state !== "running")
          .map((r) => (
            <button
              key={r.id}
              type="button"
              className="card card-link grid content-start gap-1.5 text-left"
              onClick={() => onOpen(r.id)}
            >
              <div className="flex items-center gap-2">
                <span className={`chip chip-caps ${r.level === "deep" ? "tone-purple" : "tone-accent"}`}>
                  {r.level}
                </span>
                {r.state === "failed" && <span className="chip chip-caps tone-red">failed</span>}
                <span className="eyebrow ml-auto">{when(r.started)}</span>
              </div>
              <span className="font-cond text-[19px] font-bold leading-tight" style={{ color: "var(--strong)" }}>
                {r.title || r.question}
              </span>
              <span className="line-clamp-2 text-[14px]" style={{ color: "var(--muted)" }}>
                {r.state === "failed" ? r.error : r.short}
              </span>
            </button>
          ))}
      </section>
      {list.data && rows.length === 0 && (
        <p className="m-0 text-sm" style={{ color: "var(--muted)" }}>
          Nothing asked yet.
        </p>
      )}
    </main>
  );
}

function ReportView({ id, onBack }: { id: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const reader = useReader();
  const list = useRef<Spoken[]>([]);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const one = useQuery({
    queryKey: ["research", id],
    queryFn: async () => {
      const res = await fetch(`/api/research/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`This answer didn't load (${res.status})`);
      return (await res.json()) as Full;
    },
    refetchInterval: (q) => (q.state.data?.state === "running" ? 2000 : false),
  });
  const drop = useMutation({
    mutationFn: () => send(`/api/research/${encodeURIComponent(id)}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["research"] });
      onBack();
    },
  });
  const r = one.data;
  const back = (
    <button type="button" className="btn btn-quiet justify-self-start" onClick={onBack}>
      ← All research
    </button>
  );
  if (!r) return <main className="grid gap-3">{back}</main>;
  if (!r.report)
    return (
      <main className="grid gap-3">
        {back}
        <section className="card grid gap-2">
          <p className="m-0 font-semibold" style={{ color: "var(--strong)" }}>
            {r.question}
          </p>
          <p className="m-0 text-sm" style={{ color: r.state === "failed" ? "var(--red)" : "var(--muted)" }}>
            {r.state === "running" ? `${r.step || "Starting"}…` : r.error}
          </p>
        </section>
      </main>
    );
  const rep = r.report;
  // every heard line registers here in reading order; Listen plays this list and lights its index
  const spoken: Spoken[] = [];
  list.current = spoken;
  const say: Say = {
    add: (text, opts) => spoken.push({ text, pause: opts?.pause }) - 1,
    spoken: reader.at,
    from: (i) => reader.play(list.current, i),
    isOpen: (k) => opened.has(k),
    open: (k) => setOpened((s) => new Set(s).add(k)),
  };
  const title = heard(rep.title, say);
  const lede = heard(rep.short, say);
  const body = rep.blocks.map((b, i) => block(b, say, `b${i}`));
  const wordsHead = rep.words.length ? heard("Words", say) : null;
  const words = rep.words
    .filter((w) => w.w)
    .map((w) => {
      const i = say.add(`${w.w}: ${w.m}`);
      return (
        <p key={w.w} className={`m-0 ${reader.at === i ? "reading" : ""}`}>
          <b style={{ color: "var(--strong)" }}>{w.w}</b> <span style={{ color: "var(--muted)" }}>— {w.m}</span>
        </p>
      );
    });
  const used = rep.refs.filter((x) => (rep.sources.length ? rep.sources : rep.read).includes(x.n));
  return (
    <main className="grid max-w-3xl gap-4">
      {back}
      <article className="grid gap-4">
        <div className="grid gap-2">
          <span className="eyebrow">
            Research · {r.level === "deep" ? "Deep" : "Quick"} · {when(r.started)}
          </span>
          <h1
            className="font-cond m-0 text-[30px] font-bold leading-tight md:text-[36px]"
            style={{ color: "var(--strong)" }}
          >
            {title}
          </h1>
          <p className="m-0 text-[17px] leading-relaxed" style={{ color: "var(--text)" }}>
            {lede}
          </p>
          <p className="m-0 text-[13px]" style={{ color: "var(--muted)" }}>
            You asked: {r.question}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => (reader.reading ? reader.stop() : reader.play(list.current))}
          >
            {reader.reading ? "■ Stop" : "▶ Listen"}
          </button>
          <button
            type="button"
            className="btn"
            aria-pressed={reader.speed < 1}
            style={reader.speed < 1 ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
            onClick={() => reader.setSpeed((s) => (s < 1 ? 1 : 0.8))}
          >
            Slow
          </button>
        </div>
        <section className="card grid gap-3 text-[16px] leading-relaxed">{body}</section>
        {words.length > 0 && (
          <section className="card grid gap-1.5">
            <span className="eyebrow" style={{ color: "var(--accent)" }}>
              {wordsHead}
            </span>
            {words}
          </section>
        )}
        {rep.unsure.length > 0 && (
          <section className="callout grid gap-1">
            <span className="eyebrow" style={{ color: "var(--accent)" }}>
              Not settled
            </span>
            {rep.unsure.map((u) => (
              <p key={u} className="m-0">
                {u}
              </p>
            ))}
          </section>
        )}
        {used.length > 0 && (
          <section className="grid gap-1.5">
            <span className="eyebrow">Sources</span>
            {used.map((s) => (
              <a
                key={s.n}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-[14px] hover:underline"
                style={{ color: "var(--accent)" }}
              >
                [{s.n}] {s.title || s.url}
              </a>
            ))}
          </section>
        )}
        <p className="m-0 text-[12.5px]" style={{ color: "var(--muted)" }}>
          Written by {rep.model} from {rep.read.length} pages it read.{" "}
          <button
            type="button"
            className="underline"
            style={{ color: "var(--red)" }}
            onClick={() => {
              if (confirm("Delete this answer?")) drop.mutate();
            }}
          >
            Delete
          </button>
        </p>
      </article>
    </main>
  );
}
