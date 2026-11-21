-- Learn: packs of lessons in one shape — say, explain, example, words, check. A prepared answer is a lesson whose
-- say lines are the answer. Reviews carry the spaced rhythm.
CREATE TABLE packs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'lesson-pack' CHECK (kind IN ('lesson-pack', 'answer-pack')),
  added_at TEXT NOT NULL
) STRICT;
CREATE TABLE lessons (
  id TEXT PRIMARY KEY,
  pack TEXT NOT NULL REFERENCES packs (id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '{}',
  added_at TEXT NOT NULL
) STRICT;
CREATE INDEX lessons_pack ON lessons (pack, position);
CREATE TABLE reviews (
  lesson TEXT PRIMARY KEY REFERENCES lessons (id) ON DELETE CASCADE,
  due TEXT NOT NULL,
  interval_days REAL NOT NULL DEFAULT 0,
  ease REAL NOT NULL DEFAULT 2.5
) STRICT;
