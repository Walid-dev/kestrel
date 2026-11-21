// Drafts: "Ask for changes" starts one; the model answers in the set shape; the code places each change in the
// original text; the draft waits in the database until I save or discard it. One draft is made at a time (the model
// queue is serial anyway), and a set too long for the model is refused before any call, with what to do instead.
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { changesPrompt, PROMPT_VERSION } from "../../ai/changes/prompt.ts";
import { Answer } from "../../ai/changes/shape.ts";
import { callModel } from "../../ai/client.ts";
import type { Settings } from "../../platform/config.ts";
import type { DocumentFull } from "../../shared/notes.ts";
import { recordCall } from "../calls.ts";
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
  perDocument: Record<string, Placed & { newText: string; savedAt?: string }>;
  error: string;
};

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
  };
}

export function getDraft(db: DatabaseSync, id: string): DraftView | null {
  const r = db.prepare("SELECT * FROM drafts WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? viewOf(r) : null;
}

// the latest draft that still involves this document
export function draftFor(db: DatabaseSync, documentId: string): DraftView | null {
  const rows = db.prepare("SELECT * FROM drafts ORDER BY created_at DESC LIMIT 20").all() as Record<string, unknown>[];
  for (const r of rows) {
    const request = JSON.parse(String(r.request)) as Request;
    if (request.documents.some((d) => d.id === documentId)) return viewOf(r);
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
  const making = db.prepare("SELECT id FROM drafts WHERE status = 'making'").get();
  if (making) throw new Refused("a draft is already being made: wait for it, or discard it first");
  const documents: DocumentFull[] = [];
  for (const id of input.documentIds) {
    const doc = getDocument(db, id);
    if (!doc) throw new Refused("no such document");
    documents.push(doc);
  }
  if (documents.length === 0) throw new Refused("pick at least one document");
  const notes = documents.flatMap((d) => listNotes(db, d.id).filter((n) => n.state === "open"));
  if (notes.length === 0) throw new Refused("no open notes here: leave a note first, then ask");
  const { system, prompt } = changesPrompt(
    documents.map((d) => ({ name: d.name, text: d.text })),
    notes.map((n) => ({
      id: n.id,
      document: documents.find((d) => d.id === n.documentId)?.name ?? "",
      quote: n.quote,
      text: n.text,
    })),
  );
  const chars = system.length + prompt.length;
  if (chars > settings.models.contextChars)
    throw new Refused(
      `this set is too long for the model (${chars} characters, the limit is ${settings.models.contextChars}): ask with fewer documents at once`,
    );
  const id = randomUUID();
  const model = input.speed === "careful" ? settings.models.careful : settings.models.fast;
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
  const done = (async () => {
    const got = await callModel(settings.models, { model, system, prompt, thinking: true, maxTokens: 8000 }, Answer);
    recordCall(db, `changes:v${PROMPT_VERSION}`, got);
    if (!got.ok) {
      db.prepare("UPDATE drafts SET status = 'failed', error = ? WHERE id = ?").run(
        `the model didn't answer well: ${got.why} — ${got.detail}`,
        id,
      );
      return;
    }
    const perDocument: DraftView["perDocument"] = {};
    for (const d of documents) {
      const mine = got.value.changes.filter((c) => c.document === d.name);
      const anchors = new Map(listNotes(db, d.id).map((n) => [n.id, n.at]));
      const placedHere = place(d.text, mine, anchors);
      perDocument[d.id] = { ...placedHere, newText: apply(d.text, placedHere.placed) };
    }
    // a change naming a document that isn't in the set is left out with its reason, on the first document's list
    const known = new Set(documents.map((d) => d.name));
    const strays = got.value.changes.filter((c) => !known.has(c.document));
    if (strays.length && documents[0])
      perDocument[documents[0].id].leftOut.push(
        ...strays.map((change) => ({
          change,
          reason: `it names a document that isn't in this set: ${change.document}`,
        })),
      );
    db.prepare("UPDATE drafts SET status = 'ready', answer = ?, placed = ? WHERE id = ?").run(
      JSON.stringify(got.value),
      JSON.stringify(perDocument),
      id,
    );
  })();
  return { id, done };
}
