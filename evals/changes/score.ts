// The scorer: deterministic rules, no model. A pass means every note is answered or excused, every change quotes
// text that really stands in its document and answers a real note, and the overview covers each document by name.
import { Answer } from "../../src/ai/changes/shape.ts";

export type Case = {
  name: string;
  documents: { name: string; text: string }[];
  notes: { id: string; document: string; quote: string; text: string }[];
  good: unknown;
  bad: unknown;
  badWhy: string; // what the scorer must say about the bad answer
};

export function score(c: Case, raw: unknown): { pass: boolean; reasons: string[] } {
  const read = Answer.safeParse(raw);
  if (!read.success)
    return { pass: false, reasons: read.error.issues.map((i) => `${i.path.join(".") || "answer"}: ${i.message}`) };
  const a = read.data;
  const reasons: string[] = [];
  const docs = new Map(c.documents.map((d) => [d.name, d]));
  const noteIds = new Set(c.notes.map((n) => n.id));
  const answered = new Set(a.changes.flatMap((ch) => ch.notes));
  const excused = new Set(a.unanswered.map((u) => u.note));
  for (const n of c.notes) if (!answered.has(n.id) && !excused.has(n.id)) reasons.push(`note not handled: ${n.id}`);
  for (const ch of a.changes) {
    const doc = docs.get(ch.document);
    if (!doc) {
      reasons.push(`a change names a document that isn't here: ${ch.document}`);
      continue;
    }
    if (!doc.text.includes(ch.find))
      reasons.push(`a quote that doesn't exist in ${ch.document}: "${ch.find.slice(0, 40)}"`);
    for (const id of ch.notes) if (!noteIds.has(id)) reasons.push(`a change no note asked for: ${id}`);
  }
  for (const d of c.documents) if (!a.overview.includes(d.name)) reasons.push(`overview missing a document: ${d.name}`);
  return { pass: reasons.length === 0, reasons };
}
