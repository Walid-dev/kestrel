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

export const Settings = z.object({
  // who may reach kestrel: my Tailscale login, which Serve stamps on every request (step 7 enforces it)
  tailscaleLogin: z.string().min(1),
  // the folders Notes may open (step 8 reads it)
  notes: z.object({ folders: z.array(z.string()) }).default({ folders: [] }),
  // the computer's own models (oMLX's OpenAI door); only these two may be called, and the guard below the context
  models: z
    .object({
      url: z.string().default(MODEL_DEFAULTS.url),
      careful: z.string().default(MODEL_DEFAULTS.careful),
      fast: z.string().default(MODEL_DEFAULTS.fast),
      contextChars: z.number().int().positive().default(MODEL_DEFAULTS.contextChars),
    })
    .default(MODEL_DEFAULTS),
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
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(
      `kestrel needs its settings at ${file} (${e instanceof Error ? e.message : e}). An example:\n${example}`,
    );
  }
  const parsed = Settings.safeParse(raw);
  if (!parsed.success)
    throw new Error(
      `${file} is wrong: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}. An example:\n${example}`,
    );
  return parsed.data;
}
