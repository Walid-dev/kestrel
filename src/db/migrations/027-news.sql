-- The morning news (src/domain/news/): what the feeds brought, each link once with every source that carried it; each
-- source's health; each brief with its state, kept for good; and the links a brief used, so the next one tells only
-- what is new.
-- at: when the item happened, its feed's date, or when it was first seen when the feed gave none (or a future one)
CREATE TABLE news_items (
  url TEXT PRIMARY KEY,
  sources TEXT NOT NULL DEFAULT '[]',
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  published TEXT,
  first_seen TEXT NOT NULL,
  at TEXT NOT NULL,
  score INTEGER,
  thread TEXT,
  thread_by TEXT
) STRICT;
CREATE INDEX news_items_at ON news_items (at);
CREATE INDEX news_items_seen ON news_items (first_seen);
-- down_since: the first failure of the current run of failures, cleared by the next good read
CREATE TABLE news_sources (
  id TEXT PRIMARY KEY,
  last_try TEXT,
  last_ok TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  down_since TEXT,
  seen INTEGER NOT NULL DEFAULT 0,
  etag TEXT,
  last_modified TEXT
) STRICT;
-- day: the local day the brief is for; phase: the step it is on (0 to 4); steps: what each step said, for the page
CREATE TABLE news_briefs (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('running', 'done', 'failed')),
  phase INTEGER NOT NULL DEFAULT 0,
  step TEXT NOT NULL DEFAULT '',
  steps TEXT NOT NULL DEFAULT '[]',
  started TEXT NOT NULL,
  finished TEXT,
  brief TEXT,
  meta TEXT,
  error TEXT NOT NULL DEFAULT ''
) STRICT;
CREATE INDEX news_briefs_started ON news_briefs (started);
CREATE INDEX news_briefs_day ON news_briefs (day, started);
CREATE TABLE news_used (
  url TEXT NOT NULL,
  brief TEXT NOT NULL,
  PRIMARY KEY (url, brief)
) STRICT;
