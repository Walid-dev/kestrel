// A box to write in, the app's one way: Enter sends and Shift+Enter makes a new line (the line under the box says
// so), the round send button sits inside at its foot, the box grows with the words, and the text is 16 px so a phone
// never zooms into it. Without onSend it is a search box: one line, no button, no rule to say.
import { useId } from "react";
import { enterSends } from "../keys.ts";
import { cx } from "./cx.ts";

type Props = {
  // what the box is for, read out; its placeholder too, unless one is given
  label: string;
  value: string;
  onChange: (v: string) => void;
  // Enter sends, and so does the round button
  onSend?: () => void;
  placeholder?: string;
  // sending: the button turns, and Enter waits for it
  busy?: boolean;
  disabled?: boolean;
  // the button's name, read out: "Ask", "Add" (Send unless said)
  sendLabel?: string;
  // the line under the box when Enter does more than send ("Enter adds · Shift+Enter for a new line")
  hint?: string;
  // a question or an answer: three lines from the start
  tall?: boolean;
};

export function Field({
  label,
  value,
  onChange,
  onSend,
  placeholder,
  busy = false,
  disabled = false,
  sendLabel = "Send",
  hint,
  tall = false,
}: Props) {
  const hintId = useId();
  if (!onSend)
    return (
      <div className="field field-search">
        <div className="field-box">
          <input
            type="search"
            className="field-input"
            aria-label={label}
            placeholder={placeholder ?? label}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      </div>
    );
  const ready = value.trim() !== "" && !busy && !disabled;
  const send = () => {
    if (ready) onSend();
  };
  return (
    <div className={cx("field", tall && "field-tall")}>
      <div className="field-box">
        <textarea
          className="field-input"
          rows={1}
          aria-label={label}
          aria-describedby={hintId}
          placeholder={placeholder ?? label}
          value={value}
          disabled={disabled}
          enterKeyHint="send"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={enterSends(send)}
        />
        <button
          type="button"
          className="field-send"
          aria-label={busy ? "Sending" : sendLabel}
          title={sendLabel}
          disabled={!ready}
          onClick={send}
        >
          {busy ? (
            <span className="spin" />
          ) : (
            <svg
              viewBox="0 0 24 24"
              width="17"
              height="17"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
            </svg>
          )}
        </button>
      </div>
      <span id={hintId} className="field-hint">
        {hint ?? "Enter sends · Shift+Enter for a new line"}
      </span>
    </div>
  );
}
