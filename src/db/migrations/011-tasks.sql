-- Tasks: one line each, for me or for an agent, closed with a short note of what was done.
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  who TEXT NOT NULL DEFAULT '',
  done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  note TEXT NOT NULL DEFAULT '',
  added TEXT NOT NULL,
  closed TEXT
) STRICT;
CREATE INDEX tasks_open ON tasks (done, added);
