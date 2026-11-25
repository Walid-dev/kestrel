// Stars on News, on an in-memory database with made-up briefs: a star keeps a copy of its story, once; it outlives its
// day's deletion and its brief's replacement (then it opens as the copy, not the day); the newest starred comes
// first; a story past a brief's last, or of a brief not written, can't be starred; the page and the days list count
// them.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../../db/migrate.ts";
import { NewsSettings, Settings } from "../../platform/config.ts";
import type { NewsBrief, NewsStory } from "../../shared/news.ts";
import { newsState } from "./brief.ts";
import { daysKept, deleteDay, newsDays } from "./days.ts";
import { listStars, starStory, unstarStory } from "./stars.ts";

function memory() {
  const db = new DatabaseSync(":memory:");
  migrate(db, ":memory:");
  return db;
}
const story = (headline: string): NewsStory => ({
  section: "models",
  headline,
  text: `${headline}, in a few made-up sentences.`,
  figure: "2×",
  trend: "up",
  links: [
    {
      url: "https://lab.example.org/brew-3",
      host: "lab.example.org",
      title: headline,
      source: "LAB",
      paywall: false,
      score: null,
      thread: null,
      threadBy: "",
      at: "2026-11-23T05:00:00.000Z",
    },
  ],
  unsure: false,
});
const brief = (...headlines: string[]): NewsBrief => ({ opening: [], stories: headlines.map(story), quiet: "" });
function run(db: DatabaseSync, id: string, day: string, b: NewsBrief | null, at = "08:01", state = "done") {
  db.prepare("INSERT INTO news_briefs (id, day, state, started, brief) VALUES (?, ?, ?, ?, ?)").run(
    id,
    day,
    state,
    `${day}T${at}:00.000Z`,
    b ? JSON.stringify(b) : null,
  );
}
const at = (minute: number) => new Date(Date.UTC(2026, 10, 24, 9, minute));
const settings = Settings.parse({ tailscaleLogin: "made-up-login", news: NewsSettings.parse({ enabled: false }) });

test("a star keeps its story's copy, once; it outlives the day's delete and a rewrite; the newest starred first", () => {
  const db = memory();
  run(db, "b23", "2026-11-23", brief("Brew 3 answers twice as fast", "Kettle raises a made-up fortune"));
  run(db, "b24", "2026-11-24", brief("Teapot ships a made-up chip", "Spout opens its model", "A third story"));
  // a story past the brief's last, a brief still written, one that failed, one that isn't there: no star
  run(db, "w", "2026-11-25", null, "08:00", "running");
  run(db, "f", "2026-11-22", null, "08:00", "failed");
  for (const [id, n] of [
    ["b24", 4],
    ["w", 1],
    ["f", 1],
    ["nowhere", 1],
  ] as const)
    assert.equal(starStory(db, id, n, at(0)), false);
  assert.deepEqual(listStars(db), []);

  assert.equal(starStory(db, "b23", 1, at(1)), true);
  assert.equal(starStory(db, "b24", 2, at(2)), true);
  assert.equal(starStory(db, "b24", 3, at(3)), true);
  // starred again: it keeps its first time, so it doesn't jump to the top
  assert.equal(starStory(db, "b23", 1, at(4)), true);
  assert.deepEqual(
    listStars(db).map((s) => `${s.day} s${s.n} ${s.story.headline} ${s.shown}`),
    [
      "2026-11-24 s3 A third story true",
      "2026-11-24 s2 Spout opens its model true",
      "2026-11-23 s1 Brew 3 answers twice as fast true",
    ],
  );
  // the page knows which of its stories are starred, and its day's count; the days list counts each day's and all
  assert.deepEqual(newsState(db, settings, "2026-11-24").starred, [false, true, true]);
  assert.equal(newsState(db, settings, "2026-11-24").dayStars, 2);
  assert.deepEqual(
    newsDays(db).map((d) => [d.day, d.starred]),
    [
      ["2026-11-24", 2],
      ["2026-11-23", 1],
    ],
  );
  assert.equal(daysKept(db).starred, 3);

  // the 23rd deleted: its star stays, the whole story with it, and opens as the copy now
  assert.equal(deleteDay(db, "2026-11-23"), 1);
  const kept = listStars(db).find((s) => s.brief === "b23");
  assert.deepEqual(kept?.story, story("Brew 3 answers twice as fast"));
  assert.equal(kept?.shown, false);
  assert.deepEqual(daysKept(db), { total: 1, since: "2026-11-24", starred: 3 });
  // Make it now writes the 24th again: its stars stay, on the brief no page shows now
  run(db, "b24-again", "2026-11-24", brief("A rewritten story"), "13:05");
  assert.deepEqual(
    listStars(db).map((s) => s.shown),
    [false, false, false],
  );
  assert.deepEqual(newsState(db, settings, "2026-11-24").starred, [false]);
  assert.equal(newsState(db, settings, "2026-11-24").dayStars, 2); // the day's delete would keep these two

  // unstarred, from the story or the list: its copy goes; once more, nothing to take off
  assert.equal(unstarStory(db, "b23", 1), true);
  assert.equal(unstarStory(db, "b23", 1), false);
  assert.deepEqual(
    listStars(db).map((s) => `${s.brief}:${s.n}`),
    ["b24:3", "b24:2"],
  );
});
