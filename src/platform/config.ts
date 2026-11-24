// The settings: one settings.json in the data folder, checked as it is read. Deploy writes my Tailscale login there;
// the dev seed carries made-up values. A missing or wrong file stops kestrel with a filled example, so the fix is
// never a guess.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { dataDir, isDeployed } from "./paths.ts";

// this computer's model door and its two models (docs/decisions.md, 2026-11-21); settings.json overrides any of it.
// Outside the deployed app the doors are dead unless settings.json names one (DEAD_DOOR, below)
export const MODEL_DEFAULTS = {
  url: "http://127.0.0.1:8000/v1",
  careful: "Qwen3.8-27B-oQ4e-mtp",
  fast: "Ornith-1.5-35B-A3B-MLX-4bit",
  contextChars: 160_000,
};

// a door kestrel calls must stay on this computer: documents, notes and sound never leave it (review R2-1)
const onThisComputer = (u: string): boolean => {
  try {
    const { hostname, protocol } = new URL(u);
    return (
      (protocol === "http:" || protocol === "https:") && ["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname)
    );
  } catch {
    return false;
  }
};

// the morning news (src/domain/news/): the time its brief is written, how often the feeds are read in between (some
// hold only a few hours), and the hour after which a morning missed (the computer asleep) waits for the next one
export const NewsSettings = z.object({
  enabled: z.boolean().default(true),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "a time like 06:30")
    .default("06:30"),
  collectEveryMinutes: z.number().int().min(30).max(1440).default(120),
  latestHour: z.number().int().min(1).max(24).default(12),
});
export type NewsSettings = z.infer<typeof NewsSettings>;

export const Settings = z.object({
  // who may reach kestrel: my Tailscale login, which Serve stamps on every request (step 7 enforces it)
  tailscaleLogin: z.string().min(1),
  // the folders Notes may open (step 8 reads it)
  notes: z.object({ folders: z.array(z.string()) }).default({ folders: [] }),
  // the computer's own models (oMLX's OpenAI door); only these two may be called, and the guard below the context
  models: z
    .object({
      // the door must stay on this computer: a remote URL would send documents and notes off it (review R2-1).
      // Remote models, if ever wanted, are a separate decision with its own explicit opt-in.
      url: z.string().default(MODEL_DEFAULTS.url).refine(onThisComputer, {
        message: "models.url must stay on this computer (http://127.0.0.1:…): kestrel never sends documents away",
      }),
      careful: z.string().default(MODEL_DEFAULTS.careful),
      fast: z.string().default(MODEL_DEFAULTS.fast),
      contextChars: z.number().int().positive().default(MODEL_DEFAULTS.contextChars),
    })
    .default(MODEL_DEFAULTS),
  // the computer's own voice and ears (a small Kokoro + Parakeet server): Listen speaks with it, the interview
  // helper hears with it; down, the pages fall back to the device's voice
  voice: z
    .object({
      url: z.string().default("http://127.0.0.1:8798").refine(onThisComputer, {
        message: "voice.url must stay on this computer (http://127.0.0.1:…): sound never leaves it",
      }),
      name: z.string().default("af_heart"),
    })
    .default({ url: "http://127.0.0.1:8798", name: "af_heart" }),
  // oMLX's home, where its hourly usage table lives: the Cost page reads it, read only (empty: Cost says so)
  omlxHome: z.string().default(""),
  // the other apps Home opens: my chats (the DeepSeek Harness). desktop: opened in its own tab on a computer, where
  // that address is signed in; phone: its own window on a phone (dsh's door); phoneFrame: shown inside kestrel on a
  // phone
  links: z
    .array(
      z.object({
        name: z.string().min(1),
        what: z.string().default(""),
        desktop: z.string().url(),
        phone: z.string().url().optional(),
        phoneFrame: z.string().url().optional(),
      }),
    )
    .default([]),
  // the cover letter lab: the applications' folder (voice.md, stories.md, profile.md), the apply skill whose letter
  // step it follows, and the applications' own two tools (the PDF's layout, the check). Empty: the lab says what's
  // missing
  apply: z
    .object({
      folder: z.string().default(""),
      skill: z.string().default(""),
      pdf: z.string().default(""),
      check: z.string().default(""),
    })
    .default({ folder: "", skill: "", pdf: "", check: "" }),
  // pings to my phone through ntfy, the old setup's channel (my yes, 2026-11-23): its address, each channel's topic
  // as the file that holds it (read at send time, never kept or printed: anyone who knows a topic can read it), and
  // kestrel's own address on the phone, which a tap opens. Without it, nothing is sent
  alerts: z
    .object({
      url: z.string().url().default("https://ntfy.sh"),
      topics: z.object({ deals: z.string().optional(), jobs: z.string().optional() }).default({}),
      page: z.string().default(""),
    })
    .optional(),
  // the old setup's Live (its /api/live, on this computer): the agent's chats and their steps, which Live shows until
  // kestrel reads the chats itself. Empty: Live shows kestrel's own work only
  oldLive: z.string().optional(),
  // the morning news (NewsSettings, above; newsOf reads it with its defaults)
  news: NewsSettings.optional(),
  // who I am, for a deep check's read of a job: level, years, skills, a summary (personal: the data folder only)
  profile: z
    .object({
      level: z.string().optional(),
      years: z.number().optional(),
      skills: z.array(z.string()).optional(),
      summary: z.string().optional(),
    })
    .default({}),
});
export type Settings = z.infer<typeof Settings>;

export const newsOf = (settings: Settings): NewsSettings => settings.news ?? NewsSettings.parse({});

// The evals' --live mode and the model probe ask the real door on purpose, with made-up text. They never take it from
// the made-up data folder: its doors are dead on purpose, so a development run fails fast instead of asking my models
// (scripts/dev-data/settings.json). The real door is the default above; --url or KESTREL_MODEL_URL picks another,
// which must stay on this computer too.
export function liveModels(given?: string): Settings["models"] {
  const url = given?.trim() || process.env.KESTREL_MODEL_URL?.trim() || MODEL_DEFAULTS.url;
  const parsed = Settings.shape.models.safeParse({ url });
  if (!parsed.success)
    throw new Error(`the live door is wrong: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  return parsed.data;
}

// Any run but the deployed app (development, tests, a builder's screen check) gets dead model and voice doors unless
// its settings.json names a door itself: a made-up folder seeded before the seed had them (dataDir copies the seed
// only once) fails fast too, instead of asking my models. Port 9 answers nothing, so a call is refused at once. The
// morning news is off there too unless settings.json names it, so a development run never reads the feeds by itself.
export const DEAD_DOOR = "http://127.0.0.1:9";
function deadDoors(raw: unknown): unknown {
  if (!isObject(raw)) return raw;
  const door = (part: unknown, url: string) =>
    part === undefined ? { url } : isObject(part) ? { url, ...part } : part;
  return {
    ...raw,
    models: door(raw.models, `${DEAD_DOOR}/v1`),
    voice: door(raw.voice, DEAD_DOOR),
    news: raw.news === undefined ? { enabled: false } : raw.news,
  };
}
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function loadSettings(dir: string = dataDir()): Settings {
  const file = join(dir, "settings.json");
  const example = JSON.stringify(
    { tailscaleLogin: ["me", "example.com"].join("@"), notes: { folders: ["~/some-folder"] } },
    null,
    2,
  );
  let raw: unknown;
  // the message names settings.json, never its absolute path: launchd keeps stderr in a log, and the log must not
  // carry a home path (review R2-9)
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    const why = (e as NodeJS.ErrnoException).code ?? (e instanceof SyntaxError ? "not JSON" : "unreadable");
    throw new Error(`kestrel needs its settings: settings.json in its data folder (${why}). An example:\n${example}`);
  }
  const parsed = Settings.safeParse(isDeployed() ? raw : deadDoors(raw));
  if (!parsed.success)
    throw new Error(
      `settings.json is wrong: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}. An example:\n${example}`,
    );
  return parsed.data;
}
