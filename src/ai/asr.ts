// The ears: a short recording (a WAV, or 16-bit mono PCM at 16 kHz) to the computer's own voice server, its words
// back. The server is loopback by the settings rule; nothing leaves the computer and nothing is kept.
import type { Settings } from "../platform/config.ts";

export type Heard = { outcome: "ok"; text: string } | { outcome: "down" | "refusal"; why: string };

// what a transcription model is called on the model door: never offered as a chat model
export const EAR = /parakeet|whisper|asr|speech/i;

export async function hear(settings: Settings, sound: ArrayBuffer, kind: string): Promise<Heard> {
  try {
    const res = await fetch(`${settings.voice.url}/hear`, {
      method: "POST",
      headers: { "content-type": kind.includes("wav") ? "audio/wav" : "audio/pcm" },
      body: sound,
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return { outcome: "refusal", why: `the ears answered ${res.status}` };
    const data = (await res.json()) as { text?: string };
    const text = String(data.text ?? "").trim();
    if (!text) return { outcome: "refusal", why: "the ears heard nothing they could write down" };
    return { outcome: "ok", text };
  } catch {
    return { outcome: "down", why: "the computer's voice server isn't answering" };
  }
}
