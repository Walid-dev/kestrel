// The days kept: each day's brief, listed a page at a time for the history; a story found again by its words; a day
// deleted on my word. A day shows its newest brief written (Make it now writes today's again; the earlier one stays
// in the database, but no page shows it), so the history and the find read that one only.
import type { DatabaseSync } from "node:sqlite";
import { tx } from "../../db/db.ts";
import type { NewsDay, NewsFind, NewsFound, Section } from "../../shared/news.ts";
import { Refused } from "../notes/documents.ts";

// the brief each day shows: its newest written
const SHOWN = `SELECT id FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY day ORDER BY started DESC) AS nth FROM news_briefs WHERE state = 'done'
) WHERE nth = 1`;

// each day's brief, newest day first, with its count and its first headline; a page at a time: before is the last
// day of the page above (the rail asks for its first few, the history for a hundred)
export function newsDays(db: DatabaseSync, limit = 60, before?: string): NewsDay[] {
  return (
    db
      .prepare(
        `SELECT b.id, b.day, json_array_length(b.brief, '$.stories') AS stories,
                json_extract(b.brief, '$.stories[0].headline') AS lead, json_extract(b.brief, '$.quiet') AS quiet
         FROM news_briefs b WHERE b.id IN (${SHOWN}) AND b.day < ?
         ORDER BY b.day DESC LIMIT ?`,
      )
      .all(before ?? "9999", limit) as {
      id: string;
      day: string;
      stories: number | null;
      lead: string | null;
      quiet: string | null;
    }[]
  ).map((r) => ({ id: r.id, day: r.day, stories: r.stories ?? 0, lead: r.lead ?? r.quiet ?? "" }));
}

// how many days have a brief, and the first of them
export function daysKept(db: DatabaseSync): { total: number; since: string | null } {
  const r = db
    .prepare("SELECT COUNT(DISTINCT day) AS total, MIN(day) AS since FROM news_briefs WHERE state = 'done'")
    .get() as { total: number; since: string | null };
  return { total: r.total, since: r.since };
}

export const FOUND_MAX = 50;

// a story found again: every word in its headline or its text, in any case, in the brief each day shows, newest day
// first. The words are compared as they are (a % or a quote is only itself), on the stories' decoded text, in
// JavaScript: SQLite's lower() knows only the 26 letters
export function findStories(db: DatabaseSync, words: string): NewsFind {
  const terms = [...new Set(words.toLowerCase().split(/\s+/).filter(Boolean))].slice(0, 8);
  const found: NewsFound[] = [];
  if (!terms.length) return { found, more: false };
  const stories = db
    .prepare(
      `SELECT b.day, s.key AS at, json_extract(s.value, '$.section') AS section,
              json_extract(s.value, '$.headline') AS headline, json_extract(s.value, '$.text') AS text
       FROM news_briefs b, json_each(b.brief, '$.stories') AS s
       WHERE b.id IN (${SHOWN}) ORDER BY b.day DESC, s.key`,
    )
    .iterate() as Iterable<{ day: string; at: number; section: Section; headline: string; text: string }>;
  for (const s of stories) {
    const told = `${s.headline}\n${s.text}`.toLowerCase();
    if (!terms.every((t) => told.includes(t))) continue;
    // the loop's end resets the statement, so the read it holds ends here too
    if (found.length === FOUND_MAX) return { found, more: true };
    found.push({ day: s.day, n: s.at + 1, section: s.section, headline: s.headline });
  }
  return { found, more: false };
}

// a day deleted, at once and whole: every run of it (the brief it shows, an earlier one Make it now replaced, the
// failed tries), the links they told (so one still new may be told again) and what Ask was asked about their
// stories. Refused while a run of that day is written (it would write into a day that is gone) and while Ask answers
// on one of its stories (as Start over waits for it). Says how many runs went: none, no such day
export function deleteDay(db: DatabaseSync, day: string): number {
  return tx(db, () => {
    const runs = db.prepare("SELECT id, state FROM news_briefs WHERE day = ?").all(day) as {
      id: string;
      state: string;
    }[];
    if (runs.some((r) => r.state === "running"))
      throw new Refused("that day's brief is being written: delete it once it is done");
    const mine = (id: string) => [id.length + 1, `${id}:`] as const; // a story's ref is "<brief id>:<its number>"
    const answering = db.prepare(
      "SELECT 1 FROM ask_messages WHERE app = 'news' AND state = 'writing' AND substr(ref, 1, ?) = ? LIMIT 1",
    );
    if (runs.some((r) => answering.get(...mine(r.id))))
      throw new Refused("the model is still answering a question on that day: wait for it");
    const told = db.prepare("DELETE FROM news_used WHERE brief = ?");
    const asked = db.prepare("DELETE FROM ask_messages WHERE app = 'news' AND substr(ref, 1, ?) = ?");
    for (const r of runs) {
      told.run(r.id);
      asked.run(...mine(r.id));
    }
    db.prepare("DELETE FROM news_briefs WHERE day = ?").run(day);
    return runs.length;
  });
}
