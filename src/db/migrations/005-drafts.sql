-- A draft: one ask about one or more documents, kept until I save or discard it, whatever happens to the app
-- meanwhile. The answer is the model's; the placements are the code's.
CREATE TABLE drafts (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('making', 'ready', 'failed')),
  model TEXT NOT NULL,
  request TEXT NOT NULL,
  answer TEXT,
  placed TEXT,
  error TEXT NOT NULL DEFAULT ''
) STRICT;
