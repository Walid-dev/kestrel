// The interview helper: hold while the question is asked. The phone records 16 kHz speech, the computer's own ears
// write it down, and the nearest prepared answer from Interview prep shows large — the lines to say first. Nothing
// leaves the computer, and nothing is kept.
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

type Heard = {
  heard: string;
  score: number;
  lesson: { id: string; title: string; body: { say: string[]; example: string } } | null;
};

const RATE = 16_000;
const MAX_SECONDS = 55; // the ears take 2 MB: a minute of 16 kHz speech, with room to spare

// a mono Float32 recording at the context's rate → a 16 kHz 16-bit WAV
function toWav(chunks: Float32Array[], from: number): Blob {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const all = new Float32Array(total);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.length;
  }
  const step = from / RATE;
  const n = Math.floor(total / step);
  const pcm = new DataView(new ArrayBuffer(44 + n * 2));
  const put = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) pcm.setUint8(o + i, s.charCodeAt(i));
  };
  put(0, "RIFF");
  pcm.setUint32(4, 36 + n * 2, true);
  put(8, "WAVE");
  put(12, "fmt ");
  pcm.setUint32(16, 16, true);
  pcm.setUint16(20, 1, true);
  pcm.setUint16(22, 1, true);
  pcm.setUint32(24, RATE, true);
  pcm.setUint32(28, RATE * 2, true);
  pcm.setUint16(32, 2, true);
  pcm.setUint16(34, 16, true);
  put(36, "data");
  pcm.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    // average the samples this one stands for, then clip to 16 bits
    const a = Math.floor(i * step);
    const b = Math.min(total, Math.floor((i + 1) * step));
    let sum = 0;
    for (let j = a; j < b; j++) sum += all[j];
    const v = Math.max(-1, Math.min(1, sum / Math.max(1, b - a)));
    pcm.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return new Blob([pcm.buffer], { type: "audio/wav" });
}

type Rec = { ctx: AudioContext; stream: MediaStream; node: ScriptProcessorNode; chunks: Float32Array[]; timer: number };

export function InterviewHelper() {
  const [holding, setHolding] = useState(false);
  const [why, setWhy] = useState("");
  const held = useRef(false);
  const rec = useRef<Rec | null>(null);
  const ask = useMutation({
    mutationFn: async (wav: Blob) => {
      const res = await fetch("/api/interview/hear", {
        method: "POST",
        headers: { "content-type": "audio/wav" },
        body: wav,
      });
      const data = (await res.json()) as Heard & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `${res.status}`);
      return data;
    },
  });
  const release = (): Rec | null => {
    const r = rec.current;
    rec.current = null;
    if (!r) return null;
    window.clearTimeout(r.timer);
    r.node.disconnect();
    for (const t of r.stream.getTracks()) t.stop();
    void r.ctx.close();
    return r;
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: leaving the page frees the microphone once
  useEffect(
    () => () => {
      release();
    },
    [],
  );

  const stop = () => {
    held.current = false;
    setHolding(false);
    const r = release();
    if (!r || r.chunks.length === 0) return;
    ask.mutate(toWav(r.chunks, r.ctx.sampleRate));
  };
  const start = async () => {
    setWhy("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setWhy("this browser can't record");
      return setHolding(false);
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setWhy("the microphone was refused: allow it in the browser, then hold again");
      return setHolding(false);
    }
    if (!held.current) {
      // the finger lifted while the microphone was being granted: record nothing
      for (const t of stream.getTracks()) t.stop();
      return;
    }
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    const chunks: Float32Array[] = [];
    node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    source.connect(node);
    node.connect(ctx.destination);
    rec.current = { ctx, stream, node, chunks, timer: window.setTimeout(stop, MAX_SECONDS * 1000) };
  };

  const got = ask.data;
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-4">
      <Link to="/interview" className="text-sm font-medium" style={{ color: "var(--accent)" }}>
        ← Interview prep
      </Link>
      <h2 className="font-cond m-0 text-[28px] font-bold">The interview helper</h2>
      <p className="m-0 text-sm" style={{ color: "var(--muted)" }}>
        Hold the button while the question is asked. The computer's own ears write it down — nothing leaves it — and the
        nearest prepared answer from Interview prep shows large, the lines to say first.
      </p>
      <button
        type="button"
        className="card grid select-none place-items-center"
        style={{
          touchAction: "none",
          minHeight: "9rem",
          cursor: "pointer",
          borderColor: holding ? "var(--pink)" : undefined,
          background: holding ? "var(--pink-soft)" : undefined,
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          held.current = true;
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
      {(why || ask.isError) && (
        <p className="m-0 text-sm" style={{ color: "var(--red)" }}>
          {why || String((ask.error as Error).message)}
        </p>
      )}
      {got && !ask.isPending && (
        <section className="grid gap-3">
          <p className="font-mono m-0 text-xs" style={{ color: "var(--muted)" }}>
            heard: {got.heard}
          </p>
          {got.lesson ? (
            <div
              className="card grid gap-3"
              style={{ borderColor: "color-mix(in srgb, var(--accent) 40%, var(--line))" }}
            >
              <span className="eyebrow" style={{ color: "var(--accent)" }}>
                {got.lesson.title}
              </span>
              {got.lesson.body.say.map((line) => (
                <p
                  key={line}
                  className="font-cond m-0 text-[26px] font-bold leading-snug"
                  style={{ color: "var(--strong)" }}
                >
                  {line}
                </p>
              ))}
              {got.lesson.body.example && (
                <p className="m-0 text-sm" style={{ color: "var(--muted)" }}>
                  {got.lesson.body.example}
                </p>
              )}
              <Link
                to={`/learn/lesson/${encodeURIComponent(got.lesson.id)}`}
                className="font-mono text-xs"
                style={{ color: "var(--accent)" }}
              >
                the whole answer →
              </Link>
            </div>
          ) : (
            <p className="m-0 text-sm" style={{ color: "var(--muted)" }}>
              No prepared answer is close to that. The packs in Interview prep carry what the helper can find.
            </p>
          )}
        </section>
      )}
    </main>
  );
}
