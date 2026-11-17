// The program: one Node process serving the app on the computer only; Tailscale Serve publishes it to my devices.
import { serve } from "@hono/node-server";
import { app } from "./app.ts";

const port = Number(process.env.PORT ?? 8790);
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => {
  console.log(`kestrel answers on 127.0.0.1:${port}`);
});
