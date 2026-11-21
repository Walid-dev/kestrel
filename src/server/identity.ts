// Who may reach kestrel: every request must carry my Tailscale login, which Serve adds for my devices and strips when
// a request tries to fake it from the tailnet. There is no local exception when deployed, because a request from any
// program or page on the computer looks local too. In development the door stays open: the data is made up, and a
// browser could never show a screen otherwise.
import type { MiddlewareHandler } from "hono";

export function identity(login: string, enforced: boolean): MiddlewareHandler {
  return async (c, next) => {
    if (enforced && c.req.header("tailscale-user-login") !== login)
      return c.json({ error: "kestrel answers its own devices only: open it at its tailnet address" }, 403);
    // a write must come from the app's own address, so a page elsewhere can't post here from a browser; only when
    // deployed — in development the vite door forwards with its own address, and the data is made up anyway
    if (enforced && c.req.method !== "GET" && c.req.method !== "HEAD") {
      const origin = c.req.header("origin");
      if (origin) {
        let host = "";
        try {
          host = new URL(origin).host;
        } catch {
          return c.json({ error: "a write from a page that isn't kestrel's" }, 403);
        }
        if (host !== c.req.header("host")) return c.json({ error: "a write from a page that isn't kestrel's" }, 403);
      }
    }
    await next();
  };
}
