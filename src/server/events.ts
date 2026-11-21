// One live stream for the phone: server-sent events on /api/events, never cached by the service worker (that rule
// has guarded this path since v0.1). Whoever changes state emits on the bus; every open screen hears it.
import { EventEmitter } from "node:events";
import type { Hono } from "hono";

export const bus = new EventEmitter();
bus.setMaxListeners(50);

export function mountEvents(app: Hono) {
  app.get("/api/events", (c) => {
    const encoder = new TextEncoder();
    let send: ((chunk: string) => void) | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;
    const onChange = (payload: unknown) => send?.(`data: ${JSON.stringify(payload)}\n\n`);
    const stream = new ReadableStream({
      start(controller) {
        send = (chunk) => {
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            // the phone left; cancel() cleans up
          }
        };
        send(`data: ${JSON.stringify({ kind: "hello" })}\n\n`);
        bus.on("change", onChange);
        ping = setInterval(() => send?.(": ping\n\n"), 25_000);
      },
      cancel() {
        bus.off("change", onChange);
        if (ping) clearInterval(ping);
      },
    });
    c.req.raw.signal.addEventListener("abort", () => {
      bus.off("change", onChange);
      if (ping) clearInterval(ping);
    });
    return new Response(stream, {
      headers: { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" },
    });
  });
}
