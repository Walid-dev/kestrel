// The settings: one settings.json in the data folder, checked as it is read. Deploy writes my Tailscale login there;
// the dev seed carries made-up values. A missing or wrong file stops kestrel with a filled example, so the fix is
// never a guess.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { dataDir } from "./paths.ts";

// this computer's model door and its two models (docs/decisions.md, 2026-11-21); settings.json overrides any of it
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
  const parsed = Settings.safeParse(raw);
  if (!parsed.success)
    throw new Error(
      `settings.json is wrong: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}. An example:\n${example}`,
    );
  return parsed.data;
}
