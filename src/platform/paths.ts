// Where kestrel keeps things. Personal data lives in one folder outside the repo, and only the deployed app gets it:
// launchd's file sets KESTREL_DATA_DIR to the real folder. Every other run (development, tests, evals, the builder's
// checks) gets a made-up folder under the system's temp dir, seeded from scripts/dev-data, so nothing real is ever
// read, shown or written.
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
