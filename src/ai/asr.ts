// The ear: sound to the local door's transcription endpoint, text back. The caller names the ear model (the
// server finds it on the door with EAR). Nothing leaves the computer — the door is loopback.
import type { Settings } from "../platform/config.ts";

export type Heard = { outcome: "ok"; text: string } | { outcome: "down" | "refusal"; why: string };

// what an ear is called, wherever the door looks for one
export const EAR = /parakeet|whisper|asr|speech/i;

export async function transcribe(settings: Settings, sound: ArrayBuffer, kind: string, ear: string): Promise<Heard> {
  const form = new FormData();
  const name = ["mp4", "ogg", "wav"].map((k) => (kind.includes(k) ? `sound.${k}` : "")).find(Boolean) ?? "sound.webm";
  form.set("file", new Blob([sound], { type: kind }), name);
  form.set("model", ear);
  try {
    const res = await fetch(`${settings.models.url}/audio/transcriptions`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return { outcome: "refusal", why: `the ear answered ${res.status}` };
    const data = (await res.json()) as { text?: string };
    const text = String(data.text ?? "").trim();
    if (!text) return { outcome: "refusal", why: "the ear heard nothing it could write down" };
    return { outcome: "ok", text };
  } catch {
    return { outcome: "down", why: "the ear did not answer in time" };
  }
}
