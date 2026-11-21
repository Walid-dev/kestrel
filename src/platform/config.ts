// The settings: one settings.json in the data folder, checked as it is read. Deploy writes my Tailscale login there;
// the dev seed carries made-up values. A missing or wrong file stops kestrel with a filled example, so the fix is
// never a guess.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { dataDir } from "./paths.ts";

export const Settings = z.object({
  // who may reach kestrel: my Tailscale login, which Serve stamps on every request (step 7 enforces it)
  tailscaleLogin: z.string().min(1),
  // the folders Notes may open (step 8 reads it)
  notes: z.object({ folders: z.array(z.string()) }).default({ folders: [] }),
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
