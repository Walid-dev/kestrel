// The program: one Node process serving the app on the computer only; Tailscale Serve publishes it to my devices.
import { serve } from "@hono/node-server";
import { loadSettings } from "../platform/config.ts";
import { dataDir, isDeployed } from "../platform/paths.ts";
import { app } from "./app.ts";

// the settings first: a missing or wrong file stops here, with the example in the message
try {
  loadSettings();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
console.log(isDeployed() ? "deployed: the data folder is launchd's" : `made-up data folder: ${dataDir()}`);

const port = Number(process.env.PORT ?? 8790);
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => {
  console.log(`kestrel answers on 127.0.0.1:${port}`);
});
