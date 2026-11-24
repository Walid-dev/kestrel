// One lesson per page, built to learn fast. A guide topic reads like the guides: its part and topic, the title, the
// lede, then the blocks — entries, examples, diagrams, checks. A lesson to say follows the old Learn's method: review
// from memory first when it is due, then "Say it" (tap a line to hear it, Listen, Slow, Record me), what it means,
// the example and the words, and an honest grade at the end. Listen reads the whole page in the computer's voice, and
// its bar stays on top while the page scrolls.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { Ask } from "../ask.tsx";
import { Card } from "../ui/card.tsx";
import { cx } from "../ui/cx.ts";
import { Page } from "../ui/page.tsx";
import type { Tone } from "../ui/pills.tsx";
import { block, heard, lines, type Say } from "./blocks.tsx";
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
// a lesson's four states, each with its name and its one colour, the same on every chip and in the progress bar:
// the one to act on today stands out, a new one stays quiet
// a pack's name as a title: stored in lower case, shown with its first letter up, the same on the pack and its lessons
export const titled = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export const STATE: Record<string, { label: string; tone: Tone }> = {
  due: { label: "Review today", tone: "cyan" },
  new: { label: "New", tone: "muted" },
  learning: { label: "Learning", tone: "purple" },
  known: { label: "Known", tone: "green" },
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
      {/* recording, it stays pressed in red */}
      <button type="button" className={cx("btn", on && "tone-red")} aria-pressed={on} onClick={toggle}>
        {on ? "■ Stop recording" : "Record me"}
      </button>
      {url && !on && (
        // biome-ignore lint/a11y/useMediaCaption: my own voice, played back to compare
        <audio src={url} controls className="h-8 max-w-[220px]" />
      )}
      {why && <span className="text-small text-red">{why}</span>}
    </>
  );
}

// a question to answer before looking: the answer folded under a button, the same control everywhere. A function
// called while the page is built, not a component, so its lines join Listen's list in the page's order
function check(k: string, q: string, a: string, say: Say, review = false): React.ReactNode {
  const qLines = lines([q], say);
  const aLines = lines([a], say, 3500);
  const open = say.isOpen(k);
  return (
    <div key={k} className={review ? "grid gap-2" : "grid gap-1.5 border-t border-dashed border-line pt-3"}>
      {!review && <span className="eyebrow tone-accent">Check yourself</span>}
      <div className={review ? "font-semibold text-strong" : undefined}>{qLines}</div>
      <div className="example" hidden={!open}>
        {aLines}
      </div>
      {!open && (
        <button type="button" className="btn justify-self-start" onClick={() => say.open(k)}>
          Show the answer
        </button>
      )}
    </div>
  );
}

export function LearnLesson() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const reader = useReader();
  const [opened, setOpened] = useState<Set<string>>(new Set());
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
  if (lesson.isError)
    return (
      <Page width="reading" back={{ to: "/learn", label: "Learn" }} title="Lesson">
        <p className="m-0 text-detail text-red">{String((lesson.error as Error).message)}</p>
      </Page>
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
  const back =
    L.area === "interview"
      ? { to: "/interview", label: "Interview prep" }
      : { to: `/learn?pack=${encodeURIComponent(L.pack)}`, label: titled(L.packName) || "Learn" };
  const sibs = siblings.data?.lessons ?? [];
  const at = sibs.findIndex((l) => l.id === id);
  const state = STATE[L.state] ?? STATE.new;

  // the page's parts, built in reading order so Listen follows the page
  const title = heard(L.title, say);
  const lede = b.short ? heard(b.short, say) : null;
  let body: React.ReactNode;
  if (guide) {
    body = <div className="grid gap-4 text-read">{b.blocks.map((x, k) => block(x, say, k))}</div>;
  } else {
    const due = (L.state === "due" || L.state === "learning") && b.check.length > 0;
    const review = due ? (
      <Card tone="cyan">
        <h2 className="font-cond m-0 text-head font-bold">{heard("Review first: answer from memory", say)}</h2>
        {b.check.map((c) => check(`review:${c.q}`, c.q, c.a, say, true))}
      </Card>
    ) : null;
    const sayHead = b.say.length ? heard("Say it", say) : null;
    let sayFrom = -1;
    let sayTo = -1;
    const sayRows = b.say.map((s) => {
      const i = say.add(s);
      if (sayFrom < 0) sayFrom = i;
      sayTo = i;
      return (
        <button
          key={s}
          type="button"
          className="say-row"
          data-reading={reader.at === i ? "" : undefined}
          onClick={() => reader.play(list.current, i, i)}
        >
          <span className="say-play" aria-hidden="true">
            ▶
          </span>
          <span>{s}</span>
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
        <p key={w.w} className={cx("m-0", reader.at === i && "reading")}>
          <span className="term">{w.w}</span>
          <span className="ml-3 text-muted">{w.m}</span>
        </p>
      );
    });
    const checks = !due ? b.check.map((c) => check(`check:${c.q}`, c.q, c.a, say)) : null;
    body = (
      <>
        {review}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {b.say.length > 0 && (
            <Card>
              <h2 className="font-cond m-0 text-head font-bold">{sayHead}</h2>
              <p className="m-0 text-detail text-muted">
                Tap a sentence to hear it. Listen, then say it with the voice.
              </p>
              <div className="grid gap-2">{sayRows}</div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => (reader.reading ? reader.stop() : reader.play(list.current, sayFrom, sayTo))}
                >
                  {reader.reading ? "■ Stop" : "▶ Listen"}
                </button>
                <button
                  type="button"
                  className="btn"
                  aria-pressed={reader.speed < 1}
                  onClick={() => reader.setSpeed((s) => (s < 1 ? 1 : 0.8))}
                >
                  Slow
                </button>
                <Recorder />
              </div>
            </Card>
          )}
          <section className="grid content-start gap-4 text-read">
            {b.explain.length > 0 && (
              <div className="grid gap-2">
                <h2 className="font-cond m-0 text-head font-bold">{meansHead}</h2>
                {means}
              </div>
            )}
            {example && (
              <div className="read-box grid gap-1.5">
                <span className="eyebrow tone-accent">{exHead}</span>
                {example}
              </div>
            )}
            {b.words.length > 0 && (
              <div className="grid gap-2">
                <h2 className="font-cond m-0 text-head font-bold">{wordsHead}</h2>
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
    <Page
      width={guide ? "reading" : "wide"}
      back={back}
      sticky
      actions={
        <>
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
              onClick={() => reader.setSpeed((s) => (s < 1 ? 1 : 0.8))}
            >
              Slow
            </button>
          )}
        </>
      }
      eyebrow={[b.part, b.eyebrow].filter(Boolean).join(" · ") || undefined}
      title={title}
      // the state sits under the title, not in the bar: on a phone the bar keeps its room for the back link's name
      line={<span className={`chip chip-caps tone-${state.tone}`}>{state.label}</span>}
    >
      {lede && <p className="m-0 text-read text-ink">{lede}</p>}
      {body}
      {(b.check.length > 0 || guide) && (
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-cond text-head font-bold text-strong">
              {guide ? "Done with this topic?" : "How did it go?"}
            </span>
            <span className="text-detail text-muted">
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
              <span className="w-full text-detail text-red">{String((grade.error as Error).message)}</span>
            )}
          </div>
        </Card>
      )}
      {/* Ask: a conversation about this lesson with the computer's model, kept with the lesson */}
      <Ask
        app="learn"
        refId={L.id}
        placeholder="Ask about this lesson"
        starters={[
          "Explain it more simply",
          "Give me another example",
          "Show me how this looks in code",
          "What do people often get wrong here?",
        ]}
      />
      <nav className="flex gap-2" aria-label="The pack's lessons">
        {at > 0 && (
          <Link to={`/learn/lesson/${encodeURIComponent(sibs[at - 1].id)}`} className="btn btn-quiet max-w-[48%]">
            <span className="block min-w-0 truncate">← {sibs[at - 1].title}</span>
          </Link>
        )}
        {at >= 0 && at < sibs.length - 1 && (
          <Link
            to={`/learn/lesson/${encodeURIComponent(sibs[at + 1].id)}`}
            className="btn btn-quiet ml-auto max-w-[48%]"
          >
            <span className="block min-w-0 truncate">{sibs[at + 1].title} →</span>
          </Link>
        )}
      </nav>
    </Page>
  );
}
