-- A listing's kind (a job or a deal) decides its card and its identity; the runs and the import set it.
ALTER TABLE listings ADD COLUMN kind TEXT NOT NULL DEFAULT 'jobs' CHECK (kind IN ('jobs', 'deals'));
CREATE INDEX listings_kind ON listings (kind, found);
-- Deep checks: the local model's longer look at one listing, step by step, its report kept.
CREATE TABLE deep_checks (
  id TEXT PRIMARY KEY,
  listing TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('running', 'done', 'failed')),
  step TEXT NOT NULL DEFAULT '',
  started TEXT NOT NULL,
  finished TEXT,
  report TEXT,
  error TEXT NOT NULL DEFAULT ''
) STRICT;
CREATE INDEX deep_checks_listing ON deep_checks (listing, started);
