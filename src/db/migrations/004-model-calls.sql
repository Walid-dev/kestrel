-- Every model call, recorded by the domain: what ran, for what, how long, and how it ended.
CREATE TABLE model_calls (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  model TEXT NOT NULL,
  purpose TEXT NOT NULL,
  ms INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  tokens_in INTEGER,
  tokens_out INTEGER
) STRICT;
