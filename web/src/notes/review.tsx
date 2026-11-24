// The review: each change the model placed, under the note it answers, as a short code diff (minus out in red, plus in
// in green), with Keep or Drop; the whole document's diff one tap away. Save writes the kept changes only, and only
// their notes go to Done; a dropped change's note stays open for the next Apply. Discard asks first, since a draft
// took the model a while. In the app's one box (ui/dialog.tsx), wide, its title and Save held in view on a tall
// screen while the changes scroll between them.
import { useState } from "react";
import { type DiffRow, diffRows } from "../../../src/shared/diff.ts";
import type { Draft, DraftDocumentResult } from "../../../src/shared/notes.ts";
import { useConfirm } from "../ui/confirm.tsx";
import { Dialog } from "../ui/dialog.tsx";
import { Seg } from "../ui/seg.tsx";
import { sentence, shortPath } from "./parts.tsx";

const ROW: Record<DiffRow["kind"], { mark: string; look: string }> = {
  same: { mark: " ", look: "" },
  del: { mark: "−", look: "bg-del-soft text-red" },
  add: { mark: "+", look: "bg-add-soft text-green" },
  skip: { mark: "⋯", look: "text-muted" },
};

// the kept changes on the text the draft was made from, back to front so earlier places stay true (as the server's
// apply in src/domain/notes/place.ts, which the web may not import)
function applyKept(text: string, placed: DraftDocumentResult["placed"]): string {
  let out = text;
  for (const p of [...placed].sort((a, b) => b.at - a.at))
    out = out.slice(0, p.at) + p.change.replace + out.slice(p.at + p.change.find.length);
  return out;
}

function Diff({ old, now }: { old: string; now: string }) {
  return (
    <div className="note-diff">
      {diffRows(old, now).map((row, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: display-only rows that never reorder
        <div key={i} className={`flex gap-2 px-3 ${ROW[row.kind].look}`}>
          <span className="font-mono w-3 shrink-0 select-none text-right">{ROW[row.kind].mark}</span>
          <span className="min-w-0 whitespace-pre-wrap break-words">{row.text || " "}</span>
        </div>
      ))}
    </div>
  );
}

const plural = (n: number, one: string) => (n === 1 ? `1 ${one}` : `${n} ${one}s`);

export function Review({
  draft,
  targets,
  texts,
  noteText,
  onSave,
  saving,
  saveWhy,
  onDiscard,
  onClose,
}: {
  draft: Draft;
  // where each document's save writes: its path, or the upload
  targets: Record<string, string>;
  texts: Record<string, string>;
  // my notes' words, by id: each change shows the note it answers
  noteText: Record<string, string>;
  // keep: the kept changes' places in the document's list
  onSave: (documentId: string, keep: number[]) => void;
  saving: boolean;
  saveWhy: string;
  onDiscard: () => void;
  onClose: () => void;
}) {
  const sure = useConfirm();
  // what I dropped, per document, by the change's place in its list; everything else is kept
  const [dropped, setDropped] = useState<Record<string, number[]>>({});
  const one = draft.documents.length === 1 ? draft.documents[0] : null;
  const keepOf = (id: string) =>
    (draft.perDocument[id]?.placed ?? []).map((_, i) => i).filter((i) => !(dropped[id] ?? []).includes(i));
  const discard = async () => {
    const yes = await sure({
      title: "Discard these changes?",
      body: "The draft goes; your notes stay open, so you can apply them again.",
      yes: "Discard",
      danger: true,
    });
    if (yes) onDiscard();
  };
  const oneKept = one ? keepOf(one.id).length : 0;
  const oneResult = one ? draft.perDocument[one.id] : null;
  const where = (id: string, name: string) => {
    const t = targets[id] ?? name;
    return (
      <p className="font-mono m-0 break-all text-small text-muted" title={t}>
        Writes {t.startsWith("/") ? shortPath(t) : t}
      </p>
    );
  };
  return (
    <Dialog
      open
      wide
      busy={saving}
      onClose={onClose}
      eyebrow={one ? one.name : `${draft.documents.length} documents`}
      title="The changes, before anything is saved"
      actions={
        <>
          <button type="button" className="btn btn-danger mr-auto" disabled={saving} onClick={discard}>
            Discard
          </button>
          {one && oneResult ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || oneKept === 0}
              onClick={() => onSave(one.id, keepOf(one.id))}
            >
              {saving ? "Saving…" : oneKept === 0 ? "Nothing kept" : `Save ${plural(oneKept, "change")}`}
            </button>
          ) : (
            <button type="button" className="btn btn-quiet" disabled={saving} onClick={onClose}>
              Close
            </button>
          )}
        </>
      }
    >
      <div className="note-review grid gap-4">
        {draft.overview && <p className="m-0 text-body text-muted">{draft.overview}</p>}
        {draft.documents.map((d) => {
          const result = draft.perDocument[d.id];
          const old = texts[d.id];
          if (!result || old === undefined) return null;
          const keep = keepOf(d.id);
          const kept = result.placed.filter((_, i) => keep.includes(i));
          return (
            <section key={d.id} className="grid gap-3">
              <h3 className="eyebrow m-0 break-all">
                {!one && `${d.name} · `}
                {result.placed.length} placed
                {result.leftOut.length ? ` · ${result.leftOut.length} not placed` : ""}
              </h3>
              <ol className="m-0 grid list-none gap-3 p-0">
                {result.placed.map((pl, i) => {
                  const off = (dropped[d.id] ?? []).includes(i);
                  return (
                    <li key={`${pl.at}-${pl.change.find.slice(0, 20)}`} className="note-change" data-dropped={off}>
                      <div className="note-change-head">
                        <div className="grid min-w-0 flex-1 gap-1">
                          {pl.change.notes.map((id) => (
                            <p key={id} className="note-said">
                              {noteText[id] ?? "A note"}
                            </p>
                          ))}
                        </div>
                        <Seg
                          label={`Keep or drop change ${i + 1}`}
                          options={[
                            { value: "keep", label: "Keep" },
                            { value: "drop", label: "Drop" },
                          ]}
                          value={off ? "drop" : "keep"}
                          onChange={(v) =>
                            setDropped((all) => {
                              const mine = (all[d.id] ?? []).filter((x) => x !== i);
                              return { ...all, [d.id]: v === "drop" ? [...mine, i] : mine };
                            })
                          }
                        />
                      </div>
                      <Diff old={pl.change.find} now={pl.change.replace} />
                    </li>
                  );
                })}
              </ol>
              <details className="note-fold">
                <summary className="disclosure">The whole document</summary>
                <Diff old={old} now={applyKept(old, kept)} />
              </details>
              {result.leftOut.length > 0 && (
                <div className="grid gap-1">
                  <h4 className="eyebrow m-0">Not placed · their notes stay open</h4>
                  {result.leftOut.map((lost) => (
                    <p key={lost.change.find} className="m-0 text-detail text-muted">
                      {sentence(lost.reason)} · <span className="font-mono">“{lost.change.find.slice(0, 80)}”</span>
                    </p>
                  ))}
                </div>
              )}
              {!one && (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    // one Save per document: plain, as a list's per-item action is (no filled button per item)
                    className={result.savedAt ? "btn btn-quiet" : "btn"}
                    disabled={saving || Boolean(result.savedAt) || keep.length === 0}
                    onClick={() => onSave(d.id, keep)}
                  >
                    {result.savedAt ? "Saved" : `Save ${plural(keep.length, "change")}`}
                  </button>
                  {where(d.id, d.name)}
                </div>
              )}
            </section>
          );
        })}
        {draft.unanswered.length > 0 && (
          <section className="grid gap-1">
            <h3 className="eyebrow m-0">Not answered · these notes stay open</h3>
            {draft.unanswered.map((u) => (
              <p key={u.note} className="m-0 text-detail text-muted">
                {sentence(u.reason)}
              </p>
            ))}
          </section>
        )}
        {saveWhy && (
          <p role="alert" className="m-0 rounded-lg bg-warn-soft px-3 py-2 text-detail">
            {sentence(saveWhy)}
          </p>
        )}
        {one && where(one.id, one.name)}
      </div>
    </Dialog>
  );
}
