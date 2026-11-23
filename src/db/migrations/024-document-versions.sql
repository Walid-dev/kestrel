-- Every save of a document keeps the words it replaced, so any earlier version can come back (Notes' Versions; my
-- voice and stories are edited there since 2026-11-23). Undo still takes back the last save in one tap.
CREATE TABLE document_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  saved_at TEXT NOT NULL
) STRICT;
CREATE INDEX document_versions_doc ON document_versions (document_id, saved_at);
