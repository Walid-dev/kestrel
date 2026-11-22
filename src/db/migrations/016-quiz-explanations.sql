-- A question's explanation, written once by the local model and kept: the next quiz shows it at once.
CREATE TABLE quiz_explanations (
  lesson TEXT NOT NULL,
  question TEXT NOT NULL,
  body TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL,
  PRIMARY KEY (lesson, question)
) STRICT;
