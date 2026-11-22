// The computer's voice for the pages that read aloud: GET /api/voice?text=…&speed=1 answers a WAV, made once by the
// voice server and kept in the data folder (the newest 300 MB), so a line heard twice costs nothing. Down: 503, and
// the page falls back to the device's own voice.
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Hono } from "hono";
import type { Settings } from "../platform/config.ts";
import { dataDir } from "../platform/paths.ts";

const MAX_TEXT = 600;
const KEEP_BYTES = 300 * 1024 * 1024;

function trim(dir: string) {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".wav"))
    .map((f) => ({ f, ...statSync(join(dir, f)) }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  let total = 0;
  for (const x of files) {
    total += x.size;
    if (total > KEEP_BYTES) rmSync(join(dir, x.f), { force: true });
  }
}

export function mountVoice(app: Hono, settings: Settings) {
  app.get("/api/voice", async (c) => {
    const text = (c.req.query("text") ?? "").trim();
    const speed = Number(c.req.query("speed") ?? "1");
    if (!text || text.length > MAX_TEXT || !(speed >= 0.5 && speed <= 1.5))
      return c.json({ error: `send text (1 to ${MAX_TEXT} characters) and a speed from 0.5 to 1.5` }, 400);
    const dir = join(dataDir(), "voice");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${createHash("sha1").update(`${settings.voice.name}|${speed}|${text}`).digest("hex")}.wav`);
    let wav: Buffer;
    if (existsSync(file)) {
      const now = new Date();
      utimesSync(file, now, now); // heard again: the newest
      wav = readFileSync(file);
    } else {
      try {
        const res = await fetch(`${settings.voice.url}/speak`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, voice: settings.voice.name, speed }),
          signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) return c.json({ error: `the voice answered ${res.status}` }, 503);
        wav = Buffer.from(await res.arrayBuffer());
      } catch {
        return c.json({ error: "the computer's voice isn't answering: the device's voice reads instead" }, 503);
      }
      writeFileSync(`${file}.tmp`, wav);
      renameSync(`${file}.tmp`, file);
      trim(dir);
    }
    return new Response(new Uint8Array(wav), {
      headers: { "content-type": "audio/wav", "cache-control": "private, max-age=86400" },
    });
  });
}
