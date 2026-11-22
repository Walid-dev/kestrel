-- Research: a question, its level (quick or deep), and the report the local model wrote from the web pages it read.
CREATE TABLE research (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('quick', 'deep')),
  state TEXT NOT NULL CHECK (state IN ('running', 'done', 'failed')),
  step TEXT NOT NULL DEFAULT '',
  started TEXT NOT NULL,
  finished TEXT,
  report TEXT,
  error TEXT NOT NULL DEFAULT ''
) STRICT;
CREATE INDEX research_started ON research (started);
-- Quiz: each answer I gave and how the model judged it, so a quiz can bring back what I missed.
CREATE TABLE quiz_answers (
  id TEXT PRIMARY KEY,
  lesson TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('right', 'partly', 'wrong')),
  at TEXT NOT NULL
) STRICT;
CREATE INDEX quiz_answers_lesson ON quiz_answers (lesson, at);
-- Cover letters: each try at a letter for a job, written the way an application writes it; its words, what the
-- check said, and its own folder (the PDF, the voice as it was) in the data folder.
CREATE TABLE letters (
  id TEXT PRIMARY KEY,
  listing TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL CHECK (state IN ('running', 'done', 'failed')),
  step TEXT NOT NULL DEFAULT '',
  started TEXT NOT NULL,
  finished TEXT,
  text TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '{}',
  error TEXT NOT NULL DEFAULT ''
) STRICT;
CREATE INDEX letters_listing ON letters (listing, started);
