// The routes: one Hono app, served by main.ts and called directly by the tests (app.request needs no port).
import { Hono } from "hono";

export const app = new Hono();

// is kestrel up? the deploy check and the phone's "Computer asleep" banner both ask here
app.get("/api/health", (c) => c.json({ ok: true }));
