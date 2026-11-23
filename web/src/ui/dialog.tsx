// A box over the page: a native dialog (showModal), the way the app's sheets already open. Esc, Android's Back, a tap
// outside and the ✕ all close it, and each is the same close: the page hears it once, through onClose. What is
// inside stays mounted while it is closed, so words typed in it are still there when it opens again. While it is
// open the page behind keeps its place, and when it closes the focus goes back where it was.
import { type ReactNode, useEffect, useId, useRef } from "react";

// boxes can stack (a Confirm over a sheet): the page behind scrolls again only when the last one closes
let locks = 0;
let before = "";
const lockPage = () => {
  if (locks++ === 0) {
    before = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
  }
};
const unlockPage = () => {
  if (--locks === 0) document.documentElement.style.overflow = before;
};

export function Dialog({
  open,
  onClose,
  title,
  eyebrow,
  children,
  actions,
  wide = false,
  busy = false,
  alert = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  eyebrow?: ReactNode;
  children?: ReactNode;
  // the buttons at its foot, the main action last (on the right, where the thumb ends)
  actions?: ReactNode;
  // a wide box for reading (a listing, a review); the default fits a question or a short form
  wide?: boolean;
  // while something is saving: Esc, Back and a tap outside wait for it
  busy?: boolean;
  // a question that needs an answer (Confirm): read out as an alert, without the ✕
  alert?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const back = useRef<HTMLElement | null>(null);
  const downOutside = useRef(false);
  const titleId = useId();
  const bodyId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const d = ref.current;
    if (!d || !open) return;
    back.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!d.open) d.showModal();
    // a part inside may ask for the first focus (Confirm's safe button, a form's box); otherwise the box itself takes
    // it, so the ✕ isn't lit on opening and a space typed at once presses nothing. Tab then goes to the controls.
    (d.querySelector<HTMLElement>("[data-autofocus]") ?? d).focus();
    lockPage();
    return () => {
      unlockPage();
      if (d.open) d.close();
      // back to the button that opened it, when it is still on the page (a deleted card's ✕ is gone)
      if (back.current?.isConnected) back.current.focus({ preventScroll: true });
    };
  }, [open]);

  // the page owns open; a close from the browser (Esc, Back) or from here tells the page through onClose
  const close = () => ref.current?.close();
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the dialog closes from the keyboard with Esc, and from Back
    <dialog
      ref={ref}
      tabIndex={-1}
      className={`dialog ${wide ? "dialog-wide" : ""}`}
      role={alert ? "alertdialog" : undefined}
      aria-labelledby={titleId}
      aria-describedby={alert && children ? bodyId : undefined}
      onClose={() => {
        // the close event comes a moment later: ignore it when the page closed the box itself, or opened it again
        if (open && !ref.current?.open) closeRef.current();
      }}
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
      // a tap outside: the backdrop is the dialog itself. Pressed and let go there both, so a text selection dragged
      // out of the box doesn't close it.
      onPointerDown={(e) => {
        downOutside.current = e.target === ref.current;
      }}
      onClick={(e) => {
        if (e.target === ref.current && downOutside.current && !busy) close();
      }}
    >
      <div className="dialog-head">
        <div className="min-w-0 flex-1">
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2 id={titleId} className="dialog-title">
            {title}
          </h2>
        </div>
        {!alert && (
          <button type="button" className="dialog-x" aria-label="Close" disabled={busy} onClick={close}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
      {children && (
        <div id={bodyId} className="dialog-body">
          {children}
        </div>
      )}
      {actions && <div className="dialog-actions">{actions}</div>}
    </dialog>
  );
}
