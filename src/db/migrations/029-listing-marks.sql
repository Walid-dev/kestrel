-- My marks made here are kestrel's: mine holds when I last set each one here, as JSON ({"status": "<iso>",
-- "starred": "<iso>", "note": "<iso>", "deleted": "<iso>"}). The mirror keeps a field I marked as it is here
-- (domain/search/import-v1.ts says which of the old setup's own stages still arrive); '{}' is a listing I never marked
-- here, which follows the old database.
ALTER TABLE listings ADD COLUMN mine TEXT NOT NULL DEFAULT '{}';
-- A listing deleted: out of listings, so no view, count, find or Ask's page holds it, and kept whole here so it can
-- come back. A run here and the mirror look here first (its id, or its search with its link or dedupe key) and never
-- land it again. row: its columns as they were, as JSON; by: who deleted it (me here, or the old setup, which the
-- mirror follows for a job I never marked here); at: when.
CREATE TABLE listings_deleted (
  id TEXT PRIMARY KEY,
  search TEXT NOT NULL,
  link TEXT NOT NULL,
  dedupe TEXT NOT NULL,
  kind TEXT NOT NULL,
  row TEXT NOT NULL,
  by TEXT NOT NULL CHECK (by IN ('me', 'old')),
  at TEXT NOT NULL
) STRICT;
CREATE INDEX listings_deleted_dedupe ON listings_deleted (search, dedupe);
CREATE INDEX listings_deleted_link ON listings_deleted (search, link);
