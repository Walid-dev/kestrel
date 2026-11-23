-- A quiz as I take it, kept: its questions, my answers with their marks, and the question I'm on. Leaving loses
-- nothing; a started quiz waits on the quiz page to be continued.
CREATE TABLE quizzes (
  id TEXT PRIMARY KEY,
  area TEXT NOT NULL CHECK (area IN ('learn', 'interview')),
  scope TEXT NOT NULL DEFAULT '',
  items TEXT NOT NULL,
  answers TEXT NOT NULL,
  place INTEGER NOT NULL DEFAULT 0,
  started TEXT NOT NULL,
  updated TEXT NOT NULL,
  finished TEXT
) STRICT;
CREATE INDEX quizzes_updated ON quizzes (updated);
