// After each search run: a deal hunt that is On (its searches on the clock, alerts on) pings my phone when the run
// found a great deal. Quiet and Paused say nothing, even for a run I started myself (the old Deal Hunt's rule).
import type { DatabaseSync } from "node:sqlite";
import { dealAlert, greatDeals } from "../domain/search/alerts.ts";
import type { Run } from "../domain/search/runs.ts";
import type { Spec } from "../domain/search/specs.ts";
import { record } from "../platform/activity.ts";
import { sendAlert } from "../platform/alert.ts";
import type { Settings } from "../platform/config.ts";

export async function alertRun(db: DatabaseSync, settings: Settings, spec: Spec, run: Run): Promise<void> {
  if (spec.kind !== "deals" || !spec.auto || !spec.alerts || run.kept === 0) return;
  const deals = greatDeals(db, spec, run);
  if (!deals.length) return;
  const a = dealAlert(deals, spec.hunt || spec.name, settings.alerts?.page ?? "");
  const sent = await sendAlert(settings, a);
  record("search", sent.sent ? `Pinged: ${a.title}` : `Not pinged (${sent.why}): ${a.title}`, "/searches");
}
