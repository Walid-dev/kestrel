// One lesson per page, built to learn fast. A guide topic reads like the guides: its part and topic, the title, the
// lede, then the blocks — entries, examples, diagrams, checks. A lesson to say follows the old Learn's method: review
// from memory first when it is due, then "Say it" (tap a line to hear it, Listen, Slow, Record me), what it means,
// the example and the words, and an honest grade at the end. Listen reads the whole page in the computer's voice.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { block, heard, Inline, lines, plain, type Say } from "./blocks.tsx";
import { type Spoken, useReader } from "./voice.ts";

type Body = {
  eyebrow: string;
  part: string;
  short: string;
  say: string[];
  explain: string[];
  example: string;
  words: { w: string; m: string }[];
  check: { q: string; a: string }[];
  blocks: Record<string, unknown>[];
};
type Lesson = {
  id: string;
  pack: string;
  title: string;
  body: Body;
  state: "due" | "new" | "learning" | "known";
  packName: string;
  area: "learn" | "interview";
};
export const STATE_CHIP: Record<string, [string, string]> = {
  due: ["Review today", "tone-yellow"],
  new: ["New", "tone-accent"],
  learning: ["Learning", "tone-purple"],
  known: ["Known", "tone-green"],
};

function Recorder() {
  const [url, setUrl] = useState("");
  const [on, setOn] = useState(false);
  const [why, setWhy] = useState("");
  const rec = useRef<MediaRecorder | null>(null);
  useEffect(
    () => () => {
      for (const t of rec.current?.stream.getTracks() ?? []) t.stop();
    },
    [],
  );
  const toggle = async () => {
    if (on) {
      rec.current?.stop();
      setOn(false);
      return;
    }
    setWhy("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const parts: Blob[] = [];
      r.ondataavailable = (e) => parts.push(e.data);
      r.onstop = () => {
        for (const t of stream.getTracks()) t.stop();
        setUrl(URL.createObjectURL(new Blob(parts, { type: r.mimeType })));
      };
      rec.current = r;
      r.start();
      setOn(true);
    } catch {
      setWhy("the microphone was refused");
    }
  };
  return (
    <>
      <button
        type="button"
        className="btn"
        onClick={toggle}
        style={on ? { borderColor: "var(--red)", color: "var(--red)" } : undefined}
      >
        {on ? "■ Stop recording" : "Record me"}
      </button>
      {url && !on && (
        // biome-ignore lint/a11y/useMediaCaption: my own voice, played back to compare
        <audio src={url} controls className="h-8 max-w-[220px]" />
      )}
      {why && (
        <span className="text-xs" style={{ color: "var(--red)" }}>
          {why}
        </span>
      )}
    </>
  );
}

export function LearnLesson() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const reader = useReader();
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [question, setQuestion] = useState("");
  const list = useRef<Spoken[]>([]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new lesson resets the page, nothing else does
  useEffect(() => {
    reader.stop();
    setOpened(new Set());
    window.scrollTo(0, 0);
  }, [id]);

  const lesson = useQuery({
    queryKey: ["lesson", id],
    queryFn: async () => {
      const res = await fetch(`/api/learn/lessons/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`the lesson didn't load (${res.status})`);
      return (await res.json()) as Lesson;
    },
  });
  const siblings = useQuery({
    queryKey: ["pack", lesson.data?.pack ?? ""],
    queryFn: async () => {
      const res = await fetch(`/api/learn/packs/${encodeURIComponent(lesson.data?.pack ?? "")}`);
      if (!res.ok) throw new Error(`${res.status}`);
      return (await res.json()) as { lessons: { id: string; title: string }[] };
    },
    enabled: Boolean(lesson.data),
  });
  const grade = useMutation({
    mutationFn: async (g: "again" | "good") => {
      const res = await fetch("/api/learn/grade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lesson: id, grade: g }),
      });
      const data = (await res.json()) as { intervalDays?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? `${res.status}`);
      return data as { intervalDays: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lesson", id] });
      queryClient.invalidateQueries({ queryKey: ["learn-overview"] });
      queryClient.invalidateQueries({ queryKey: ["due"] });
      queryClient.invalidateQueries({ queryKey: ["brief"] });
    },
  });
  const ask = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/learn/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lesson: id, question }),
      });
      const data = (await res.json()) as { answer?: string; drewOn?: { id: string; title: string }[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `${res.status}`);
      return data as { answer: string; drewOn: { id: string; title: string }[] };
    },
  });

  if (lesson.isError)
    return (
      <main className="grid gap-3">
        <p className="text-sm" style={{ color: "var(--red)" }}>
          {String((lesson.error as Error).message)}
        </p>
        <Link to="/learn" className="btn justify-self-start">
          ← Learn
        </Link>
      </main>
    );
  if (!lesson.data) return null;
  const L = lesson.data;
  const b = L.body;
  const guide = b.blocks.length > 0;

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
  const back = L.area === "interview" ? "/interview" : `/learn?pack=${encodeURIComponent(L.pack)}`;
  const sibs = siblings.data?.lessons ?? [];
  const at = sibs.findIndex((l) => l.id === id);
  const [chip, tone] = STATE_CHIP[L.state] ?? STATE_CHIP.new;

  // the page's parts, built in reading order so Listen follows the page
  const title = heard(L.title, say);
  const lede = b.short ? heard(b.short, say) : null;
  let body: React.ReactNode;
  if (guide) {
    body = <div className="grid gap-4 text-[16px] leading-[1.7]">{b.blocks.map((x, k) => block(x, say, k))}</div>;
  } else {
    const due = (L.state === "due" || L.state === "learning") && b.check.length > 0;
    const review = due ? (
      <section
        className="card grid gap-3"
        style={{ borderColor: "color-mix(in srgb, var(--yellow) 45%, var(--line))" }}
      >
        <h3 className="font-cond m-0 text-lg font-bold">{heard("Review first: answer from memory", say)}</h3>
        {b.check.map((c) => {
          const k = `review:${c.q}`;
          const q = lines([c.q], say);
          const a = lines([c.a], say, 3500);
          const open = opened.has(k);
          return (
            <div key={k} className="grid gap-2">
              <div className="font-semibold" style={{ color: "var(--strong)" }}>
                {q}
              </div>
              <div className="example" hidden={!open}>
                {a}
              </div>
              {!open && (
                <button type="button" className="btn justify-self-start" onClick={() => say.open(k)}>
                  Show the answer
                </button>
              )}
            </div>
          );
        })}
      </section>
    ) : null;
    const sayHead = b.say.length ? heard("Say it", say) : null;
    const sayRows = b.say.map((s) => {
      const i = say.add(s);
      return (
        <button
          key={s}
          type="button"
          className="flex w-full cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 text-left text-[16.5px] leading-relaxed"
          style={{
            background: reader.at === i ? "var(--accent-soft)" : "var(--surface-2)",
            boxShadow: reader.at === i ? "0 0 0 1px var(--accent)" : undefined,
          }}
          onClick={() => reader.play([{ text: s }], 0)}
        >
          <span
            className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px]"
            style={{ background: "var(--surface)", color: "var(--accent)" }}
          >
            ▶
          </span>
          <span style={{ color: "var(--strong)" }}>{s}</span>
        </button>
      );
    });
    const meansHead = b.explain.length ? heard("What it means", say) : null;
    const means = lines(b.explain, say);
    const exHead = b.example ? heard(L.area === "interview" ? "The points" : "Example", say) : null;
    const example = b.example ? lines([b.example], say) : null;
    const wordsHead = b.words.length ? heard("Words", say) : null;
    const words = b.words.map((w) => {
      const i = say.add(`${w.w}: ${w.m}`);
      return (
        <p key={w.w} className={`m-0 ${reader.at === i ? "reading" : ""}`}>
          <span
            className="font-semibold"
            style={{ color: "var(--strong)", textDecoration: "underline dotted", textUnderlineOffset: 4 }}
          >
            {w.w}
          </span>
          <span className="ml-3" style={{ color: "var(--muted)" }}>
            {w.m}
          </span>
        </p>
      );
    });
    const checks =
      !due && b.check.length > 0
        ? b.check.map((c) => {
            const k = `check:${c.q}`;
            const q = lines([c.q], say);
            const a = lines([c.a], say, 3500);
            const open = opened.has(k);
            return (
              <div key={k} className="grid gap-1.5 pt-3" style={{ borderTop: "1px dashed var(--line)" }}>
                <span className="eyebrow" style={{ color: "var(--accent)" }}>
                  Check yourself
                </span>
                {q}
                <div className="example" hidden={!open}>
                  {a}
                </div>
                {!open && (
                  <button
                    type="button"
                    className="justify-self-start text-[13.5px]"
                    style={{ color: "var(--accent)", cursor: "pointer" }}
                    onClick={() => say.open(k)}
                  >
                    Show the answer
                  </button>
                )}
              </div>
            );
          })
        : null;
    body = (
      <>
        {review}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {b.say.length > 0 && (
            <section className="card grid content-start gap-3">
              <h3 className="font-cond m-0 text-lg font-bold">{sayHead}</h3>
              <p className="m-0 text-sm" style={{ color: "var(--muted)" }}>
                Tap a sentence to hear it. Listen, then say it with the voice.
              </p>
              <div className="grid gap-2">{sayRows}</div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => (reader.reading ? reader.stop() : reader.play(b.say.map((text) => ({ text }))))}
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
                <Recorder />
              </div>
            </section>
          )}
          <section className="grid content-start gap-4 text-[16px] leading-[1.7]">
            {b.explain.length > 0 && (
              <div className="grid gap-2">
                <h3 className="font-cond m-0 text-lg font-bold">{meansHead}</h3>
                {means}
              </div>
            )}
            {example && (
              <div className="read-box grid gap-1.5">
                <span className="eyebrow" style={{ color: "var(--accent)" }}>
                  {exHead}
                </span>
                {example}
              </div>
            )}
            {b.words.length > 0 && (
              <div className="grid gap-2">
                <h3 className="font-cond m-0 text-lg font-bold">{wordsHead}</h3>
                {words}
              </div>
            )}
            {checks}
          </section>
        </div>
      </>
    );
  }

  return (
    <main className={`mx-auto grid w-full gap-5 ${guide ? "max-w-3xl" : "max-w-6xl"}`}>
      <div
        className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-2 px-1 py-2"
        style={{ background: "color-mix(in srgb, var(--bg) 88%, transparent)", backdropFilter: "blur(8px)" }}
      >
        <Link to={back} className="text-sm font-medium" style={{ color: "var(--accent)" }}>
          ← {L.area === "interview" ? "Interview prep" : L.packName || "Learn"}
        </Link>
        <span className={`chip ${tone} ml-auto`}>{chip}</span>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => (reader.reading ? reader.stop() : reader.play(list.current))}
        >
          {reader.reading ? "■ Stop" : "▶ Listen"}
        </button>
        {guide && (
          <button
            type="button"
            className="btn"
            aria-pressed={reader.speed < 1}
            style={reader.speed < 1 ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
            onClick={() => reader.setSpeed((s) => (s < 1 ? 1 : 0.8))}
          >
            Slow
          </button>
        )}
      </div>
      <header className="grid gap-2">
        {b.part && <span className="eyebrow">{b.part}</span>}
        {b.eyebrow && (
          <span className="eyebrow" style={{ color: guide ? "var(--muted)" : "var(--accent)" }}>
            {b.eyebrow}
          </span>
        )}
        <h2 className={`font-cond m-0 font-bold leading-tight ${guide ? "text-[28px]" : "text-[34px]"}`}>{title}</h2>
        {lede && (
          <p className="m-0 text-[17px] leading-relaxed" style={{ color: "var(--text)" }}>
            {lede}
          </p>
        )}
      </header>
      {body}
      {(b.check.length > 0 || guide) && (
        <section className="card flex flex-wrap items-center gap-3">
          <span className="font-cond text-lg font-bold">{guide ? "Done with this topic?" : "How did it go?"}</span>
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            {grade.data
              ? `Next review in ${grade.data.intervalDays} day${grade.data.intervalDays === 1 ? "" : "s"}.`
              : guide
                ? "It comes back to review on the ladder: 1, 3, 7, 16, 35 days."
                : "Be honest: a lesson you knew climbs; one you missed comes back tomorrow."}
          </span>
          <span className="ml-auto flex gap-2">
            <button type="button" className="btn" disabled={grade.isPending} onClick={() => grade.mutate("again")}>
              Again
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={grade.isPending}
              onClick={() => grade.mutate("good")}
            >
              {guide ? "✓ Done" : "✓ I knew it"}
            </button>
          </span>
          {grade.isError && (
            <span className="w-full text-sm" style={{ color: "var(--red)" }}>
              {String((grade.error as Error).message)}
            </span>
          )}
        </section>
      )}
      <section className="grid gap-2">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (question.trim() && !ask.isPending) ask.mutate();
          }}
        >
          <input
            type="text"
            className="btn min-w-0 flex-1"
            placeholder="Ask about this lesson"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={ask.isPending || !question.trim()}>
            {ask.isPending ? "Asking…" : "Ask"}
          </button>
        </form>
        {ask.isError && (
          <p className="m-0 text-sm" style={{ color: "var(--red)" }}>
            {String((ask.error as Error).message)}
          </p>
        )}
        {ask.data && (
          <div className="read-box grid gap-1.5">
            {ask.data.answer.split("\n").map((l) => (
              <p key={l} className="m-0 text-[15.5px] leading-relaxed">
                <Inline text={l} />
              </p>
            ))}
            {ask.data.drewOn.length > 0 && (
              <p className="font-mono m-0 text-[11px]" style={{ color: "var(--muted)" }}>
                drew on:{" "}
                {ask.data.drewOn.map((d, i) => (
                  <span key={d.id}>
                    {i > 0 && " · "}
                    <Link to={`/learn/lesson/${encodeURIComponent(d.id)}`} style={{ color: "var(--accent)" }}>
                      {plain(d.title)}
                    </Link>
                  </span>
                ))}
              </p>
            )}
          </div>
        )}
      </section>
      <nav className="flex gap-2">
        {at > 0 && (
          <Link
            to={`/learn/lesson/${encodeURIComponent(sibs[at - 1].id)}`}
            className="btn btn-quiet max-w-[48%] truncate"
          >
            ← {sibs[at - 1].title}
          </Link>
        )}
        {at >= 0 && at < sibs.length - 1 && (
          <Link
            to={`/learn/lesson/${encodeURIComponent(sibs[at + 1].id)}`}
            className="btn btn-quiet ml-auto max-w-[48%] truncate"
          >
            {sibs[at + 1].title} →
          </Link>
        )}
      </nav>
    </main>
  );
}
