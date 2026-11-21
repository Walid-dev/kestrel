// One ear on the live stream: screens call useEvents(fn) and hear every change the server rings. The browser
// reconnects EventSource by itself; the service worker never caches this path.
import { useEffect, useRef } from "react";

export function useEvents(onChange: (payload: { kind: string; counts?: Record<string, number> }) => void) {
  const handler = useRef(onChange);
  handler.current = onChange;
  useEffect(() => {
    const source = new EventSource("/api/events");
    source.onmessage = (e) => {
      try {
        handler.current(JSON.parse(e.data));
      } catch {
        // a ping or a malformed line: nothing to do
      }
    };
    return () => source.close();
  }, []);
}
