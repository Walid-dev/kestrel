// Stars on News: a story I want to keep, starred from its card. A star takes a copy of the story as its brief told it
// (the headline, the text, the section, the figure, the links), with its day and its brief, so it stays when the day
// is deleted. All days' Starred lists them, the newest starred first; each opens its day at the story while that
// day's page still shows its brief (not deleted, not replaced by Make it now), else the copy itself.
import type { DatabaseSync } from "node:sqlite";
import type { NewsBrief, NewsStar, NewsStory } from "../../shared/news.ts";

// a story starred: its copy is taken now, once (starred again, it keeps its first time and copy). False when the
// brief has no such story: a number past its last, or a brief still being written or failed
export function starStory(db: DatabaseSync, brief: string, n: number, now = new Date()): boolean {
  const row = db.prepare("SELECT day, brief FROM news_briefs WHERE id = ? AND state = 'done'").get(brief) as
    | { day: string; brief: string | null }
    | undefined;
  const story = row?.brief ? (JSON.parse(row.brief) as NewsBrief).stories[n - 1] : undefined;
  if (!row || !story) return false;
  db.prepare("INSERT OR IGNORE INTO news_stars (brief, n, day, story, starred) VALUES (?, ?, ?, ?, ?)").run(
    brief,
    n,
    row.day,
    JSON.stringify(story),
    now.toISOString(),
  );
  return true;
}

// a star taken off, its copy with it. False when that story wasn't starred
export function unstarStory(db: DatabaseSync, brief: string, n: number): boolean {
  return Number(db.prepare("DELETE FROM news_stars WHERE brief = ? AND n = ?").run(brief, n).changes) > 0;
}

// every star, the newest starred first; shown: its brief is still the one its day's page shows (that day's newest
// written, as days.ts reads it), so it opens there
export function listStars(db: DatabaseSync): NewsStar[] {
  return (
    db
      .prepare(
        `SELECT s.brief, s.n, s.day, s.story, s.starred,
                s.brief = (SELECT b.id FROM news_briefs b WHERE b.day = s.day AND b.state = 'done'
                           ORDER BY b.started DESC LIMIT 1) AS shown
         FROM news_stars s ORDER BY s.starred DESC, s.rowid DESC`,
      )
      .all() as { brief: string; n: number; day: string; story: string; starred: string; shown: number | null }[]
  ).map((r) => ({
    brief: r.brief,
    n: r.n,
    day: r.day,
    starred: r.starred,
    shown: r.shown === 1,
    story: JSON.parse(r.story) as NewsStory,
  }));
}

// which of a brief's stories are starred, in their order (each card's star), and how many stories of its day are
// starred in all (an earlier brief's too): a day's delete says they stay
export function starsOn(
  db: DatabaseSync,
  brief: string,
  day: string,
  stories: number,
): { starred: boolean[]; dayStars: number } {
  const on = new Set(
    (db.prepare("SELECT n FROM news_stars WHERE brief = ?").all(brief) as { n: number }[]).map((r) => r.n),
  );
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM news_stars WHERE day = ?").get(day) as { n: number };
  return { starred: Array.from({ length: stories }, (_, i) => on.has(i + 1)), dayStars: n };
}
