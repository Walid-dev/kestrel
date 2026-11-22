// The morning brief: what waits, in plain sentences. Composed from the database alone, so it answers fast and
// says nothing it cannot count.
import type { DatabaseSync } from "node:sqlite";

const count = (db: DatabaseSync, sql: string, ...args: string[]): number =>
  (db.prepare(sql).get(...args) as { n: number }).n;

export function morningBrief(db: DatabaseSync, now: Date): string[] {
  const lines: string[] = [];
  const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const great = count(
    db,
    "SELECT COUNT(*) AS n FROM listings WHERE found >= ? AND match = 'great' AND status = 'new'",
    since,
  );
  if (great) lines.push(`${great} great ${great === 1 ? "match" : "matches"} arrived since yesterday.`);
  const priority = count(
    db,
    "SELECT COUNT(*) AS n FROM listings WHERE starred = 1 OR (starred IS NULL AND match = 'great' AND status NOT IN ('passed', 'fake'))",
  );
  if (priority) lines.push(`The Priority list holds ${priority}.`);
  const needsMe = count(db, "SELECT COUNT(*) AS n FROM applications WHERE state = 'needs-me'");
  if (needsMe) lines.push(`${needsMe} application${needsMe === 1 ? " waits" : "s wait"} on me.`);
  const queued = count(db, "SELECT COUNT(*) AS n FROM applications WHERE state = 'queued'");
  if (queued) lines.push(`${queued} ${queued === 1 ? "is" : "are"} queued to apply.`);
  // like the old Learn's "to review today": lessons in Learn whose review date has come, not every unread one
  const due = count(
    db,
    `SELECT COUNT(*) AS n FROM reviews r JOIN lessons l ON l.id = r.lesson JOIN packs p ON p.id = l.pack
     WHERE r.due <= ? AND p.area = 'learn'`,
    now.toISOString(),
  );
  if (due) lines.push(`${due} lesson${due === 1 ? " is" : "s are"} up for review today.`);
  const tasks = count(db, "SELECT COUNT(*) AS n FROM tasks WHERE done = 0");
  if (tasks) lines.push(`${tasks} task${tasks === 1 ? " stays" : "s stay"} open.`);
  if (lines.length === 0) lines.push("Nothing waits. A quiet morning.");
  return lines;
}
