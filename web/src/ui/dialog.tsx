// A box over the page: a native dialog (showModal), the way the app's sheets already open. Esc, Android's Back, a tap
// outside and the ✕ all close it, and each is the same close: the page hears it once, through onClose. What is
// inside stays mounted while it is closed, so words typed in it are still there when it opens again. While it is
// open the page behind keeps its place, and when it closes the focus goes back where it was.
import { type ReactNode, useEffect, useId, useRef } from "react";

// The page behind stays still while a box is open. overflow: hidden on the page is ignored by a home-screen app on the
// iPhone (WebKit bug 259568), so the body itself is pinned where it stands (fixed, moved up by the distance scrolled)
// and put back, at the same place, when the last box closes: boxes can stack (a Confirm over a sheet). A box closed
// by going to another page leaves that page where it starts.
let locks = 0;
let held = { y: 0, style: "", page: "" };
const lockPage = () => {
  if (locks++ > 0) return;
  const body = document.body;
  held = { y: window.scrollY, style: body.getAttribute("style") ?? "", page: location.pathname };
  Object.assign(body.style, { position: "fixed", top: `-${held.y}px`, left: "0", right: "0", width: "100%" });
};
const unlockPage = () => {
  if (--locks > 0) return;
  if (held.style) document.body.setAttribute("style", held.style);
  else document.body.removeAttribute("style");
  if (location.pathname === held.page) window.scrollTo({ top: held.y, behavior: "instant" });
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
          <button
            type="button"
            className="btn btn-icon btn-quiet dialog-x"
            aria-label="Close"
            title="Close"
            disabled={busy}
            onClick={close}
          >
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
