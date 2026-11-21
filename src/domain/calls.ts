// The record of model calls: the domain writes one row per call, whatever the outcome, so cost in time and failures
// stay visible (the ai module itself may not touch the database).
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { ModelAnswer } from "../ai/client.ts";

export function recordCall(db: DatabaseSync, purpose: string, answer: ModelAnswer<unknown>): void {
  db.prepare(
    `INSERT INTO model_calls (id, at, model, purpose, ms, outcome, detail, tokens_in, tokens_out)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    new Date().toISOString(),
    answer.model,
    purpose,
    answer.ms,
    answer.ok ? "ok" : answer.why,
    answer.ok ? "" : answer.detail,
    answer.ok ? answer.tokensIn : null,
    answer.ok ? answer.tokensOut : null,
  );
}

export function listCalls(db: DatabaseSync, limit = 50): Record<string, unknown>[] {
  return db.prepare("SELECT * FROM model_calls ORDER BY at DESC LIMIT ?").all(limit) as Record<string, unknown>[];
}
