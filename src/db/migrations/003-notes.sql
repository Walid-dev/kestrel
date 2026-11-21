-- My notes: on some words (the quote, with a little text each side so it finds its place again) or on the whole
-- document (an empty quote). Where the words were when the note was made helps pick between repeats.
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  quote TEXT NOT NULL DEFAULT '',
  prefix TEXT NOT NULL DEFAULT '',
  suffix TEXT NOT NULL DEFAULT '',
  start INTEGER,
  text TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'done')),
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX notes_document ON notes (document_id);
