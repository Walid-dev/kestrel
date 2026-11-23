// The program: one Node process serving the app on the computer only; Tailscale Serve publishes it to my devices.
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { openDb } from "../db/db.ts";
import { migrate } from "../db/migrate.ts";
import { sweepDeepChecks } from "../domain/search/deep.ts";
import { loadSettings } from "../platform/config.ts";
import { dataDir, isDeployed } from "../platform/paths.ts";
import { plainWords } from "../platform/plain.ts";
import { alertRun } from "./alerts.ts";
import { app } from "./app.ts";
import { mountApply } from "./apply.ts";
import { mountAsk } from "./ask.ts";
import { mountBrief } from "./brief.ts";
import { mountCost } from "./cost.ts";
import { mountEvents } from "./events.ts";
import { identity } from "./identity.ts";
import { mountLearn } from "./learn.ts";
import { mountLetters } from "./letters.ts";
import { mountLive } from "./live.ts";
import { mountModels } from "./models.ts";
import { mountNotes } from "./notes.ts";
import { mountResearch } from "./research.ts";
import { startScheduler } from "./scheduler.ts";
import { mountSearch } from "./search.ts";
import { mountTasks } from "./tasks.ts";
import { mountVoice } from "./voice.ts";

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
mountModels(app, db, settings);
mountLearn(app, db, settings);
mountAsk(app, db, settings);
mountResearch(app, db, settings);
mountLetters(app, db, settings);
mountVoice(app, settings);
// development gets one made-up pack, so Learn's screens have something honest to show
if (!isDeployed() && (db.prepare("SELECT COUNT(*) AS n FROM packs").get() as { n: number }).n === 0) {
  const { addLesson, addPack } = await import("../domain/learn/lessons.ts");
  const pack = addPack(db, "A made-up pack");
  addLesson(
    db,
    pack,
    "What a queue is",
    {
      say: ["A queue holds work until a worker is free.", "The sender never waits on the receiver."],
      explain: ["A burst piles up in the queue, not on the worker."],
      example: "Sixty letters arrive at once; the mailbox holds them while one clerk works.",
      words: [{ w: "queue", m: "a waiting line for work" }],
      check: [{ q: "Where does a burst pile up?", a: "In the queue, never on the worker." }],
    },
    1,
  );
  // and one made-up answer-pack, so Live has something to find
  const answers = addPack(db, "A made-up interview", "answer-pack");
  addLesson(
    db,
    answers,
    "Why did you pick cedar for the boxes?",
    {
      say: ["Cedar stays light when the box is full.", "And it shrugs off rain without paint."],
      explain: ["They want to know why you chose this wood."],
      check: [{ q: "Why did you pick cedar for the boxes?", a: "Cedar stays light when the box is full." }],
    },
    1,
  );
  addLesson(
    db,
    pack,
    "What a cache is",
    {
      say: ["A cache keeps a copy close, so the next read is fast."],
      explain: ["It trades freshness for speed."],
      example: "The kettle stays on the counter because tea happens daily.",
      words: [{ w: "cache", m: "a close copy for speed" }],
      check: [{ q: "What does a cache trade?", a: "Freshness for speed." }],
    },
    2,
  );
}
sweepDeepChecks(db); // a deep check a restart cut short says so (as Research, the letters and Ask do in their mounts)
mountSearch(app, db, settings);
mountApply(app, db);
mountTasks(app, db);
mountLive(app, db, settings.oldLive ?? "");
mountCost(app, settings);
mountBrief(app, db, settings);
mountEvents(app);
// an api path with no door answers so, in words — never the app's page with a 200. It comes last: a route mounted
// after it is never reached (the live stream was, until 2026-11-22, so every screen fell back to its timer)
app.all("/api/*", (c) => c.json({ error: "no such door" }, 404));
startScheduler(db, {
  specsDir: join(dataDir(), "searches"),
  backupsDir: join(dataDir(), "backups"),
  mirrorFile: join(dataDir(), "mirror-v1.json"),
  afterRun: (spec, run) => alertRun(db, settings, spec, run),
});

// every request through the identity check: enforced when deployed, open on made-up data (identity.ts says why).
// The root is composed after every route is mounted: route() copies what exists when it is called.
const root = new Hono();
// a failed request logs one plain line, never a stack: the service log must stay free of paths and content
root.onError((e, c) => {
  console.error(`a request failed: ${e.name}: ${plainWords(e.message)}`);
  return c.json({ error: "something went wrong on the computer's side" }, 500);
});
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
