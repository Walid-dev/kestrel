// "Are you sure?" as the app's own box instead of the browser's own pop-up: the same look as every other box, words
// that name what happens, and the safe answer first when the action can't be undone. One provider at the app's root;
// any page asks with useConfirm and awaits the answer. Esc, Back and a tap outside answer no.
import { createContext, type ReactNode, useContext, useState, useSyncExternalStore } from "react";
import { Dialog } from "./dialog.tsx";
import { asker } from "./logic.ts";

export type Question = {
  title: string;
  // a short line on what follows, when the title alone doesn't say it
  body?: ReactNode;
  // the action, named: "Delete", "Restore", never "OK"
  yes: string;
  // the action can't be undone: it shows red, and the focus starts on Cancel
  danger?: boolean;
};

const Ask = createContext<((q: Question) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [box] = useState(() => asker<Question>());
  const open = useSyncExternalStore(box.subscribe, box.current);
  // the last question stays drawn while the box closes, so its words don't blink out under the tap
  const [last, setLast] = useState<Question | null>(null);
  if (open && open !== last) setLast(open);
  const q = open ?? last;
  return (
    <Ask.Provider value={box.ask}>
      {children}
      <Dialog
        open={open !== null}
        onClose={() => box.answer(false)}
        title={q?.title ?? ""}
        alert
        actions={
          <>
            <button
              type="button"
              className="btn btn-quiet"
              data-autofocus={q?.danger ? "" : undefined}
              onClick={() => box.answer(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`btn btn-primary ${q?.danger ? "btn-danger" : ""}`}
              data-autofocus={q?.danger ? undefined : ""}
              onClick={() => box.answer(true)}
            >
              {q?.yes}
            </button>
          </>
        }
      >
        {q?.body}
      </Dialog>
    </Ask.Provider>
  );
}

export function useConfirm(): (q: Question) => Promise<boolean> {
  const ask = useContext(Ask);
  if (!ask) throw new Error("useConfirm needs the ConfirmProvider at the app's root (web/src/app.tsx)");
  return ask;
}
