// The collector: every source read, four at a time, and what each brought kept, each link once with every source that
// carried it (the same article from Techmeme and from CNBC is one item, told twice). Each source's health is kept
// with it: the last good read, the last failure's reason, since when it has been down. It runs every two hours between
// briefs, since several feeds hold less than a day (one keeps about five hours), and again at the start of each
// brief. No model here: plain reads of public feeds.
import type { DatabaseSync } from "node:sqlite";
import { type FeedItem, type FeedNet, type FeedRead, readFeed } from "../../ai/news/feeds.ts";
import { tx } from "../../db/db.ts";
import { type Source, spec } from "./sources.ts";

export type Gathered = {
  sources: number;
  read: number;
  failed: { id: string; name: string; why: string }[];
  added: number;
};

// how a source is read: the network by default, made-up feeds in the tests
export type Reader = (
  s: Source,
  prev: { etag: string | null; lastModified: string | null },
  now: Date,
) => Promise<FeedRead>;
export const networkReader =
  (net: FeedNet = {}): Reader =>
  (s, prev, now) =>
    readFeed(spec(s), prev, now, net);

const OLDEST_DAYS = 4; // an item older than this is no morning's news: it isn't kept
const KEEP_DAYS = 30; // items are kept a month, then go

// a few at a time, in order, each answer at its own place
export async function pool<T, R>(list: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(list.length);
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      out[i] = await fn(list[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, worker));
  return out;
}

export async function gather(
  db: DatabaseSync,
  sources: Source[],
  now: Date,
  read: Reader = networkReader(),
): Promise<Gathered> {
  const on = sources.filter((s) => s.enabled);
  const health = db.prepare("SELECT etag, last_modified FROM news_sources WHERE id = ?");
  const results = await pool(on, 4, async (s) => {
    const prev = health.get(s.id) as { etag: string | null; last_modified: string | null } | undefined;
    try {
      return await read(s, { etag: prev?.etag ?? null, lastModified: prev?.last_modified ?? null }, now);
    } catch {
      return { ok: false, why: "the read failed" } as FeedRead; // a reader never throws; this one did
    }
  });
  let added = 0;
  const failed: Gathered["failed"] = [];
  const at = now.toISOString();
  on.forEach((s, i) => {
    const got = results[i];
    if (got.ok) {
      added += keep(db, s, got.items, now);
      db.prepare(
        `INSERT INTO news_sources (id, last_try, last_ok, last_error, down_since, seen, etag, last_modified)
         VALUES (?, ?, ?, '', NULL, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET last_try = excluded.last_try, last_ok = excluded.last_ok, last_error = '',
           down_since = NULL, seen = CASE WHEN ? THEN news_sources.seen ELSE excluded.seen END,
           etag = excluded.etag, last_modified = excluded.last_modified`,
      ).run(s.id, at, at, got.items.length, got.etag, got.lastModified, got.unchanged ? 1 : 0);
    } else {
      failed.push({ id: s.id, name: s.name, why: got.why });
      db.prepare(
        `INSERT INTO news_sources (id, last_try, last_error, down_since) VALUES (?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET last_try = excluded.last_try, last_error = excluded.last_error,
           down_since = COALESCE(news_sources.down_since, excluded.down_since)`,
      ).run(s.id, at, got.why, at);
    }
  });
  db.prepare("DELETE FROM news_items WHERE first_seen < ?").run(
    new Date(now.getTime() - KEEP_DAYS * 86_400_000).toISOString(),
  );
  return { sources: on.length, read: on.length - failed.length, failed, added };
}

// one source's items, each link once: a link already kept gains this source (and the points, the thread, a summary
// or a date it lacked); a new one is kept with the time it was first seen. Returns how many were new
export function keep(db: DatabaseSync, s: Source, items: FeedItem[], now: Date): number {
  const oldest = now.getTime() - OLDEST_DAYS * 86_400_000;
  const seen = now.toISOString();
  const get = db.prepare("SELECT sources FROM news_items WHERE url = ?");
  const add = db.prepare(
    `INSERT INTO news_items (url, sources, title, summary, published, first_seen, at, score, thread, thread_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const more = db.prepare(
    `UPDATE news_items SET sources = ?, score = COALESCE(?, score), thread = COALESCE(thread, ?),
       thread_by = COALESCE(thread_by, ?), summary = CASE WHEN summary = '' THEN ? ELSE summary END,
       published = COALESCE(published, ?), at = CASE WHEN published IS NULL AND ? IS NOT NULL THEN ? ELSE at END
     WHERE url = ?`,
  );
  let added = 0;
  tx(db, () => {
    for (const i of items) {
      if (i.published && Date.parse(i.published) < oldest) continue;
      const by = i.thread ? s.id : null;
      const row = get.get(i.url) as { sources: string } | undefined;
      if (!row) {
        add.run(
          i.url,
          JSON.stringify([s.id]),
          i.title,
          i.summary,
          i.published,
          seen,
          i.published ?? seen,
          i.score,
          i.thread,
          by,
        );
        added++;
        continue;
      }
      const list = JSON.parse(row.sources) as string[];
      if (!list.includes(s.id)) list.push(s.id);
      more.run(JSON.stringify(list), i.score, i.thread, by, i.summary, i.published, i.published, i.published, i.url);
    }
  });
  return added;
}

// when the feeds were last read, by the collector or a brief; null before the first read
export function lastRead(db: DatabaseSync): string | null {
  return (db.prepare("SELECT MAX(last_try) AS at FROM news_sources").get() as { at: string | null }).at;
}
