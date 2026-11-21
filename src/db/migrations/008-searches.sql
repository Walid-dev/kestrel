-- Searches: the listings a run keeps, and the runs themselves. The data JSON carries the old setup's shape, so the
-- import is lossless; statuses are its vocabulary unchanged. starred is three-valued: 1 by hand, 0 unstarred by
-- hand, NULL automatic (a great match sits in Priority until set aside).
CREATE TABLE listings (
  id TEXT PRIMARY KEY,
  search TEXT NOT NULL,
  source TEXT NOT NULL,
  link TEXT NOT NULL,
  dedupe TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (
    status IN ('new', 'interested', 'maybe', 'applied', 'interviewing', 'offer', 'rejected', 'passed', 'fake', 'closed')
  ),
  starred INTEGER,
  found TEXT NOT NULL,
  updated TEXT NOT NULL,
  score INTEGER,
  match TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL DEFAULT '{}',
  UNIQUE (search, dedupe)
) STRICT;
CREATE INDEX listings_status ON listings (status);
CREATE INDEX listings_link ON listings (link);
CREATE TABLE search_runs (
  id TEXT PRIMARY KEY,
  search TEXT NOT NULL,
  started TEXT NOT NULL,
  ms INTEGER NOT NULL,
  found INTEGER NOT NULL,
  kept INTEGER NOT NULL,
  problem TEXT NOT NULL DEFAULT ''
) STRICT;
CREATE INDEX search_runs_search ON search_runs (search, started);
