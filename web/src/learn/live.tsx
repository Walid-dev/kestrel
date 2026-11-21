// Live: hold to talk. The sound goes to this computer's own ear, and the nearest prepared answer shows large.
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

type LessonBody = { say: string[] };
type Live = { heard: string; lesson: { id: string; title: string; body: LessonBody } | null; score: number };

const MIMES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

export function LearnLive() {
  const [holding, setHolding] = useState(false);
  const [micWhy, setMicWhy] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const ask = useMutation({
    mutationFn: async (sound: Blob) => {
      const res = await fetch("/api/learn/live", {
        method: "POST",
        headers: { "content-type": sound.type || "application/octet-stream" },
        body: sound,
      });
      const data = (await res.json()) as Live & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `${res.status}`);
      return data;
    },
  });

  useEffect(() => {
    const open = stream;
    return () => {
      for (const track of open.current?.getTracks() ?? []) track.stop();
    };
  }, []);

  const start = async () => {
    if (recorder.current) return;
    setMicWhy("");
    try {
      stream.current ??= await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMicWhy("the microphone was refused: allow it in the browser, then hold again");
      setHolding(false);
      return;
    }
    const mime = MIMES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const rec = new MediaRecorder(stream.current, mime ? { mimeType: mime } : undefined);
    const parts: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) parts.push(e.data);
    };
    rec.onstop = () => {
      recorder.current = null;
      const sound = new Blob(parts, { type: rec.mimeType });
      if (sound.size > 0) ask.mutate(sound);
    };
    recorder.current = rec;
    rec.start();
  };
  const stop = () => {
    setHolding(false);
    if (recorder.current && recorder.current.state === "recording") recorder.current.stop();
  };

  const got = ask.data;
  return (
    <main className="grid gap-3.5">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--muted)" }}>
        <Link to="/learn" style={{ color: "var(--accent)" }}>
          ← Learn
        </Link>
      </p>
      <h2 className="font-cond text-xl font-bold">Live</h2>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Hold the button while the question is spoken. The sound goes to this computer's own ear — nothing leaves it —
        and the nearest prepared answer shows large.
      </p>
      <button
        type="button"
        className="card grid select-none place-items-center"
        style={{
          touchAction: "none",
          minHeight: "9rem",
          cursor: "pointer",
          borderColor: holding ? "var(--pink)" : undefined,
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setHolding(true);
          void start();
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="font-cond text-2xl font-bold" style={{ color: holding ? "var(--pink)" : "var(--strong)" }}>
          {holding ? "Listening…" : ask.isPending ? "Hearing it…" : "Hold to listen"}
        </span>
      </button>
      {micWhy && (
        <p className="text-sm" style={{ color: "var(--red)" }}>
          {micWhy}
        </p>
      )}
      {ask.isError && (
        <p className="text-sm" style={{ color: "var(--red)" }}>
          {String((ask.error as Error).message)}
        </p>
      )}
      {got && !ask.isPending && (
        <section className="grid gap-3">
          <p className="font-mono text-xs" style={{ color: "var(--muted)" }}>
            heard: {got.heard}
          </p>
          {got.lesson ? (
            <div className="card grid gap-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--muted)" }}>
                {got.lesson.title}
              </p>
              {got.lesson.body.say.map((line) => (
                <p key={line} className="font-cond text-2xl font-bold leading-snug" style={{ color: "var(--strong)" }}>
                  {line}
                </p>
              ))}
              <Link
                to={`/learn/lesson/${got.lesson.id}`}
                className="font-mono text-xs"
                style={{ color: "var(--accent)" }}
              >
                the whole lesson →
              </Link>
            </div>
          ) : (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No prepared answer is close to that. The answer-packs carry what Live can find.
            </p>
          )}
        </section>
      )}
    </main>
  );
}
