// The model each use runs on: the Models screen's pick in the database first, the settings file as the fallback.
// One place answers every caller, so switching a use is one row.
import type { DatabaseSync } from "node:sqlite";
import type { Settings } from "../platform/config.ts";

export type Use = "notes-careful" | "notes-fast" | "learn-ask" | "search-deep" | "research" | "quiz" | "letter";
export const USES: { use: Use; what: string }[] = [
  { use: "notes-careful", what: "Notes' careful asks: changes written with time to think" },
  { use: "notes-fast", what: "Notes' fast asks: changes in seconds" },
  { use: "learn-ask", what: "Learn's Ask: a question on the open lesson" },
  { use: "search-deep", what: "Searches' deep check: a longer look at one job or one deal" },
  { use: "research", what: "Research: a question answered from the web, quick or deep" },
  { use: "quiz", what: "Quiz: marking my answer to a lesson's question" },
  { use: "letter", what: "Cover letters: a letter written the way an application writes it" },
];

// learn-ask falls back to careful: the live eval (docs/eval/2026-11-21-learn-ask.md) showed the fast model
// breaking the one-breath line rule 3 runs in 8, while the careful one passed 8 of 8.
export const fallbackFor = (settings: Settings, use: Use): string =>
  use === "notes-fast" ? settings.models.fast : settings.models.careful;

export function modelFor(db: DatabaseSync, settings: Settings, use: Use): string {
  const row = db.prepare("SELECT model FROM model_settings WHERE use = ?").get(use) as { model: string } | undefined;
  if (row?.model) return row.model;
  return fallbackFor(settings, use);
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
    fallback: fallbackFor(settings, use),
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
