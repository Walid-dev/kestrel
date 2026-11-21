// The program: one Node process serving the app on the computer only; Tailscale Serve publishes it to my devices.
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { openDb } from "../db/db.ts";
import { migrate } from "../db/migrate.ts";
import { loadSettings } from "../platform/config.ts";
import { dataDir, isDeployed } from "../platform/paths.ts";
import { app } from "./app.ts";
import { mountApply } from "./apply.ts";
import { mountEvents } from "./events.ts";
import { identity } from "./identity.ts";
import { mountNotes } from "./notes.ts";
import { startScheduler } from "./scheduler.ts";
import { mountSearch } from "./search.ts";

// the settings first: a missing or wrong file stops here, with the example in the message
let settings: ReturnType<typeof loadSettings>;
try {
  settings = loadSettings();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
console.log(isDeployed() ? "deployed: the data folder is launchd's" : `made-up data folder: ${dataDir()}`);

// the database, migrated before anything serves (a copy is made first when tables already exist: migrate.ts)
const dbFile = join(dataDir(), "kestrel.db");
const db = openDb(dbFile);
const { applied, copy } = migrate(db, dbFile);
if (applied) console.log(`migrations: ${applied} applied${copy ? ", the database copied first" : ""}`);
mountNotes(app, db, settings);
mountSearch(app, db);
mountApply(app, db);
mountEvents(app);
startScheduler(db, {
  specsDir: join(dataDir(), "searches"),
  backupsDir: join(dataDir(), "backups"),
  mirrorFile: join(dataDir(), "mirror-v1.json"),
});

// every request through the identity check: enforced when deployed, open on made-up data (identity.ts says why).
// The root is composed after every route is mounted: route() copies what exists when it is called.
const root = new Hono();
root.use("*", identity(settings.tailscaleLogin, isDeployed()));
root.route("/", app);

// the built app, served as plain files, with the page itself for any address that isn't the API (the router's)
const dist = join(fileURLToPath(new URL("../../web/dist/", import.meta.url)), ".");
if (existsSync(join(dist, "index.html"))) {
  root.use("*", serveStatic({ root: relative(process.cwd(), dist) }));
  root.get("*", (c) => c.html(readFileSync(join(dist, "index.html"), "utf8")));
} else {
  console.log("no web/dist yet: only the API answers (node --run build makes the app)");
}

const port = Number(process.env.PORT ?? 8790);
serve({ fetch: root.fetch, port, hostname: "127.0.0.1" }, () => {
  console.log(`kestrel answers on 127.0.0.1:${port}`);
});
