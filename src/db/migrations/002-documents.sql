-- Documents Notes works on: a file from my folders (path kept, text cached) or an upload (text is the original).
-- How the bytes looked (BOM, line endings, final newline, their hash) is kept so saving changes nothing else.
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('file', 'upload')),
  name TEXT NOT NULL,
  path TEXT,
  text TEXT NOT NULL,
  bom INTEGER NOT NULL DEFAULT 0,
  eol TEXT NOT NULL DEFAULT 'lf' CHECK (eol IN ('lf', 'crlf')),
  final_newline INTEGER NOT NULL DEFAULT 1,
  sha256 TEXT NOT NULL,
  added_at TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX documents_path ON documents (path) WHERE path IS NOT NULL;
