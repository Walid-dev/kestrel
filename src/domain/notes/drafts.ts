// Drafts: Apply (the reader's button) starts one; the model answers in the set shape; the code places each change in the
// original text; the draft waits in the database until I save or discard it. One draft is made at a time (the model
// queue is serial anyway), and a set too long for the model is refused before any call, with what to do instead.
// While the model works, the draft says how far it is (progress, below), so the screen can show more than a Stop.
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { changesPrompt, PROMPT_VERSION } from "../../ai/changes/prompt.ts";
import { Answer, type Change } from "../../ai/changes/shape.ts";
import { callModel, failureWords } from "../../ai/client.ts";
import { begin } from "../../platform/activity.ts";
import type { Settings } from "../../platform/config.ts";
import type { DocumentFull } from "../../shared/notes.ts";
import { recordCall } from "../calls.ts";
import { modelFor } from "../models.ts";
import { getDocument, Refused } from "./documents.ts";
import { listNotes } from "./notes.ts";
import { apply, type Placed, place } from "./place.ts";

export type DraftView = {
  id: string;
  createdAt: string;
  status: "making" | "ready" | "failed";
  model: string;
  documents: { id: string; name: string }[];
  overview: string;
  unanswered: { note: string; reason: string }[];
  perDocument: Record<string, Placed & { oldText: string; newText: string; savedAt?: string }>;
  error: string;
  // how many open notes the ask took
  notes: number;
  // while making: the step the work is at, the changes the model has written so far, and how long this model
  // usually takes for it (null until it has done it twice)
  step: Step | null;
  written: number;
  usualMs: number | null;
};

// the model reads (the document, the notes, its own thinking), then writes its answer, then the code places the
// changes in the text (a moment)
export type Step = "reading" | "writing" | "placing";

// a draft being made, held in memory while its call runs: a draft still 'making' with no entry here outlived the call
// that made it (kestrel restarted half-way), and is set failed, so no screen waits on it for ever
const progress = new Map<string, { step: Step; written: number }>();
const LOST = "kestrel restarted before the changes came back";

type Request = { documents: { id: string; name: string; sha256: string }[]; notes: string[] };

function viewOf(r: Record<string, unknown>): DraftView {
  const request = JSON.parse(String(r.request)) as Request;
  const answer = r.answer ? (JSON.parse(String(r.answer)) as Answer) : null;
  const placed = r.placed ? (JSON.parse(String(r.placed)) as DraftView["perDocument"]) : {};
  return {
    id: String(r.id),
    createdAt: String(r.created_at),
    status: r.status as DraftView["status"],
    model: String(r.model),
    documents: request.documents.map((d) => ({ id: d.id, name: d.name })),
    overview: answer?.overview ?? "",
    unanswered: answer?.unanswered ?? [],
    perDocument: placed,
    error: String(r.error ?? ""),
    notes: request.notes.length,
    step: null,
    written: 0,
    usualMs: null,
  };
}

// a draft as it is now: one being made gets its progress, or is set failed when nothing makes it any more
function now(db: DatabaseSync, v: DraftView): DraftView {
  if (v.status !== "making") return v;
  const p = progress.get(v.id);
  if (!p) {
    db.prepare("UPDATE drafts SET status = 'failed', error = ? WHERE id = ? AND status = 'making'").run(LOST, v.id);
    return { ...v, status: "failed", error: LOST };
  }
  return { ...v, step: p.step, written: p.written, usualMs: usualMs(db, v.model) };
}

// what this model usually takes to turn notes into changes: the middle of its last nine good answers, from the record
// of calls (src/domain/calls.ts); null with fewer than two
export function usualMs(db: DatabaseSync, model: string): number | null {
  const ms = (
    db
      .prepare(
        "SELECT ms FROM model_calls WHERE purpose LIKE 'changes:%' AND model = ? AND outcome = 'ok' ORDER BY at DESC LIMIT 9",
      )
      .all(model) as { ms: number }[]
  )
    .map((r) => r.ms)
    .sort((a, b) => a - b);
  return ms.length < 2 ? null : ms[Math.floor(ms.length / 2)];
}

export function getDraft(db: DatabaseSync, id: string): DraftView | null {
  const r = db.prepare("SELECT * FROM drafts WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? now(db, viewOf(r)) : null;
}

// the latest draft that still involves this document
export function draftFor(db: DatabaseSync, documentId: string): DraftView | null {
  const rows = db.prepare("SELECT * FROM drafts ORDER BY created_at DESC LIMIT 20").all() as Record<string, unknown>[];
  for (const r of rows) {
    const request = JSON.parse(String(r.request)) as Request;
    if (request.documents.some((d) => d.id === documentId)) return now(db, viewOf(r));
  }
  return null;
}

export function discardDraft(db: DatabaseSync, id: string): void {
  db.prepare("DELETE FROM drafts WHERE id = ?").run(id);
}

export function startDraft(
  db: DatabaseSync,
  settings: Settings,
  input: { documentIds: string[]; speed: "careful" | "fast" },
): { id: string; done: Promise<void> } {
  // a draft left 'making' by a restart (no call behind it) is set failed here, so it never blocks an ask elsewhere
  const making = db.prepare("SELECT id FROM drafts WHERE status = 'making'").all() as { id: string }[];
  const lose = db.prepare("UPDATE drafts SET status = 'failed', error = ? WHERE id = ? AND status = 'making'");
  for (const m of making) if (!progress.has(m.id)) lose.run(LOST, m.id);
  if (making.some((m) => progress.has(m.id)))
    throw new Refused("a draft is already being made: wait for it, or discard it first");
  const documents: DocumentFull[] = [];
  for (const id of input.documentIds) {
    const doc = getDocument(db, id);
    if (!doc) throw new Refused("no such document");
    documents.push(doc);
  }
  if (documents.length === 0) throw new Refused("pick at least one document");
  const notes = documents.flatMap((d) => listNotes(db, d.id).filter((n) => n.state === "open"));
  if (notes.length === 0) throw new Refused("no open notes here: leave a note first, then ask");
  // each document goes to the model under a label that cannot collide: the full path for a file, the name for an
  // upload (unique since same-name uploads save over). Two folders may both hold a plan.md (review R2-3).
  const labelOf = (d: DocumentFull) => d.path ?? d.name;
  const { system, prompt } = changesPrompt(
    documents.map((d) => ({ name: labelOf(d), text: d.text })),
    notes.map((n) => {
      const doc = documents.find((d) => d.id === n.documentId);
      return { id: n.id, document: doc ? labelOf(doc) : "", quote: n.quote, text: n.text };
    }),
  );
  const chars = system.length + prompt.length;
  if (chars > settings.models.contextChars)
    throw new Refused(
      `this set is too long for the model (${chars} characters, the limit is ${settings.models.contextChars}): ask with fewer documents at once`,
    );
  const id = randomUUID();
  // the Models screen's picks make the effective pair: the client's listed-models rule follows the picks too
  const effective = {
    ...settings.models,
    careful: modelFor(db, settings, "notes-careful"),
    fast: modelFor(db, settings, "notes-fast"),
  };
  const model = input.speed === "careful" ? effective.careful : effective.fast;
  const shaOf = db.prepare("SELECT sha256 FROM documents WHERE id = ?");
  const request: Request = {
    documents: documents.map((d) => ({
      id: d.id,
      name: d.name,
      sha256: String((shaOf.get(d.id) as { sha256: string }).sha256),
    })),
    notes: notes.map((n) => n.id),
  };
  db.prepare("INSERT INTO drafts (id, created_at, status, model, request) VALUES (?, ?, 'making', ?, ?)").run(
    id,
    new Date().toISOString(),
    model,
    JSON.stringify(request),
  );
  const here = { step: "reading" as Step, written: 0 };
  progress.set(id, here);
  const done = (async () => {
    const live = begin(
      "model",
      `Notes: changes for ${documents.map((d) => d.name).join(", ")}`.slice(0, 120),
      "/notes",
    );
    live.step(`${model} reads ${notes.length} note${notes.length === 1 ? "" : "s"}`);
    // the answer's first words end the reading; its changes are counted as they come (twice a second at most: the
    // answer grows a token at a time)
    let counted = 0;
    const onText = (soFar: string) => {
      if (here.step === "reading" && soFar.trim()) {
        here.step = "writing";
        live.step(`${model} writes the changes`);
      }
      if (Date.now() - counted < 500) return;
      counted = Date.now();
      here.written = soFar.match(/"find"\s*:/g)?.length ?? 0;
    };
    const got = await callModel(effective, { model, system, prompt, thinking: true, maxTokens: 8000, onText }, Answer);
    here.step = "placing";
    live.end(got.ok ? "done" : "failed", got.ok ? "" : failureWords(got.why, "Ask for the changes again"));
    recordCall(db, `changes:v${PROMPT_VERSION}`, got);
    if (!got.ok) {
      // Notes' page words each kind itself (web/src/notes/parts.tsx), so the row keeps the kind and never the detail
      // (that stays in the calls log); an answer out of room keeps the kind the page knows until it knows this one
      db.prepare("UPDATE drafts SET status = 'failed', error = ? WHERE id = ?").run(
        `the model didn't answer well: ${got.why === "out-of-room" ? "refusal" : got.why}`,
        id,
      );
      return;
    }
    const perDocument: DraftView["perDocument"] = {};
    // a change counts only when an open note on that document really asked for it (review R2-2): invented or
    // misplaced note ids are filtered; a change left with none is listed, never placed
    const idsByDoc = new Map(
      documents.map((d) => [d.id, new Set(notes.filter((n) => n.documentId === d.id).map((n) => n.id))]),
    );
    for (const d of documents) {
      const mine = got.value.changes.filter((c) => c.document === labelOf(d));
      const valid: Change[] = [];
      const unasked: Change[] = [];
      for (const c of mine) {
        const good = c.notes.filter((id) => idsByDoc.get(d.id)?.has(id));
        if (good.length === 0) unasked.push(c);
        else valid.push({ ...c, notes: good });
      }
      const anchors = new Map(listNotes(db, d.id).map((n) => [n.id, n.at]));
      const placedHere = place(d.text, valid, anchors);
      placedHere.leftOut.push(
        ...unasked.map((change) => ({ change, reason: "no open note on this document asked for it" })),
      );
      perDocument[d.id] = { ...placedHere, oldText: d.text, newText: apply(d.text, placedHere.placed) };
    }
    // a change naming a document that isn't in the set is left out with its reason, on the first document's list
    const known = new Set(documents.map((d) => labelOf(d)));
    const strays = got.value.changes.filter((c) => !known.has(c.document));
    if (strays.length && documents[0])
      perDocument[documents[0].id].leftOut.push(
        ...strays.map((change) => ({
          change,
          reason: `it names a document that isn't in this set: ${change.document}`,
        })),
      );
    // every open note is accounted for: answered by a placed change, excused by the model, or named here as
    // left unhandled — a note is never silently dropped (review R2-2)
    const openIds = new Set(notes.map((n) => n.id));
    const answered = new Set(Object.values(perDocument).flatMap((r) => r.placed.flatMap((pl) => pl.change.notes)));
    const excused = got.value.unanswered.filter((u) => openIds.has(u.note));
    const excusedIds = new Set(excused.map((u) => u.note));
    const forgotten = notes
      .filter((n) => !answered.has(n.id) && !excusedIds.has(n.id))
      .map((n) => ({ note: n.id, reason: `a note was left unhandled: "${n.text.slice(0, 60)}"` }));
    db.prepare("UPDATE drafts SET status = 'ready', answer = ?, placed = ? WHERE id = ?").run(
      JSON.stringify({ ...got.value, unanswered: [...excused, ...forgotten] }),
      JSON.stringify(perDocument),
      id,
    );
  })().finally(() => progress.delete(id));
  return { id, done };
}
