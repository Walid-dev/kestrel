// Where kestrel keeps things. Personal data lives in one folder outside the repo, and only the deployed app gets it:
// launchd's file sets KESTREL_DATA_DIR to the real folder. Every other run (development, tests, evals, the builder's
// checks) gets a made-up folder under the system's temp dir, seeded from scripts/dev-data, so nothing real is ever
// read, shown or written. Its model and voice doors are dead (port 9, where nothing answers), so a development run
// never asks my models: it fails fast instead. A folder seeded before that gets the dead doors from loadSettings
// (DEAD_DOOR); the evals' --live asks the real door on purpose (liveModels).
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const isDeployed = (): boolean => Boolean(process.env.KESTREL_DATA_DIR?.trim());

export function dataDir(): string {
  const real = process.env.KESTREL_DATA_DIR?.trim();
  if (real) return real;
  const dev = join(tmpdir(), "kestrel-dev-data");
  if (!existsSync(join(dev, "settings.json"))) {
    mkdirSync(dev, { recursive: true });
    const seed = new URL("../../scripts/dev-data/", import.meta.url).pathname;
    if (existsSync(seed)) cpSync(seed, dev, { recursive: true });
  }
  return dev;
}

// About me: what the agents should know about me (Research reads it), a file of its own that I write in Notes
export const aboutFile = (): string => join(dataDir(), "research", "about-me.md");
