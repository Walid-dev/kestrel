// The review, read like a code diff: minus lines out (red), plus lines in (green), the whole document when it is
// small so the change reads in its place. Save names the file it writes; Discard asks first, since a draft took the
// model a while. In the app's one box (ui/dialog.tsx), wide.
import { type DiffRow, diffRows } from "../../../src/shared/diff.ts";
import type { Draft } from "../../../src/shared/notes.ts";
import { useConfirm } from "../ui/confirm.tsx";
import { Dialog } from "../ui/dialog.tsx";

const ROW: Record<DiffRow["kind"], { mark: string; look: string }> = {
  same: { mark: " ", look: "" },
  del: { mark: "−", look: "bg-del-soft text-red" },
  add: { mark: "+", look: "bg-add-soft text-green" },
  skip: { mark: "⋯", look: "text-muted" },
};

export function Review({
  draft,
  targets,
  texts,
  onSave,
  saving,
  saveWhy,
  onDiscard,
  onClose,
}: {
  draft: Draft;
  targets: Record<string, string>;
  texts: Record<string, string>;
  onSave: (documentId: string) => void;
  saving: boolean;
  saveWhy: string;
  onDiscard: () => void;
  onClose: () => void;
}) {
  const sure = useConfirm();
  const one = draft.documents.length === 1 ? draft.documents[0] : null;
  const oneResult = one ? draft.perDocument[one.id] : null;
  const discard = async () => {
    const yes = await sure({
      title: "Discard these changes?",
      body: "The draft goes; your notes stay, so you can ask again.",
      yes: "Discard",
      danger: true,
    });
    if (yes) onDiscard();
  };
  return (
    <Dialog
      open
      wide
      busy={saving}
      onClose={onClose}
      title="The changes, before anything is saved"
      actions={
        <>
          <button type="button" className="btn btn-danger mr-auto" disabled={saving} onClick={discard}>
            Discard
          </button>
          <button type="button" className="btn btn-quiet" disabled={saving} onClick={onClose}>
            Close
          </button>
          {one && oneResult && (
            <button
              type="button"
              className={oneResult.savedAt ? "btn btn-quiet" : "btn btn-primary"}
              disabled={saving || Boolean(oneResult.savedAt) || oneResult.placed.length === 0}
              onClick={() => onSave(one.id)}
            >
              {saving ? "Saving…" : oneResult.savedAt ? "Saved" : "Save"}
            </button>
          )}
        </>
      }
    >
      <div className="grid gap-4">
        {draft.overview && <p className="m-0 text-body text-muted">{draft.overview}</p>}
        {draft.documents.map((d) => {
          const result = draft.perDocument[d.id];
          const old = texts[d.id];
          if (!result || old === undefined) return null;
          return (
            <section key={d.id} className="grid gap-2">
              <h3 className="eyebrow m-0 break-all">
                {d.name} · {result.placed.length} placed
                {result.leftOut.length ? ` · ${result.leftOut.length} left out` : ""}
              </h3>
              <div className="overflow-x-auto rounded-xl border border-line bg-surface py-2 text-small">
                {diffRows(old, result.newText).map((row, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: display-only rows that never reorder
                  <div key={i} className={`flex gap-2 px-3 ${ROW[row.kind].look}`}>
                    <span className="font-mono w-3 shrink-0 select-none text-right">{ROW[row.kind].mark}</span>
                    <span className="min-w-0 whitespace-pre-wrap break-words">{row.text || " "}</span>
                  </div>
                ))}
              </div>
              {!one && (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className={result.savedAt ? "btn btn-quiet" : "btn btn-primary"}
                    disabled={saving || Boolean(result.savedAt) || result.placed.length === 0}
                    onClick={() => onSave(d.id)}
                  >
                    {result.savedAt ? "Saved" : "Save"}
                  </button>
                  <span className="font-mono min-w-0 break-all text-small text-muted">
                    Writes {targets[d.id] ?? d.name}
                  </span>
                </div>
              )}
              {result.leftOut.map((lost) => (
                <p key={lost.change.find} className="m-0 rounded-xl bg-warn-soft px-3 py-2 text-detail">
                  Left out: {lost.reason} · “{lost.change.find.slice(0, 80)}”
                </p>
              ))}
            </section>
          );
        })}
        {draft.unanswered.length > 0 && (
          <section className="grid gap-1">
            <h3 className="eyebrow m-0">Not answered</h3>
            {draft.unanswered.map((u) => (
              <p key={u.note} className="m-0 text-detail text-muted">
                {u.reason}
              </p>
            ))}
          </section>
        )}
        {saveWhy && (
          <p role="alert" className="m-0 rounded-xl bg-warn-soft px-3 py-2 text-detail">
            {saveWhy.charAt(0).toUpperCase() + saveWhy.slice(1)}
          </p>
        )}
        {one && (
          <p className="font-mono m-0 break-all text-small text-muted">Save writes {targets[one.id] ?? one.name}</p>
        )}
      </div>
    </Dialog>
  );
}
