// The days kept, on an in-memory database with made-up briefs: the history pages past the rail's 60 days and shows
// each day's newest brief; the find reads every word in a headline or a story's text, in any case, a % or a quote as
// itself, at most 50, never from a failed run or a brief a later one replaced; a day deleted takes every run of it,
// the links they told (so they may be told again) and their stories' questions, and nothing else, and waits while a
// run of that day is written or Ask answers there.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../../db/migrate.ts";
import { NewsSettings } from "../../platform/config.ts";
import type { NewsBrief, NewsStory, Section } from "../../shared/news.ts";
import { briefDue, itemsWindow } from "./brief.ts";
import { daysKept, deleteDay, findStories, newsDays } from "./days.ts";
import { Source } from "./sources.ts";

function memory() {
  const db = new DatabaseSync(":memory:");
  migrate(db, ":memory:");
  return db;
}
const story = (headline: string, text = "It happened.", section: Section = "money"): NewsStory => ({
  section,
  headline,
  text,
  figure: "",
  trend: "none",
  links: [],
  unsure: false,
});
const brief = (...stories: NewsStory[]): NewsBrief => ({ opening: ["A made-up day."], stories, quiet: "" });
// one run of a day's brief, started at 06:31 that day unless said
function run(db: DatabaseSync, id: string, day: string, state: string, b: NewsBrief | null, at = "06:31") {
  db.prepare("INSERT INTO news_briefs (id, day, state, started, brief) VALUES (?, ?, ?, ?, ?)").run(
    id,
    day,
    state,
    `${day}T${at}:00.000Z`,
    b ? JSON.stringify(b) : null,
  );
}
const dayAfter = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

test("the history pages past the rail's 60 days: each day's newest brief, a quiet one too, a failed one never", () => {
  const db = memory();
  for (let i = 0; i < 75; i++) {
    const day = dayAfter("2026-09-01", i);
    run(
      db,
      `b${i}`,
      day,
      "done",
      day === "2026-09-10"
        ? { opening: [], stories: [], quiet: "A quiet morning." }
        : brief(story(`Made-up lead of ${day}`)),
    );
  }
  // Make it now on the newest day: the day shows the later brief
  run(db, "later", "2026-11-14", "done", brief(story("The rewrite's lead"), story("Two")), "13:05");
  run(db, "failed", "2026-11-20", "failed", null);
  const first = newsDays(db, 60);
  assert.equal(first.length, 60);
  assert.deepEqual(first[0], { id: "later", day: "2026-11-14", stories: 2, lead: "The rewrite's lead" });
  const rest = newsDays(db, 60, first.at(-1)?.day);
  assert.equal(rest.length, 15);
  assert.equal(rest.at(-1)?.day, "2026-09-01");
  assert.deepEqual(
    rest.find((d) => d.day === "2026-09-10"),
    { id: "b9", day: "2026-09-10", stories: 0, lead: "A quiet morning." },
  );
  assert.equal(new Set([...first, ...rest].map((d) => d.day)).size, 75);
  assert.deepEqual(daysKept(db), { total: 75, since: "2026-09-01" });
});

test("the find: every word in a headline or a story's text, any case; a % _ or quote is itself; the newest 50", () => {
  const db = memory();
  run(
    db,
    "a",
    "2026-11-24",
    "done",
    brief(
      story("Kettle maker raises $2bn", "It sold 100% of its shares."),
      story('Lab says "agents" write 30% of its code', "Its run_tests tool helps.", "building"),
      story("O'Neil's ÉCOLE opens", "Its files live in C:\\made-up\\path.", "tech"),
    ),
  );
  // a brief Make it now replaced, and a failed run: neither is any page's, so neither is found
  run(db, "b-old", "2026-11-23", "done", brief(story("Teapot words from the morning")));
  run(db, "b-new", "2026-11-23", "done", brief(story("Teapot shares rise")), "13:05");
  run(db, "c", "2026-11-22", "failed", brief(story("Kettle from a run that failed")));
  const found = (words: string) => findStories(db, words).found.map((f) => `${f.day} s${f.n} ${f.section}`);
  assert.deepEqual(found("KETTLE"), ["2026-11-24 s1 money"]);
  assert.deepEqual(found("kettle SHARES"), ["2026-11-24 s1 money"]); // one word in the headline, one in the text
  assert.deepEqual(found('"agents"'), ["2026-11-24 s2 building"]);
  assert.deepEqual(found("%"), ["2026-11-24 s1 money", "2026-11-24 s2 building"]);
  assert.deepEqual(found("run_"), ["2026-11-24 s2 building"]);
  assert.deepEqual(found("_"), ["2026-11-24 s2 building"]);
  assert.deepEqual(found("o'neil's"), ["2026-11-24 s3 tech"]);
  assert.deepEqual(found("école"), ["2026-11-24 s3 tech"]); // an accented capital, in any case
  assert.deepEqual(found("c:\\made-up\\"), ["2026-11-24 s3 tech"]); // a backslash is itself
  // every word counts, however many: a ninth that isn't there finds nothing
  assert.deepEqual(found("kettle maker raises sold 100% of its shares"), ["2026-11-24 s1 money"]);
  assert.deepEqual(found("kettle maker raises sold 100% of its shares teapot"), []);
  assert.deepEqual(found("teapot"), ["2026-11-23 s1 money"]);
  assert.deepEqual(found("morning"), []);
  assert.deepEqual(found("   "), []);
  assert.equal(findStories(db, "teapot").found[0].headline, "Teapot shares rise");
  // sixty matches: the newest 50, newest day first, and more said
  for (let i = 0; i < 30; i++)
    run(
      db,
      `chip${i}`,
      dayAfter("2026-08-01", i),
      "done",
      brief(story(`Chip news ${i}`), story(`More chip news ${i}`)),
    );
  const many = findStories(db, "CHIP");
  assert.equal(many.found.length, 50);
  assert.equal(many.more, true);
  assert.deepEqual(
    many.found.slice(0, 3).map((f) => [f.day, f.n]),
    [
      ["2026-08-30", 1],
      ["2026-08-30", 2],
      ["2026-08-29", 1],
    ],
  );
  assert.equal(findStories(db, "chip 29").more, false);
});

const NOW = new Date(2026, 10, 24, 6, 35); // this computer's morning, in its own time zone
const WIRE = Source.parse({
  id: "wire",
  name: "Made-up wire",
  short: "WIRE",
  url: "https://wire.example.com/feed",
  topic: "money",
});

test("a day deleted: every run, the links they told and their stories' questions go, nothing else; it waits for work", () => {
  const db = memory();
  run(db, "x1", "2026-11-23", "done", brief(story("Morning one"), story("Morning two")));
  run(db, "x2", "2026-11-23", "done", brief(story("Rewrite one")), "13:05");
  run(db, "x3", "2026-11-23", "failed", null, "14:00");
  run(db, "y1", "2026-11-22", "done", brief(story("Another day")));
  const told = db.prepare("INSERT INTO news_used (url, brief) VALUES (?, ?)");
  told.run("https://wire.example.com/a", "x1");
  told.run("https://wire.example.com/b", "x2");
  told.run("https://wire.example.com/c", "y1");
  const asked = db.prepare(
    "INSERT INTO ask_messages (id, app, ref, role, text, state, at) VALUES (?, ?, ?, ?, 'Why?', 'done', '2026-11-23')",
  );
  asked.run("m1", "news", "x2:1", "me");
  asked.run("m2", "news", "x2:1", "model");
  asked.run("m3", "news", "x1:2", "me");
  asked.run("m4", "news", "y1:1", "me");
  asked.run("m5", "research", "x2:1", "me"); // another app's page that happens to share the ref
  run(db, "x10", "2026-11-21", "done", brief(story("A brief whose id starts as x1's")));
  asked.run("m6", "news", "x10:1", "me"); // x1's ref is x1:…, never x10:…
  // the link told on the 23rd, still new: no brief may tell it again while that day stands
  db.prepare(
    "INSERT INTO news_items (url, sources, title, first_seen, at) VALUES ('https://wire.example.com/a', '[\"wire\"]', 'Kettle maker grows', ?, ?)",
  ).run(NOW.toISOString(), new Date(NOW.getTime() - 3 * 3_600_000).toISOString());
  assert.deepEqual(itemsWindow(db, [WIRE], NOW).items, []);

  assert.equal(deleteDay(db, "2026-11-23"), 3);
  const left = (sql: string) => (db.prepare(sql).all() as Record<string, string>[]).map((r) => Object.values(r)[0]);
  assert.deepEqual(left("SELECT id FROM news_briefs ORDER BY id"), ["x10", "y1"]);
  assert.deepEqual(left("SELECT url FROM news_used"), ["https://wire.example.com/c"]);
  assert.deepEqual(left("SELECT id FROM ask_messages ORDER BY id"), ["m4", "m5", "m6"]);
  assert.deepEqual(
    itemsWindow(db, [WIRE], NOW).items.map((i) => i.url),
    ["https://wire.example.com/a"],
  );
  assert.equal(deleteDay(db, "2026-11-23"), 0); // gone: no such day

  // a run of the day being written: refused, and nothing goes
  run(db, "z1", "2026-11-24", "done", brief(story("Today")));
  run(db, "z2", "2026-11-24", "running", null, "09:00");
  assert.throws(() => deleteDay(db, "2026-11-24"), /being written/);
  assert.deepEqual(left("SELECT id FROM news_briefs WHERE day = '2026-11-24' ORDER BY id"), ["z1", "z2"]);
  // Ask answering on one of its stories: refused too, as Start over waits for it
  db.prepare("UPDATE ask_messages SET role = 'model', state = 'writing' WHERE id = 'm4'").run();
  assert.throws(() => deleteDay(db, "2026-11-22"), /still answering/);
  assert.deepEqual(left("SELECT id FROM news_briefs WHERE day = '2026-11-22'"), ["y1"]);
});

test("today deleted while the morning may still write it: refused, so it never comes back at the next minute", () => {
  const db = memory();
  const news = NewsSettings.parse({ enabled: true, time: "06:30", latestHour: 12 });
  const at = (h: number, m = 0) => new Date(2026, 10, 24, h, m); // this computer's own time
  run(db, "y", "2026-11-23", "done", brief(story("Yesterday")));
  // written at 06:31 this computer's time, as the scheduler would
  db.prepare("INSERT INTO news_briefs (id, day, state, started, brief) VALUES ('t', '2026-11-24', 'done', ?, ?)").run(
    at(6, 31).toISOString(),
    JSON.stringify(brief(story("Today"))),
  );
  for (const now of [at(5), at(8), at(11, 59)]) {
    assert.throws(() => deleteDay(db, "2026-11-24", { news, now }), /written again at once: delete it from 12:00/);
    assert.equal(briefDue(db, news, at(8)), false); // today's brief still stands, so none is due
  }
  // another day, the news off, or the morning over: deleted, and no brief is due for today after it
  assert.equal(deleteDay(db, "2026-11-23", { news, now: at(8) }), 1);
  assert.equal(deleteDay(db, "2026-11-24", { news, now: at(12) }), 1);
  assert.equal(briefDue(db, news, at(12)), false);
  run(db, "t2", "2026-11-24", "done", brief(story("Today again")));
  assert.equal(deleteDay(db, "2026-11-24", { news: { ...news, enabled: false }, now: at(8) }), 1);
});
