-- Applications: kestrel owns the queue and the record; the agent is the hands. Every stopped application is counted,
-- whatever happens to its listing.
CREATE TABLE applications (
  id TEXT PRIMARY KEY,
  listing TEXT,
  link TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  org TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL CHECK (state IN ('queued', 'applying', 'needs-me', 'sent', 'not-sent')),
  reason TEXT NOT NULL DEFAULT '',
  agent TEXT NOT NULL DEFAULT '',
  started TEXT NOT NULL,
  updated TEXT NOT NULL
) STRICT;
CREATE INDEX applications_state ON applications (state, updated);
