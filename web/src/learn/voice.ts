// Listen: the page's lines read in order with the computer's own voice (/api/voice, made on this computer), the next
// line fetched while one plays; the device's voice takes over if the computer's is down. A line can ask for a pause
// first (a check's answer waits, so it can be answered in the head). Audio keeps playing on a locked phone.
import { useEffect, useRef, useState } from "react";

export type Spoken = { text: string; pause?: number };

export function useReader() {
  const [at, setAt] = useState(-1); // the line being read, -1 when quiet
  const [speed, setSpeed] = useState(1);
  const run = useRef(0); // each play gets a number; a stale one stops itself
  const audio = useRef<HTMLAudioElement | null>(null);
  const deviceVoice = useRef(false);

  const stop = () => {
    run.current++;
    audio.current?.pause();
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    setAt(-1);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: leaving the page stops the voice, once
  useEffect(() => stop, []);

  const url = (text: string, s: number) => `/api/voice?text=${encodeURIComponent(text.slice(0, 600))}&speed=${s}`;

  const play = (lines: Spoken[], from = 0, s = speed) => {
    stop();
    const me = ++run.current;
    if (!audio.current) audio.current = new Audio();
    const el = audio.current;
    const next = (i: number) => {
      if (me !== run.current) return;
      if (i >= lines.length) return stop();
      const line = lines[i];
      const go = () => {
        if (me !== run.current) return;
        setAt(i);
        if (deviceVoice.current || !line.text.trim()) return sayWithDevice(line.text, i);
        el.src = url(line.text, s);
        el.onended = () => next(i + 1);
        el.onerror = () => {
          deviceVoice.current = true; // the computer's voice is down: this device reads the rest
          sayWithDevice(line.text, i);
        };
        void el.play().catch(() => {
          deviceVoice.current = true;
          sayWithDevice(line.text, i);
        });
        // warm the next line while this one plays
        if (i + 1 < lines.length && !deviceVoice.current) void fetch(url(lines[i + 1].text, s)).catch(() => {});
      };
      if (line.pause) {
        setAt(i);
        setTimeout(go, line.pause);
      } else go();
    };
    const sayWithDevice = (text: string, i: number) => {
      if (!("speechSynthesis" in window)) return next(i + 1);
      const u = new SpeechSynthesisUtterance(text);
      u.rate = s;
      u.onend = () => next(i + 1);
      u.onerror = () => stop();
      speechSynthesis.speak(u);
    };
    next(from);
  };

  return { at, speed, setSpeed, play, stop, reading: at >= 0 };
}
