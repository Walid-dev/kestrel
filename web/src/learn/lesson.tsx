// One lesson per page: the say lines first and large, Listen reading them with the line lit, the explanation, the
// example, the words, the checks folded — and Ask at the bottom, answered by the picked model.
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";

type Lesson = {
  id: string;
  pack: string;
  title: string;
  body: {
    say: string[];
    explain: string[];
    example: string;
    words: { w: string; m: string }[];
    check: { q: string; a: string }[];
  };
};

export function LearnLesson() {
  const { id = "" } = useParams();
  const [spoken, setSpoken] = useState(-1); // the line Listen is saying
  const [open, setOpen] = useState<number | null>(null); // the check whose answer shows
  const [question, setQuestion] = useState("");
  const speaking = useRef(false);

  const lesson = useQuery({
    queryKey: ["lesson", id],
    queryFn: async () => {
      const res = await fetch(`/api/learn/lessons/${id}`);
      if (!res.ok) throw new Error(`lesson: ${res.status}`);
      return (await res.json()) as Lesson;
    },
  });
  const siblings = useQuery({
    queryKey: ["pack", lesson.data?.pack ?? ""],
    queryFn: async () =>
      (await (await fetch(`/api/learn/packs/${lesson.data?.pack}`)).json()) as {
        lessons: { id: string; title: string }[];
      },
    enabled: Boolean(lesson.data),
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

  // Listen: the device's own voice, line by line, the said line lit; leaving the page stops it
  const stop = () => {
    speaking.current = false;
    speechSynthesis.cancel();
    setSpoken(-1);
  };
  useEffect(
    () => () => {
      // leaving the page stops the voice
      speaking.current = false;
      speechSynthesis.cancel();
    },
    [],
  );
  const listen = (lines: string[], from = 0) => {
    stop();
    speaking.current = true;
    const sayLine = (i: number) => {
      if (!speaking.current || i >= lines.length) return stop();
      setSpoken(i);
      const u = new SpeechSynthesisUtterance(lines[i]);
      u.onend = () => sayLine(i + 1);
      u.onerror = () => stop();
      speechSynthesis.speak(u);
    };
    sayLine(from);
  };

  if (!lesson.data) return null;
  const b = lesson.data.body;
  const list = siblings.data?.lessons ?? [];
  const at = list.findIndex((l) => l.id === id);
  return (
    <main className="grid max-w-2xl gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to={`/learn/pack/${lesson.data.pack}`}
          className="font-mono text-[11px] uppercase tracking-[0.18em]"
          style={{ color: "var(--accent)" }}
        >
          ← the pack
        </Link>
        <button type="button" className="btn ml-auto" onClick={() => (spoken >= 0 ? stop() : listen(b.say))}>
          {spoken >= 0 ? "Stop" : "Listen"}
        </button>
      </div>
      <h2 className="font-cond text-2xl font-bold">{lesson.data.title}</h2>
      <section className="grid gap-2">
        {b.say.map((line, i) => (
          <button
            key={line}
            type="button"
            className="cursor-pointer rounded-xl px-3 py-1.5 text-left text-[17px] leading-relaxed"
            style={i === spoken ? { background: "var(--accent-soft)" } : undefined}
            onClick={() => listen(b.say, i)}
            title="Read from this line"
          >
            {line}
          </button>
        ))}
      </section>
      {b.explain.length > 0 && (
        <section className="card grid gap-1.5 text-[15px] leading-relaxed">
          {b.explain.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </section>
      )}
      {b.example && (
        <p className="rounded-xl border px-4 py-3 text-sm italic" style={{ borderColor: "var(--line)" }}>
          {b.example}
        </p>
      )}
      {b.words.length > 0 && (
        <section className="card grid gap-1.5">
          {b.words.map((w) => (
            <p key={w.w} className="text-sm">
              <span className="font-cond font-bold">{w.w}</span> <span style={{ color: "var(--muted)" }}>— {w.m}</span>
            </p>
          ))}
        </section>
      )}
      {b.check.map((c, i) => (
        <section key={c.q} className="card grid gap-2">
          <p className="font-cond font-bold">Check yourself: {c.q}</p>
          {open === i ? (
            <p className="text-sm">{c.a}</p>
          ) : (
            <button type="button" className="btn btn-quiet justify-self-start" onClick={() => setOpen(i)}>
              Show the answer
            </button>
          )}
        </section>
      ))}
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
          <p className="rounded-xl px-3 py-2 text-sm" style={{ background: "var(--warn-soft)" }}>
            {ask.error.message}
          </p>
        )}
        {ask.data && (
          <div className="card grid gap-2">
            {ask.data.answer.split("\n").map((line) => (
              <p key={line} className="text-[15px] leading-relaxed">
                {line}
              </p>
            ))}
            {ask.data.drewOn.length > 0 && (
              <p className="font-mono text-[11px]" style={{ color: "var(--muted)" }}>
                drew on:{" "}
                {ask.data.drewOn.map((d, i) => (
                  <span key={d.id}>
                    {i > 0 && " · "}
                    <Link to={`/learn/lesson/${d.id}`} style={{ color: "var(--accent)" }}>
                      {d.title}
                    </Link>
                  </span>
                ))}
              </p>
            )}
          </div>
        )}
      </section>
      <div className="flex gap-2">
        {at > 0 && (
          <Link to={`/learn/lesson/${list[at - 1].id}`} className="btn btn-quiet">
            ← {list[at - 1].title}
          </Link>
        )}
        {at >= 0 && at < list.length - 1 && (
          <Link to={`/learn/lesson/${list[at + 1].id}`} className="btn btn-quiet ml-auto">
            {list[at + 1].title} →
          </Link>
        )}
      </div>
    </main>
  );
}
