// The model each use runs on: the Models screen's pick in the database first, the settings file as the fallback.
// One place answers every caller, so switching a use is one row.
import type { DatabaseSync } from "node:sqlite";
import type { Settings } from "../platform/config.ts";

export type Use = "notes-careful" | "notes-fast";
export const USES: { use: Use; what: string }[] = [
  { use: "notes-careful", what: "Notes' careful asks: changes written with time to think" },
  { use: "notes-fast", what: "Notes' fast asks: changes in seconds" },
];

export function modelFor(db: DatabaseSync, settings: Settings, use: Use): string {
  const row = db.prepare("SELECT model FROM model_settings WHERE use = ?").get(use) as { model: string } | undefined;
  if (row?.model) return row.model;
  return use === "notes-careful" ? settings.models.careful : settings.models.fast;
}

export function setModelFor(db: DatabaseSync, use: Use, model: string): void {
  db.prepare(
    `INSERT INTO model_settings (use, model, set_at) VALUES (?, ?, ?)
     ON CONFLICT (use) DO UPDATE SET model = excluded.model, set_at = excluded.set_at`,
  ).run(use, model, new Date().toISOString());
}

export function listUses(
  db: DatabaseSync,
  settings: Settings,
): { use: Use; what: string; model: string; fallback: string }[] {
  return USES.map(({ use, what }) => ({
    use,
    what,
    model: modelFor(db, settings, use),
    fallback: use === "notes-careful" ? settings.models.careful : settings.models.fast,
  }));
}

// the models the door offers right now, for the screen's choices; [] when the door is down or slow
export async function doorModels(settings: Settings): Promise<string[]> {
  try {
    const res = await fetch(`${settings.models.url}/models`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: { id?: string }[] };
    return (data.data ?? []).map((m) => String(m.id ?? "")).filter(Boolean);
  } catch {
    return [];
  }
}
