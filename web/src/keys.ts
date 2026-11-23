// Enter sends, the app's rule for every box with a send button; Shift+Enter makes a new line, and a word still being
// composed (a phone's or an accented keyboard's) is never sent half-typed
import type { KeyboardEvent } from "react";

export const enterSends = (send: () => void) => (e: KeyboardEvent) => {
  if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
  e.preventDefault();
  send();
};
