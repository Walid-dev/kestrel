// A run's great deal pings: only what the run just found, kept in view, at 65% of the usual or under; the ping names
// the best and opens kestrel on it; it goes to the channel read from its file, and nowhere without one. Made-up deals.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../../db/migrate.ts";
import { sendAlert } from "../../platform/alert.ts";
import type { Settings } from "../../platform/config.ts";
import { dealAlert, greatDeals } from "./alerts.ts";

function setup() {
  const base = mkdtempSync(join(tmpdir(), "kestrel-alerts-"));
  const db = new DatabaseSync(join(base, "t.db"));
  migrate(db, join(base, "t.db"));
  const add = db.prepare(
    `INSERT INTO listings (id, search, source, link, dedupe, status, found, updated, score, match, data, kind)
     VALUES (?, 'fancy-board', 'made-up-board', ?, ?, 'new', ?, ?, 50, '', ?, 'deals')`,
  );
  const deal = (id: string, price: number, found: string, extra: Record<string, unknown> = {}) =>
    add.run(
      id,
      `https://example.com/${id}`,
      id,
      found,
      found,
      JSON.stringify({
        title: `Chair ${id}`,
        price,
        category: "Fancy",
        hunt: "Seats",
        location: "Hiveton",
        source: "made-up-board",
        ...extra,
      }),
    );
  const before = "2026-11-20T10:00:00.000Z";
  for (const [id, price] of [
    ["o1", 800],
    ["o2", 900],
    ["o3", 1000],
    ["o4", 1100],
  ] as const)
    deal(id, price, before);
  const run = { started: "2026-11-23T10:00:00.000Z" };
  deal("n1", 500, run.started); // 56% of the usual (every ad of the model counts, as on the cards): great
  deal("n2", 900, run.started); // about the usual
  deal("n3", 450, run.started, { leftOut: "the title says broken" }); // set aside by the rules
  deal("o5", 300, before); // great, but found before this run
  return { base, db, run };
}

test("a run's great deals: new, in view, at 65% of the usual or under; the ping names the best and opens it", () => {
  const { db, run } = setup();
  const deals = greatDeals(db, { id: "fancy-board", hunt: "Seats" }, run);
  assert.deepEqual(
    deals.map((d) => [d.id, d.price, d.pct]),
    [["n1", 500, 56]],
  );
  const a = dealAlert(deals, "Seats", "https://made-up.example:8790");
  assert.equal(a.title, "Great deal: Fancy $500");
  assert.match(a.message, /^Fancy · \$500, 56% of the usual \$900 · Hiveton · made-up-board\nChair n1$/);
  assert.equal(a.click, "https://made-up.example:8790/searches?hunt=deals%3ASeats&open=n1");
});

test("a ping goes to the channel read from its file; without the setting or the file, nothing is sent", async () => {
  const { base } = setup();
  const got: Record<string, unknown>[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      got.push(JSON.parse(body) as Record<string, unknown>);
      res.end("{}");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const topicFile = join(base, "topic-deals");
  writeFileSync(topicFile, "made-up-topic\n");
  const settings = (alerts?: Settings["alerts"]) => ({ alerts }) as Settings;
  const ping = {
    channel: "deals" as const,
    title: "Great deal: Fancy $500",
    message: "Fancy · $500",
    click: "https://x",
  };
  assert.deepEqual(await sendAlert(settings(), ping), { sent: false, why: "no alert channel set" });
  assert.equal(
    (await sendAlert(settings({ url, topics: { deals: join(base, "gone") }, page: "" }), ping)).why,
    "the channel's file can't be read",
  );
  assert.deepEqual(await sendAlert(settings({ url, topics: { deals: topicFile }, page: "" }), ping), {
    sent: true,
    why: "",
  });
  server.close();
  assert.deepEqual(got, [
    { topic: "made-up-topic", title: "Great deal: Fancy $500", message: "Fancy · $500", click: "https://x" },
  ]);
});
